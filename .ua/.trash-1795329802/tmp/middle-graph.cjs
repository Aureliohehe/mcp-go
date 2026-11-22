const fs = require('node:fs');
const path = require('node:path').posix;
const {batches} = require('../intermediate/batches.json');
const inventory = new Map(batches.flatMap(b=>b.files).map(f=>[f.path,f]));
const summaries = new Map(fs.readFileSync('.ua/tmp/middle-summaries.tsv','utf8').trim().split('\n').map(line=>line.split('\t')));
const files = new Map();
const getSrc = p => {
  if (!files.has(p)) files.set(p,fs.readFileSync(p,'utf8'));
  return files.get(p);
};
const fileType = f => ({docs:'document',config:'config',infra:f.path.startsWith('.github/workflows/')?'pipeline':'service'}[f.fileCategory]||'file');
const fileId = f => fileType(f)+':'+f.path;
const topics = [
  [/\/transport\/oauth/,'OAuth'], [/\/transport\/streamable_http/,'Streamable HTTP'], [/\/transport\/sse/,'SSE'], [/\/transport\/stdio|stderr_buffer/,'标准输入输出'],
  [/\/transport\//,'客户端传输'], [/^mcp\//,'协议模型'], [/^e2e\//,'端到端测试'], [/^examples\//,'使用示例'], [/^otel\//,'可观测性'],
  [/^server\/internal\/gen/,'代码生成'], [/conformance/,'协议一致性'], [/^mcptest\//,'测试辅助'], [/^www\//,'文档网站']
];
const fileTopic = p => topics.find(([re])=>re.test(p))?.[1]||'项目维护';
const testFile = p => /_test\.(?:go|py)$|^scripts\/test_/.test(p);
const isExported = (n,r) => /^[A-Z]/.test(n)||r.exports?.some(e=>e.name===n);
function symbolSummary(n, owner, isClass, methods, fields, calls) {
  if (isClass) {
    if (fields.length) return '定义 '+n+' 的数据结构，包含 '+fields.slice(0,5).join('、')+' 等字段。';
    if (methods.length) return '定义 '+n+' 的接口或方法集合，包括 '+methods.slice(0,5).join('、')+'。';
    return '定义 '+n+' 类型。';
  }
  if (/^(Test|Benchmark)/.test(n)) return (/^Benchmark/.test(n)?'运行基准测试 ':'执行测试 ') + n+'。';
  const key = n.replace(/^[a-z]/,s=>s.toUpperCase());
  const verbs = {New:'构造', Parse:'解析', Decode:'解码', Encode:'编码', Marshal:'序列化', Unmarshal:'反序列化', Read:'读取', Write:'写入', Get:'读取', Set:'设置', Build:'构建', Start:'启动', Close:'关闭', Handle:'处理', Send:'发送', Validate:'验证', Register:'注册', Load:'加载', Save:'保存', Clear:'清除', Add:'添加', Find:'查找', Resolve:'解析', Refresh:'刷新', Detect:'检测', Is:'判断', With:'应用配置', Wrap:'封装', Generate:'生成', Extract:'提取', Inject:'注入', List:'列出'};
  const prefix = Object.keys(verbs).find(v=>key.startsWith(v));
  const leafCalls=[...new Set(calls.map(c=>c.callee).filter(c=>!/^(len|cap|make|append|error|bool|int\d*|string|byte|fmt\.Errorf|errors\.New|t\.|require\.|assert\.)/.test(c)))].slice(0,3);
  return (prefix?verbs[prefix]:'执行')+' '+(owner?owner+'.':'')+n+(leafCalls.length?'，调用 '+leafCalls.join('、'):'')+'。';
}
const related = {
  'server/internal/gen/README.md':['server/internal/gen/main.go','server/internal/gen/data.go'],
  'server/internal/gen/main.go':['server/internal/gen/data.go','server/internal/gen/hooks.go.tmpl','server/internal/gen/request_handler.go.tmpl'],
  'server/internal/gen/hooks.go.tmpl':['server/hooks.go'],
  'server/internal/gen/request_handler.go.tmpl':['server/request_handler.go'],
  'scripts/check_conformance.py':['conformance/server/expected-failures.yml'],
  'scripts/test_check_conformance.py':['scripts/check_conformance.py'],
  'www/vocs.config.ts':['www/docs/styles.css'],
  'otel/example/README.md':['otel/example/main.go']
};
const typeDecls = new Map();
function declaredGoSymbols(file) {
  if (!typeDecls.has(file)) {
    const source=getSrc(file);
    const facts = new Set([...source.matchAll(/^(?:type|const|var|func)\s+([A-Z]\w*)\b/gm)].map(m=>m[1]));
    for (const block of source.matchAll(/^(?:const|var)\s*\(([\s\S]*?)^\)/gm)) {
      for (const match of block[1].matchAll(/^\s+([A-Z]\w+)\b/gm)) facts.add(match[1]);
    }
    typeDecls.set(file,facts);
  }
  return typeDecls.get(file);
}
for (const b of batches.filter(b=>[9,10,11,12,23,24].includes(b.batchIndex))) {
  const result = require('./middle-'+b.batchIndex+'-extract.json');
  const extracts=new Map(result.results.map(r=>[r.path,r]));
  const nodes=[], edges=[], knownEdges=new Set();
  const edge=(source,target,type,weight)=>{
    if(source===target) return;
    const k=[source,target,type].join('|');
    if(knownEdges.has(k)) return;
    knownEdges.add(k);
    edges.push({source,target,type,direction:'forward',weight});
  };
  for(const f of b.files){
    const p=f.path, r=extracts.get(p), fid=fileId(f), topic=fileTopic(p);
    const source = getSrc(p);
    const srcLines=source.split('\n');
    const tags=[topic, testFile(p)?'测试':({docs:'文档',config:'配置',markup:'样式',infra:'基础设施'}[f.fileCategory]||'实现')];
    const complexity = n=>n>120?'complex':n>30?'moderate':'simple';
    const summary=summaries.get(p);
    if (!summary) throw Error('missing summary '+p);
    nodes.push({id:fid,type:fileType(f),name:path.basename(p),filePath:p,summary,tags,complexity:complexity(f.sizeLines)});
    const symbolsByName=new Map();
    const addSymbol = (type,name,raw,owner='')=>{
      const label=owner?owner+'.'+name:name;
      const sid=type+':'+p+':'+label;
      if (nodes.some(n=>n.id===sid)) return;
      const calls=r.callGraph?.filter(c=>c.caller===name&&c.lineNumber>=raw.startLine&&c.lineNumber<=raw.endLine)||[];
      const node={id:sid,type,name:label,filePath:p,lineRange:[raw.startLine,raw.endLine],summary:symbolSummary(name,owner,type==='class',raw.methods||[],raw.properties||[],calls),tags:[topic,type==='class'?'类型':testFile(p)?'测试':'函数'],complexity:complexity(raw.endLine-raw.startLine+1)};
      nodes.push(node);
      if(!symbolsByName.has(name)) symbolsByName.set(name,[]);
      symbolsByName.get(name).push(node);
      edge(fid,sid,'contains',1);
      if(isExported(name,r)&&(!owner||isExported(owner,r))&&!testFile(p))edge(fid,sid,'exports',.8);
    };
    if(r && f.fileCategory==='code'){
      for(const c of r.classes||[]) {
        if(c.endLine-c.startLine+1>=20||(c.methods||[]).length>=2||isExported(c.name,r)) addSymbol('class',c.name,c);
      }
      for(const fn of r.functions||[]) {
        if(fn.endLine-fn.startLine+1<10&&!isExported(fn.name,r)) continue;
        const owner=srcLines[fn.startLine-1]?.match(/^\s*func\s*\(\s*(?:\w+\s+)?\*?(\w+)/)?.[1]||'';
        addSymbol('function',fn.name,fn,owner);
      }
      for(const call of r.callGraph||[]){
        if(!/^[a-zA-Z_]\w*$/.test(call.callee)) continue;
        const caller=symbolsByName.get(call.caller)?.find(n=>n.type==='function'&&call.lineNumber>=n.lineRange[0]&&call.lineNumber<=n.lineRange[1]);
        const callee=symbolsByName.get(call.callee)?.filter(n=>n.type==='function'&&!n.name.includes('.'));
        if(caller&&callee?.length===1)edge(caller.id,callee[0].id,'calls',.8);
      }
    }
    const references = new Map();
    if(f.language==='go'){
      const imports = [...source.matchAll(/^\s*(?:import\s+)?(?:(\w+)\s+)?"github\.com\/mark3labs\/mcp-go\/([^"]+)"\s*$/gm)];
      for(const match of imports){
        const prefix=match[1]||path.basename(match[2]);
        const expr=new RegExp('\\b'+prefix+'\\.([A-Z]\\w*)','g');
        references.set(match[2],new Set([...source.matchAll(expr)].map(m=>m[1])));
      }
    }
    for(const dest of b.batchImportData[p]||[]){
      const target=inventory.get(dest);
      if(!target||testFile(dest)) continue;
      if(f.language==='go'&&target.language==='go'){
        const names=references.get(path.dirname(dest));
        if (!names||![...declaredGoSymbols(dest)].some(n=>names.has(n))) continue;
      }
      edge(fid,fileId(target),'imports',.7);
    }
    for (const dest of related[p]||[]){
      const target=inventory.get(dest);
      if(target)edge(fid,fileId(target),f.fileCategory==='docs'?'documents':'depends_on',.6);
    }
    if (p.startsWith('server/testdata/conformance/')) {
      const harness = [...inventory.values()].find(x=>/server\/.*conformance.*_test\.go$/.test(x.path));
      if(harness)edge(fileId(harness),fid,'reads_from',.6);
    }
    if(p.endsWith('/README.md')){
      const implementation=inventory.get(path.dirname(p)+'/main.go');
      if(implementation)edge(fid,fileId(implementation),'documents',.6);
    }
    if(testFile(p)){
      const impl=inventory.get(p.replace(/_test\.go$/,'.go').replace(/\/test_check_conformance\.py$/,'/check_conformance.py'));
      if(impl)edge(fileId(impl),fid,'tested_by',.5);
    }
  }
  if(nodes.filter(n=>n.id===fileId(inventory.get(n.filePath))).length!==b.files.length)throw Error('incomplete coverage');
  const out='.ua/intermediate/batch-'+b.batchIndex+'.json';
  fs.writeFileSync(out+'.tmp',JSON.stringify({nodes,edges},null,2)+'\n');
  fs.renameSync(out+'.tmp',out);
  console.log(b.batchIndex,b.files.length,nodes.length,edges.length);
}
