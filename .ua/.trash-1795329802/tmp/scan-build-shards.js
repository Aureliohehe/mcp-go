const fs = require('node:fs');
const path = require('node:path');
const {batches,exportsByPath} = require('../intermediate/batches.json');
const special = {
  'client/client.go':'管理客户端生命周期、协议协商和请求发送，并向调用方提供工具、资源、提示词与任务操作。',
  'client/interface.go':'定义 MCPClient 接口，统一工具、资源、提示词和会话操作。',
  'client/inprocess.go':'创建连接本地 MCPServer 的客户端，并将选项传给进程内传输。',
  'client/transport/inprocess.go':'在同一进程内连接客户端与服务器，实现请求、通知及会话生命周期。',
  'client/http.go':'构建使用 Streamable HTTP 传输的客户端。',
  'client/sse.go':'构建使用传统 SSE 传输的客户端。',
  'client/stdio.go':'通过子进程标准输入输出构建客户端。',
  'client/elicitation.go':'定义客户端采集请求处理器和处理结果。',
  'client/iter.go':'提供工具、资源、资源模板、提示词和任务的分页迭代接口。',
  'client/mrtr.go':'协调多轮请求，按需处理服务端提供的采集、采样和根目录查询，并回传输入。',
  'client/oauth.go':'提供客户端 OAuth 配置与授权流程辅助能力。',
  'client/protocol.go':'尝试发现和协商新版 MCP，组装请求元数据与标准标头并缓存工具信息。',
  'client/roots.go':'约定客户端如何响应服务端发起的根目录列表查询。',
  'client/sampling.go':'约定客户端如何处理服务端发起的模型采样请求。',
  'client/subscriptions.go':'跟踪客户端资源订阅与取消订阅并分发资源更新。',
  'client/task_wait.go':'轮询任务状态，等待任务完成或上下文取消。',
  'client/tracing.go':'从客户端请求中创建追踪跨度，并传播上下文。',
  'client/transport/command.go':'构造传输所需的外部命令并配置进程启动行为。',
  'mcp/headers.go':'定义 MCP 标准 HTTP 标头及工具参数到标头的映射与校验。',
  'mcp/meta.go':'表示 MCP 请求和响应中的元数据，支持已知字段与扩展字段。',
  'mcp/prompts.go':'定义提示词、提示词参数和消息，并提供提示词结果构造选项。',
  'mcp/request_id_number.go':'以十进制字符串规范化 JSON-RPC 数字请求 ID，避免浮点舍入引发匹配错误。',
  'mcp/resources.go':'定义资源、资源模板和内容，提供 URI 模板及响应构造。',
  'mcp/result.go':'封装结果的公共字段和元数据，支持通用结果解析。',
  'mcp/schema_cache.go':'缓存从 Go 类型生成或编译得到的 JSON Schema，避免重复构造。',
  'mcp/struct_schema.go':'根据 Go 结构体字段和标签派生工具输入输出的 JSON Schema。',
  'mcp/tasks.go':'定义任务状态、任务创建与查询结果，以及任务的序列化形态。',
  'mcp/tools.go':'定义工具、参数 schema 和执行结果，提供选项函数构建声明及响应。',
  'mcp/typed_tools.go':'从 Go 类型构造工具参数 schema，并将动态调用参数转换为处理函数所需的类型。',
  'mcp/types.go':'集中定义 MCP 方法、能力、JSON-RPC 消息及采样和采集等协议数据类型。',
  'mcp/utils.go':'提供协议请求参数和响应结果的提取、转换及构造帮助函数。',
  'mcp/version.go':'维护 MCP 协议版本并区分新版与传统协议。',
  'server/client_info_store.go':'定义按会话存储的客户端身份与能力信息，供传输层和请求处理复用。',
  'server/completion.go':'处理提示词与资源模板参数补全并约定补全处理器。',
  'server/constants.go':'集中定义服务端共享的常量。',
  'server/ctx.go':'为请求上下文附加服务器和会话相关信息，并提供读取接口。',
  'server/discover.go':'响应 discover 请求，过滤传输支持的协议版本并把请求版本应用到会话。',
  'server/elicitation.go':'向客户端发出采集请求，检查能力并解析客户端响应。',
  'server/errors.go':'定义服务端共享的错误值。',
  'server/event_store.go':'存储可恢复 SSE 事件，供 HTTP 请求断开后按事件 ID 回放。',
  'server/handler_errors.go':'将处理器错误转换为可暴露的 JSON-RPC 错误并识别 URL 采集需求。',
  'server/hooks.go':'管理协议调用前后、错误及会话钩子的注册与执行。',
  'server/http_cors.go':'定义 HTTP 跨域配置，并处理预检请求与跨域响应标头。',
  'server/http_localhost.go':'识别本地 HTTP 连接范围并处理相关主机校验。',
  'server/http_transport_options.go':'定义用 HTTP 请求补充服务器请求上下文的回调类型。',
  'server/inflight_request.go':'跟踪在途请求，按会话和请求 ID 管理取消操作。',
  'server/inprocess_session.go':'管理进程内会话注册及通知处理，供本地传输复用。',
  'server/input_validation.go':'根据工具输入 JSON Schema 校验调用参数，并控制参数缺失或格式错误的处理。',
  'server/jsonrpc_error.go':'将服务器错误表示为 JSON-RPC 错误响应。',
  'server/jsonrpc_strict.go':'严格解析 JSON-RPC 封包并验证各字段形态。',
  'server/logger.go':'声明服务器日志接口，并提供默认或静默实现。',
  'server/mrtr.go':'构建多轮请求的附加输入与状态，并在兼容流程中解析客户端结果后继续执行。',
  'server/output_validation.go':'校验工具结构化结果是否符合输出 JSON Schema。',
  'server/protected_resource.go':'生成和匹配 OAuth 受保护资源元数据路径，并提供返回元数据的 HTTP 处理器。',
  'server/protocol.go':'在请求上下文中保存 MCP 协议版本、客户端信息和能力。',
  'server/request_handler.go':'将各 MCP 方法分配给请求处理器，连接消息解析和业务操作。',
  'server/resource_errors.go':'为资源读取和查找失败生成相应的协议错误。',
  'server/response.go':'为响应添加缓存提示，并按 HTTP 标头和工具参数绑定规则校验请求。',
  'server/roots.go':'从客户端请求根目录列表，根据客户端能力决定是否可发出请求。',
  'server/sampling.go':'从服务端向支持采样的客户端请求模型生成。',
  'server/server.go':'实现 MCPServer 的工具、资源、提示词和任务注册，以及消息分发和能力管理。',
  'server/session.go':'定义会话及其可选能力，管理会话注册与按会话资源访问。',
  'server/sse.go':'提供传统 HTTP+SSE 服务端传输并维护客户端连接。',
  'server/stdio.go':'从标准输入逐行读取 JSON-RPC 消息，并将响应与通知写回标准输出。',
  'server/streamable_http.go':'配置并启动 Streamable HTTP 服务端，为会话、可恢复流和请求生命周期提供状态。',
  'server/streamable_http_handle.go':'处理 Streamable HTTP 请求的路由、解析与响应分发。',
  'server/streamable_http_modern.go':'识别新版 HTTP 请求，校验协议版本和元数据，并将 JSON-RPC 错误映射到 HTTP 状态。',
  'server/streamable_http_resume.go':'持久化各会话 SSE 流的事件，按 Last-Event-ID 回放并在重连后继续投递。',
  'server/subscriptions.go':'追踪会话的资源订阅，触发资源更新与关闭订阅时的清理。',
  'server/task_hooks.go':'定义任务状态相关钩子，并在创建、更新及终止时分发事件。',
  'server/tracing.go':'为服务端请求及处理器记录追踪跨度，并从请求中提取传播上下文。',
  'tracing/tracing.go':'为 MCP 客户端和服务端提供追踪及上下文传播接口。',
};
const features = {
 'conformance':'MCP 协议一致性测试服务', 'custom_context':'在服务器处理器中使用自定义请求上下文', 'dynamic_path':'动态配置 HTTP 路径', 'elicitation':'在 MCP 调用中发起用户信息采集', 'everything':'在同一服务器注册多种 MCP 功能', 'in_process':'以内存传输连接客户端和服务器', 'inprocess_sampling':'通过进程内传输处理模型采样请求', 'roots_http_server':'通过 HTTP 请求客户端根目录', 'roots_server':'由服务器查询客户端的根目录', 'sampling_http_server':'通过 HTTP 由服务端发起模型采样', 'sampling_server':'在工具处理中调用客户端的采样能力', 'structured_input_and_output':'校验结构化工具输入与输出', 'task_tool':'以任务形式执行工具并获取后续结果', 'typed_tools':'用 Go 类型定义工具输入与输出', 'filesystem_stdio_client':'启动文件系统 MCP 子进程并进行工具调用', 'oauth_client':'通过 OAuth 授权连接 MCP 服务器',
};
const words = {
 cancel:'取消', cancels:'取消', cancellation:'取消', abandoned:'放弃等待', discovery:'发现协商', initial:'初始化', precision:'精度', request:'请求', requests:'请求', result:'结果', results:'结果', error:'错误', errors:'错误', response:'响应', responses:'响应', task:'任务', tasks:'任务', status:'状态', content:'内容', array:'数组', arrays:'数组', nil:'空值', null:'JSON 空值', empty:'空集合', name:'名称', missing:'字段缺失', structured:'结构化', serialization:'序列化', unmarshal:'解码', marshal:'编码', metadata:'元数据', meta:'元数据', schema:'模式', cache:'缓存', identity:'标识', validation:'校验', validator:'验证器', replacement:'替换', default:'默认行为', filtering:'筛选', filter:'筛选', race:'并发竞争', panic:'异常恢复', registration:'注册', handler:'处理器', reentrancy:'重入', reentrant:'重入', ordering:'顺序', notification:'通知', notifications:'通知', load:'负载', shedding:'削减', fallback:'回退', output:'输出', input:'输入', roundtrip:'往返', interop:'互操作', manual:'手动模式', envelope:'消息封包', serialization:'序列化', tool:'工具', tools:'工具', sampling:'采样', elicitation:'用户采集', roots:'根目录', client:'客户端', server:'服务端', resources:'资源', resource:'资源', cancellation:'取消', resume:'恢复', resumability:'断线恢复', subscriptions:'订阅', subscription:'订阅', subscribe:'订阅', streamable:'流式', handle:'处理', stdio:'标准输入输出', inprocess:'进程内', protected:'受保护的', mockstdio:'标准输入输出模拟', path:'路径', escaped:'转义', validation:'校验', parser:'解析器', parse:'解析', malformed:'格式错误', list:'列表', pagination:'分页', cursor:'游标', positive:'正数', overflow:'溢出', scoped:'请求范围', across:'跨', shutdown:'关闭', version:'版本', negotiation:'协商', hooks:'钩子', hook:'钩子', tracing:'追踪', test:'测试', helpers:'辅助函数', helper:'辅助函数', integration:'集成', connection:'连接', reused:'复用', reuse:'复用', ownership:'所有权', map:'映射', invalid:'无效', classification:'分类', pointer:'指针', logger:'日志记录器', param:'参数', params:'参数', headers:'标头', header:'标头', type:'类型', protocol:'协议', strict:'严格校验', logging:'日志', middleware:'中间件', command:'外部命令', argument:'参数', arguments:'参数', limit:'限制', connection:'连接', sample:'采样', modern:'新版协议', legacy:'传统协议', touch:'时间戳刷新', session:'会话', events:'事件', event:'事件', store:'存储', queue:'队列', body:'请求正文', integer:'整数', number:'数字', options:'选项', atomic:'原子更新', registry:'注册表', tiebreak:'同值排序', replay:'回放', copy:'副本', listen:'监听', description:'描述', shape:'形态', shapes:'形态', annotations:'注解', defer:'延迟', loading:'加载', properties:'属性', property:'属性', order:'顺序', slice:'切片', int:'整数', raw:'原始数据', additional:'补充场景', regression:'回归', results:'结果', review:'审查', tests:'测试', http:'HTTP', jsonrpc:'JSON-RPC', sse:'SSE', oauth:'OAuth', post:'POST', id:'标识', mrtr:'多轮请求', cors:'跨域', e2e:'端到端', bench:'性能基准', label:'标签', metadata:'元数据', replacement:'替换', schema:'模式', detail:'详情', details:'详情', workflow:'工作流', docs:'文档', conformance:'一致性', utils:'辅助操作', local:'本地', localhost:'本地主机',
};
function phrase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').split(/[_\-\s]+/).filter(Boolean).map(w=>words[w.toLowerCase()] ?? w.charAt(0).toLowerCase()+w.slice(1)).join(' ');
}
const weight = {contains:1, imports:.7, exports:.8, calls:.8};
const complexity = n => n>200?'complex':n>=50?'moderate':'simple';
const summaryFor = (file, testNames, symbols) => {
  if(special[file]) return special[file];
  const basename=path.basename(file);
  const stem=basename.replace(/\.go$/,'');
  const demo=features[file.split('/')[1]];
  if(file.startsWith('examples/') && demo) return '演示如何'+demo+'。';
  if(stem.endsWith('_test')){
    const topic=phrase(stem.replace(/_test$/,''));
    const what=testNames.slice(0,3).map(x=>x.replace(/^(Test|Benchmark|Example)_?/,'')).join('、');
    return (stem.endsWith('_bench_test')?'对'+topic+'运行性能基准。':'验证'+topic+'相关行为。') +(what?'覆盖 '+what+' 等用例。':'');
  }
  if(file.startsWith('mcp/testdata/schema_cache/')) return '提供用于缓存测试的数据模型，用于检验不同 Go 包的同名类型能否分开缓存。';
  if(file.includes('mockstdio_stderr_flood')) return '启动模拟 MCP 子进程，向标准错误持续写入数据，以测试客户端的管道读取与回收 behavior。'.replace(' behavior','行为');
  if(file.includes('mockstdio_stderr')) return '启动会向标准错误写日志的模拟 MCP 子进程，用于验证日志和协议输出隔离。';
  if(file.includes('mockstdio')) return '提供模拟标准输入输出子进程，供客户端传输测试执行协议请求。';
  if(file.startsWith('server/servertest/')) return basename==='doc.go'?'描述服务端传输测试的辅助包。':'为服务端 '+phrase(stem)+' 传输提供测试辅助。';
  return '提供'+phrase(stem)+'相关定义和操作'+(symbols.length?'，包括 '+symbols.slice(0,4).join('、'):'')+'。';
};
const addSymSummary = (kind, f, base) => {
 const name=f.name, p=f.params?.join('、');
 const subject=phrase(name);
 if(/^(Test|Benchmark|Example)/.test(name)) {
   const target=phrase(name.replace(/^(Test|Benchmark|Example)_?/,''));
   return (/^Benchmark/.test(name)?'测量':/^Example/.test(name)?'演示':'验证') + target +(target?'相关行为。':'所在文件的主要行为。');
 }
 if(kind==='class') {
   const fields=f.properties?.slice(0,4);
   return '定义 '+name+' '+(/interface\b/.test(f.decl)?'接口':'类型')+(fields?.length?'，包含 '+fields.join('、')+' 字段':f.methods?.length?'，提供 '+f.methods.slice(0,3).join('、')+' 等方法':'，用于'+phrase(base)+'相关操作')+'。';
 }
 if(/^With[A-Z]/.test(name)) return '提供用于配置'+phrase(name.slice(4))+'的选项。';
 if(/^New[A-Z]/.test(name)) return '构建 '+name.slice(3)+(p?'，接收 '+p:'')+'。';
 if(/^(Unmarshal|Marshal)JSON/.test(name)) return name.startsWith('Unmarshal')?'从 JSON 解码'+(f.owner?' '+f.owner:'数据')+'。':'将'+(f.owner?' '+f.owner+' 编码为':'数据编码为')+' JSON。';
 if(/^(Get|List|Set|Is|Has|Validate|Handle|Parse|Read|Write|Add|Delete|Remove|Register|Unregister|Close|Send|Start|Cancel|Find|Filter|Build)[A-Z]/.test(name)){
   const match=name.match(/^[A-Z][a-z]+/)[0];
   const verbs={Get:'获取',List:'列出',Set:'设置',Is:'判断',Has:'检查',Validate:'校验',Handle:'处理',Parse:'解析',Read:'读取',Write:'写入',Add:'添加',Delete:'删除',Remove:'移除',Register:'注册',Unregister:'注销',Close:'关闭',Send:'发送',Start:'启动',Cancel:'取消',Find:'查找',Filter:'筛选',Build:'构建'};
   return verbs[match]+phrase(name.slice(match.length))+(f.owner?'（'+f.owner+'）':'')+'。';
 }
 return '处理'+subject+(p?'，使用 '+p+' 参数':f.owner?'，作用于 '+f.owner:'')+'。';
};
for(const {batchIndex,files,batchImportData} of batches.slice(0,8)){
  const result=JSON.parse(fs.readFileSync(`.ua/tmp/ua-file-extract-results-${batchIndex}.json`));
  if(!result.scriptCompleted || result.filesUnreadable.length)throw new Error('结构提取失败 '+batchIndex);
  const items=new Map(result.results.map(file=>[file.path,file]));
  const nodes=[], edges=[];
  const edge=(source,target,type)=>edges.push({source,target,type,direction:'forward',weight:weight[type]});
  for(const {path:filename,fileCategory,language,sizeLines} of files){
     const item=items.get(filename)??{};
     const basename=path.basename(filename);
     const base=basename.replace(/_test\.go$|\.go$/g,'');
     const isTest=filename.endsWith('_test.go');
     const type='file';
     const fileId=type+':'+filename;
     const parts=filename.split('/');
     const testNames=(item.functions??[]).map(f=>f.name).filter(n=>/^(Test|Example|Benchmark)/.test(n));
     const tags=[language,parts[0],isTest?'测试':parts[0]==='examples'?'示例':'协议实现'];
     nodes.push({id:fileId,type,name:basename,filePath:filename,summary:summaryFor(filename,testNames,(item.exports??[]).map(f=>f.name)),tags:[...new Set(tags)],complexity:complexity(item.nonEmptyLines??sizeLines)});
     const imports=batchImportData[filename]??[];
     for(const target of imports)edge(fileId,'file:'+target,'imports');
     const lines=fs.readFileSync(filename,'utf8').split('\n');
     const exported=new Set((item.exports??[]).map(e=>e.name+':'+e.line));
     const generated=lines.slice(0,12).some(l=>/^\/\/ Code generated .* DO NOT EDIT\./.test(l));
     const functionsByName=new Map();
     function symbol(f,kind){
       const length=f.endLine-f.startLine+1;
       const decl=lines[f.startLine-1]??'';
       const owner=kind==='function'?decl.match(/^\s*func\s*\([^)]*?\*?\b(\w+)\)\s*[A-Za-z_]/)?.[1]:null;
       const isExported=exported.has(f.name+':'+f.startLine);
       if(generated || (kind==='class'&&/\s=\s/.test(decl)) || (!isExported && (kind==='function'?length<10:(f.methods?.length??0)<2&&length<20)))return;
       const name=owner?owner+'.'+f.name:f.name;
       const id=kind+':'+filename+':'+name;
       const n={id,type:kind,name,filePath:filename,summary:addSymSummary(kind,{...f,owner,decl},base),tags:[language,isTest?'测试':kind==='class'?'类型':'函数',parts[0]],complexity:complexity(length),lineRange:[f.startLine,f.endLine]};
       nodes.push(n);
       edge(fileId,id,'contains');
       if(isExported)edge(fileId,id,'exports');
       if(kind==='function')functionsByName.set(f.name,[...functionsByName.get(f.name)??[],n]);
     }
     for(const c of item.classes??[])symbol(c,'class');
     for(const f of item.functions??[])symbol(f,'function');
     for(const {caller,callee,lineNumber} of item.callGraph??[]){
       const source=functionsByName.get(caller)?.find(n=>n.lineRange[0]<=lineNumber&&n.lineRange[1]>=lineNumber);
       if(!source)continue;
       const local=functionsByName.get(callee);
       if(local?.length===1){edge(source.id,local[0].id,'calls');continue;}
       const match=callee.match(/^(mcp|tracing|client|server|transport)\.([A-Za-z]\w*)$/);
       if(!match)continue;
       const [,pkg,symbol]=match;
       const candidates=imports.filter(p=>path.dirname(p).split('/').pop()===pkg&&exportsByPath[p]?.includes(symbol));
       if(candidates.length===1)edge(source.id,'function:'+candidates[0]+':'+symbol,'calls');
     }
  }
  const importCount=files.reduce((n,f)=>n+(batchImportData[f.path]?.length??0),0);
  if(edges.filter(e=>e.type==='imports').length!==importCount || new Set(nodes.map(n=>n.id)).size!==nodes.length)throw new Error('分片验证失败 '+batchIndex);
  const unique=[...new Map(edges.map(e=>[e.source+'|'+e.type+'|'+e.target,e])).values()];
  const output=`.ua/intermediate/batch-${batchIndex}.json`;
  fs.writeFileSync(output,JSON.stringify({nodes,edges:unique},null,2)+'\n');
  console.log(output,nodes.length,unique.length,importCount);
}
