const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const input = process.argv[2];
const statsPath = process.argv[3];
const outputDir = path.dirname(input);
const graph = JSON.parse(fs.readFileSync(input));
const fileTypes = new Set(['file', 'config', 'document', 'service', 'pipeline', 'table', 'schema', 'resource', 'endpoint']);
const nodes = graph.nodes.filter(node => node.filePath && fileTypes.has(node.type));
const fileByID = new Map(nodes.map(node => [node.id, node]));
const allEdges = graph.edges.filter(edge => fileByID.has(edge.source) && fileByID.has(edge.target));
const directoryGroups = {}, nodeTypes = {}, directoryImportFrequency = {}, edgeTypes = {};
const fileStats = Object.fromEntries(nodes.map(node=>[node.id,{imports:0, importedBy:0}]));
const directoryImports = {}, directoryImportedBy = {};
const first = file => file.includes('/') ? file.split('/')[0] : '(root)';
const bump = (obj,key) => obj[key] = (obj[key] ?? 0) + 1;
const add = (obj,key,value) => (obj[key] ??= []).includes(value) || obj[key].push(value);
for (const node of nodes) {
  (directoryGroups[first(node.filePath)] ??= []).push(node.id);
  (nodeTypes[node.type] ??= []).push(node.id);
}
for (const edge of allEdges) {
  const from = fileByID.get(edge.source);
  const to = fileByID.get(edge.target);
  bump(edgeTypes, from.type+' → '+to.type+' ('+edge.type+')');
  if (edge.type !== 'imports') continue;
  fileStats[edge.source].imports++;
  fileStats[edge.target].importedBy++;
  const source = first(from.filePath), target = first(to.filePath);
  bump(directoryImportFrequency, source+' → '+target);
  add(directoryImports,source,target);
  add(directoryImportedBy,target,source);
}
const intraGroupDensity = Object.fromEntries(Object.keys(directoryGroups).map(group => {
  const own = directoryImportFrequency[group+' → '+group] ?? 0;
  const total = Object.entries(directoryImportFrequency).reduce((n,[pair,count]) => {
    return pair.split(' → ').includes(group) ? n+count : n;
  }, 0);
  return [group,{own,total,density:total?own/total:0}];
}));
const groupPatterns = {
  '.github':'ci-cd', '.kit':'documentation', '.ua':'config', client:'api', conformance:'test', e2e:'test',
  examples:'entry', mcp:'types', mcptest:'test', otel:'hooks', scripts:'config', server:'service',
  testdata:'test', tracing:'hooks', www:'documentation', '(root)':'config',
};
const filenames=nodes.map(n=>n.filePath);
const deploymentTopology={
  hasDockerfile:filenames.some(f=>/(^|\/)Dockerfile(?:\.|$)/.test(f)),
  hasCompose:filenames.some(f=>/(^|\/)(docker-)?compose\.ya?ml$/.test(f)),
  hasK8s:filenames.some(f=>/(^|\/)(k8s|kubernetes)\//.test(f)),
  hasTerraform:filenames.some(f=>/\.tf$/.test(f)),
  ciPipelines:filenames.filter(f=>/^\.github\/workflows\//.test(f)),
};
fs.writeFileSync(statsPath,JSON.stringify({totalFileNodes:nodes.length, directoryGroups, nodeTypes, fileStats, directoryImports, directoryImportedBy, directoryImportFrequency, intraGroupDensity, edgeTypes, groupPatterns, deploymentTopology},null,2)+'\n');
console.log('目录文件数',Object.fromEntries(Object.entries(directoryGroups).map(([p,n])=>[p,n.length])));
console.log('主要跨目录依赖',Object.entries(directoryImportFrequency).filter(([p])=>new Set(p.split(' → ')).size===2).sort((a,b)=>b[1]-a[1]).slice(0,12));
const definitions=[
  ['protocol','MCP 协议与数据模型','定义 JSON-RPC 消息、MCP 能力、工具与资源数据结构、请求元数据及模式生成。'],
  ['client','客户端运行时','向调用方提供 MCP 操作，负责初始化、版本协商、分页迭代、事件分发和客户端能力。'],
  ['server','服务端运行时','注册工具、资源和提示词，分发请求并管理会话、任务、输入输出校验和服务端钩子。'],
  ['transport','连接传输与认证','通过标准输入输出、传统 SSE、Streamable HTTP 或进程内通道传递 MCP 消息，并集成 HTTP 与 OAuth 行为。'],
  ['observability','追踪与可观测性','定义跨客户端和服务端的追踪契约，并通过 OpenTelemetry 执行跨度记录和上下文传播。'],
  ['integration-testing','集成测试与测试工具','提供内置测试客户端、模拟子进程、端到端验证和 MCP 协议一致性样例。'],
  ['examples','可运行示例','展示如何构建 MCP 客户端和服务端，以及如何使用工具、采样、信息采集和任务。'],
  ['documentation','文档与站点','维护 SDK 概念、快速入门、客户端与服务端 API 说明，以及发布这些内容的文档站点。'],
  ['delivery','构建、生成与交付','管理 Go 模块、请求处理器代码生成、项目维护流程与 GitHub Actions 测试和发布。'],
];
const layers=definitions.map(([id,name,description])=>({id:'layer:'+id,name,description,nodeIds:[]}));
const layersByKey = new Map(layers.map(layer=>[layer.id.slice('layer:'.length),layer]));
function classify(file) {
  if (/^(?:examples\/|otel\/example\/)/.test(file)) return 'examples';
  if (/^(?:(?:mcp|server)\/testdata\/|server\/servertest\/|(?:conformance|e2e|mcptest|testdata)\/)/.test(file)) return 'integration-testing';
  if (/^(?:otel\/|tracing\/|(?:client|server)\/tracing(?:_|\.))/.test(file)) return 'observability';
  if (/^(?:www\/|(?:README|CHANGELOG|CONTRIBUTING|AGENTS)(?:\.[^/]+)?$)/.test(file)) return 'documentation';
  if (/^mcp\//.test(file)) return 'protocol';
  if (/^client\/transport\//.test(file)) return 'transport';
  if (/^client\/(?:http|sse|stdio|inprocess|oauth)(?:_|\.)/.test(file)) return 'transport';
  if (/^server\/(?:streamable_http|sse|stdio|http_(?:cors|localhost|transport)|protected_resource|event_store|inprocess_session|client_info_store)(?:_|\.)/.test(file)) return 'transport';
  if (/^server\/internal\/gen\//.test(file)) return 'delivery';
  if (/^client\//.test(file)) return 'client';
  if (/^server\//.test(file)) return 'server';
  return 'delivery';
}
const classifyGroups = {
  protocol: [
    ['工具声明与参数模式', /tool|struct_schema|schema_cache|output_schema|unique_required|schema_type/],
    ['资源、提示词与订阅', /resource|prompt|subscribe|completion/],
    ['任务与多轮交互', /task|sampling|elicit|mrtr|roots/],
    ['消息模型和协议版本', /request_id|headers?|meta|types|result|version|error|utils|notification|array/],
  ],
  client: [
    ['采样与多轮输入', /sampling|elicit|roots|mrtr/],
    ['工具调用与枚举', /tool|iter|list_cursor|schema/],
    ['订阅、通知与任务', /notification|subscription|task/],
    ['会话与协议协商', /^client\//],
  ],
  server: [
    ['任务与生命周期钩子', /task|hooks?\.go/],
    ['会话与并发请求', /session|inflight|race|registration|atomic_registry/],
    ['工具校验与结果', /tool|input_validation|output_validation|schema/],
    ['资源、补全和订阅', /resource|subscribe|completion|pagination/],
    ['采样与多轮输入', /sampling|elicit|roots|mrtr/],
    ['请求分发和协议校验', /server|request|response|discov|strict|error|headers?|protocol|\.go/],
  ],
  transport: [
    ['OAuth 与 HTTP 访问控制', /oauth|redirect|protected_resource|http_cors|http_localhost/],
    ['Streamable HTTP 传输', /streamable_http|client_info_store|event_store|^(?:client\/http|server\/http_transport)/],
    ['传统 SSE 传输', /sse/],
    ['标准输入输出和子进程', /stdio|stderr|command/],
    ['进程内连接', /inprocess/],
    ['传输接口与生命周期', /transport|message_limit/],
  ],
  observability: [
    ['SDK 追踪接口', /^(?:tracing\/|client\/|server\/)/],
    ['OpenTelemetry 适配', /^otel\//],
  ],
  'integration-testing': [
    ['协议一致性测试', /conformance/],
    ['端到端会话测试', /^e2e\//],
    ['测试客户端与传输辅助', /^(?:mcptest|server\/servertest)\//],
    ['模拟子进程和数据夹具', /testdata/],
  ],
  examples: [
    ['工具和结构化输出', /everything|typed_tools|task_tool|structured_input/],
    ['模型采样与用户采集', /sampling|elicitation|multi_round_trip/],
    ['根目录查询', /roots/],
    ['客户端与传输入门', /client|in_process|custom_context|dynamic_path|otel\/example/],
  ],
  documentation: [
    ['客户端指南', /\/clients\//],
    ['服务端指南', /\/servers\//],
    ['传输指南', /\/transports\//],
    ['入门和协议说明', /pages\/|README|CHANGELOG|CONTRIBUTING|AGENTS/],
    ['文档站点入口与样式', /^www\//],
  ],
  delivery: [
    ['测试和发布工作流', /^\.github\/workflows\//],
    ['问题单与协作模板', /^\.github\//],
    ['请求处理器代码生成', /^server\/internal\/gen\//],
    ['项目维护工作流', /^\.kit\//],
    ['模块与脚本配置', /./],
  ],
};
for(const node of nodes) layersByKey.get(classify(node.filePath)).nodeIds.push(node.id);
const labels = layers.map(layer=>{
  const matchers=classifyGroups[layer.id.slice('layer:'.length)];
  const groups=matchers.map(([name])=>({name,nodeIds:[]}));
  for (const id of layer.nodeIds) {
    const index=matchers.findIndex(([,rx])=>rx.test(fileByID.get(id).filePath));
    if(index>=0) groups[index].nodeIds.push(id);
  }
  const eligible=groups.filter(group=>group.nodeIds.length>=2);
  return {layerId:layer.id,labels:layer.nodeIds.length>=8&&eligible.length>=2?eligible:[]};
});
assert(layers.length >= 3 && layers.length <= 10);
assert(layers.every(layer=>layer.nodeIds.length>0));
const assigned=layers.flatMap(l=>l.nodeIds);
assert.equal(new Set(assigned).size, assigned.length);
assert.equal(assigned.length, nodes.length);
assert(labels.every(({labels})=>labels.length<=8));
assert.equal(nodes.length,447);
for (const [name,data] of [['layers.json', layers],['container-labels.json',labels]]) {
  const temp=path.join(outputDir,'.'+name+'.scan.tmp');
  fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');
  fs.renameSync(temp,path.join(outputDir,name));
}
console.log(layers.map((l,i)=>[l.name,l.nodeIds.length,labels[i].labels.map(g=>[g.name,g.nodeIds.length])]));
