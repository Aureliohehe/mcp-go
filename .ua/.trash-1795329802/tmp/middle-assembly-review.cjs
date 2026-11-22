const fs=require('node:fs');
const path=require('node:path').posix;
const dir='.ua/intermediate/';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const scan=read(dir+'scan-result.json');
const graph=read(dir+'assembled-graph.json');
const facts=read('.ua/tmp/middle-import-facts.json');
const comments=fs.readFileSync('.ua/tmp/merge-report.log','utf8');
const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
const fileNodes=new Map(graph.nodes.filter(n=>!['function','class','module','concept'].includes(n.type)).map(n=>[n.filePath,n]));
const inventory=new Set(scan.files.map(f=>f.path));
if (fileNodes.size!==inventory.size || [...inventory].some(p=>!fileNodes.has(p))) throw Error('file coverage incomplete');
if (nodes.size!==graph.nodes.length) throw Error('duplicate node IDs');

const rootModule='github.com/mark3labs/mcp-go';
const packageFiles=new Map();
for (const [p,fact] of Object.entries(facts)) {
  if(p.endsWith('_test.go')) continue;
  const dir=path.dirname(p);
  const importPath=dir==='.'?rootModule:rootModule+'/'+dir;
  if(!packageFiles.has(importPath)) packageFiles.set(importPath,[]);
  packageFiles.get(importPath).push(p);
}
const key=(source,target,type)=>[source,target,type].join('\t');
const candidateKeys=new Set();
const fallbackMissingSource=new Set();
let representativeImports=0;
for(const [source,fact] of Object.entries(facts)){
  const sourceId=fileNodes.get(source).id;
  const scanTargets=new Set(scan.importMap[source]||[]);
  for(const imp of fact.Imports||[]){
    const physicalTargets=packageFiles.get(imp.Path);
    if(!physicalTargets) continue;
    const targets=physicalTargets.filter(p=>scanTargets.has(p));
    if(!targets.length){fallbackMissingSource.add(source+' → '+imp.Path);continue;}
    const alias=imp.Alias||facts[targets[0]].Package;
    const refs=new Set(fact.References[alias]||[]);
    let selected=targets.filter(dst=>facts[dst].Exports?.some(n=>refs.has(n)));
    if(!selected.length){
      const base=path.basename(imp.Path);
      const sorted=[...targets].sort((a,b)=>a.localeCompare(b));
      selected=[sorted.find(p=>path.basename(p)===base+'.go')||sorted[0]];
      representativeImports++;
    }
    for(const dest of selected) candidateKeys.add(key(sourceId,fileNodes.get(dest).id,'imports'));
  }
}
let crossBatchEdgesAdded=0;
const totalBefore=graph.edges.length;
let filteredTestImports=0, filteredOtherImports=0;
graph.edges=graph.edges.filter(edge=>{
  if(edge.type!=='imports') return true;
  const source=nodes.get(edge.source), target=nodes.get(edge.target);
  if(!source||!target) throw Error('dangling edge survived merge');
  if(!facts[source.filePath]||!facts[target.filePath]) return true;
  if (candidateKeys.has(key(source.id,target.id,'imports'))) return true;
  if(target.filePath.endsWith('_test.go')) filteredTestImports++; else filteredOtherImports++;
  return false;
});
const retained=new Set(graph.edges.map(e=>key(e.source,e.target,e.type)));
const add=(source,target,type,weight)=>{
  const id=key(source,target,type);
  if(retained.has(id))return false;
  if(!nodes.has(source)||!nodes.has(target))throw Error('invalid endpoints: '+id);
  retained.add(id);
  graph.edges.push({source,target,type,direction:'forward',weight});
  return true;
};
for(const id of candidateKeys){
  const [source,target,type]=id.split('\t');
  if(add(source,target,type,.7))crossBatchEdgesAdded++;
}
for(const [source,targets] of Object.entries(scan.importMap)){
  for (const target of targets){
    if(facts[source]&&facts[target]) continue;
    if (!fileNodes.has(source)||!fileNodes.has(target)) continue;
    if(add(fileNodes.get(source).id,fileNodes.get(target).id,'imports',.7))crossBatchEdgesAdded++;
  }
}
// Call sites checked against Go receiver types in the source.
const verification={
  'function:client/http_test.go:TestHTTPClient':{'SendNotificationToClient':47,'SendNotificationToAllClients':69},
  'function:examples/everything/main.go:handleSendNotification':{'SendNotificationToClient':398},
  'function:examples/everything/main.go:handleLongRunningOperationTool':{'SendNotificationToClient':435},
  'function:examples/in_process/main.go:NewMCPClient':{'Initialize':67},
  'function:mcptest/mcptest_test.go:TestServerWithTool':{'CallTool':41},
  'function:mcptest/mcptest_test.go:TestServerWithToolStructuredContent':{'CallTool':108},
  'function:mcptest/mcptest_test.go:TestListToolsWithHeader':{'Initialize':402,'ListToolsByPage':408},
  'function:mcptest/mcptest_test.go:TestSimulateClientInfo':{'CallTool':595}
};
let edgesRestored=0;
for(const m of comments.matchAll(/Edge (\S+) → (\S+) \(calls\): dropped/g)){
  const [,src,dst]=m;
  const split=dst.lastIndexOf(':');
  const symbol=dst.slice(split+1);
  const owner=dst.includes('server/session.go')?'MCPServer':'Client';
  const replacement=dst.slice(0,split+1)+owner+'.'+symbol;
  const node=nodes.get(src);
  const callSite=verification[src]?.[symbol];
  if(!callSite||!node||!nodes.has(replacement)||!fs.readFileSync(node.filePath,'utf8').split('\n')[callSite-1].includes('.'+symbol+'('))throw Error('unverified call '+m[0]);
  if(add(src,replacement,'calls',.8))edgesRestored++;
}
const missingValidatedImports=[...candidateKeys].filter(id=>!retained.has(id));
if (missingValidatedImports.length) throw Error('import coverage incomplete');
if(graph.edges.some(e=>!nodes.has(e.source)||!nodes.has(e.target))) throw Error('dangling edges');
const review={
  fixedSectionOk:true,nodesRecovered:0,edgesRestored,crossBatchEdgesAdded,typesRemapped:0,complexityRemapped:0,
  notes:[
    '447 个扫描文件均有唯一文件节点。',
    '10 条调用边的原始目标缺少 Go 方法接收者名称。按源码核对调用并将目标改为已有的 MCPServer 或 Client 方法节点。',
    'Go 包导入在扫描器中会展开为包目录中的所有文件。复核按导入路径、包别名和源码中引用的导出标识符保留直接关联，并排除无法成为导入来源的 Go 测试文件。',
    '对于无法定位到单个导出声明的 Go 包导入，在扫描数据提供候选文件时保留一个包代表文件。',
    '非 Go 文件之间的直接导入与文档关系保留。'
  ],
  fileCoverage:{scanned:inventory.size,represented:fileNodes.size},
  importReview:{sourceBackedGoFileLinks:candidateKeys.size,representativeImports,filteredTestImports,filteredOtherImports,missingFromScanner:[...fallbackMissingSource]},
  edgeCounts:{before:totalBefore,after:graph.edges.length}
};
fs.writeFileSync(dir+'assembled-graph.json.tmp',JSON.stringify(graph,null,2)+'\n');
fs.renameSync(dir+'assembled-graph.json.tmp',dir+'assembled-graph.json');
fs.writeFileSync(dir+'assemble-review.json',JSON.stringify(review,null,2)+'\n');
console.log(JSON.stringify(review,null,2));
