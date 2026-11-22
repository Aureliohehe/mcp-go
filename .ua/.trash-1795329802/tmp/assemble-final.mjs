import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {KnowledgeGraphSchema} from '/root/.understand-anything/repo/understand-anything-plugin/packages/core/dist/schema.js';
const read = name => JSON.parse(readFileSync('.ua/intermediate/' + name + '.json', 'utf8'));
const write = (name, data) => writeFileSync('.ua/intermediate/' + name + '.json', JSON.stringify(data, null, 2) + '\n');
const scan = read('scan-result');
const raw = read('assembled-graph');
const layersRaw = read('layers');
const tour = read('tour.normalized');
const ids = new Set(raw.nodes.map(n => n.id));
const fileKinds = new Set(['file', 'config', 'document', 'service', 'pipeline', 'table', 'schema', 'resource', 'endpoint']);
const fileNodes = raw.nodes.filter(n => fileKinds.has(n.type));
const idByPath = new Map(fileNodes.map(n => [n.filePath, n.id]));
const toId = value => ids.has(value) ? value : idByPath.get(value);
const layers = (layersRaw.layers ?? layersRaw).map(l => ({
  ...l,
  nodeIds: [...new Set((l.nodeIds ?? l.nodes ?? []).map(n => toId(n.id ?? n)).filter(Boolean))]
}));
const labelFile = process.argv[2] === '--labels' ? read('container-labels') : null;
if (labelFile) {
  for (const item of labelFile.layers ?? labelFile) {
    const layer = layers.find(l => l.id === item.layerId);
    if (!layer) continue;
    const localIds = new Set(layer.nodeIds);
    layer.containerLabels = (item.labels ?? []).map(label => ({
      name: label.name, nodeIds: [...new Set(label.nodeIds.map(toId).filter(id => localIds.has(id)))]
    })).filter(label => label.name && label.nodeIds.length >= 2);
  }
}
const gitCommitHash = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const analyzedAt = new Date().toISOString();
const graph = {
  version:'1.0.0',
  project: {name:scan.name, description:scan.description.replace(/项目包含超过 100 个文件.*$/, ''), languages:scan.languages, frameworks:scan.frameworks, analyzedAt, gitCommitHash},
  nodes:raw.nodes, edges:raw.edges, layers, tour
};
const issues = [];
const schema = KnowledgeGraphSchema.safeParse(graph);
if (!schema.success) issues.push(...schema.error.issues.map(x => x.path.join('.') + ': ' + x.message));
if (ids.size !== graph.nodes.length) issues.push('Duplicate node IDs');
for (const n of graph.nodes) {
  if (!(n.id && n.type && n.name && n.summary && n.tags?.length)) issues.push('Missing node field: ' + n.id);
}
for (const e of graph.edges) {
  if (!ids.has(e.source) || !ids.has(e.target)) issues.push('Dangling edge: ' + e.source + ' → ' + e.target);
}
const layerCount = new Map();
for (const l of layers) for (const id of l.nodeIds) layerCount.set(id, (layerCount.get(id) ?? 0) + 1);
for (const n of fileNodes) if (layerCount.get(n.id) !== 1) issues.push('Expected one layer assignment: ' + n.id);
for (const f of scan.files) if (!idByPath.has(f.path)) issues.push('Missing scanned file: ' + f.path);
for (const step of tour) if (!step.nodeIds.length || step.nodeIds.some(id => !ids.has(id))) issues.push('Invalid tour step: ' + step.order);
const connected = new Set(graph.edges.flatMap(e => [e.source, e.target]));
const warnings = graph.nodes.filter(n => !connected.has(n.id)).map(n => 'Orphan node: ' + n.id);
const counts = (items, field) => Object.fromEntries([...Map.groupBy(items, x => x[field])].map(([k, v]) => [k, v.length]));
const stats = {totalNodes: graph.nodes.length, totalEdges: graph.edges.length, totalLayers:layers.length, tourSteps:tour.length, nodeTypes:counts(graph.nodes, 'type'), edgeTypes:counts(graph.edges,'type'), warnings:warnings.length};
write('review', {issues, warnings, stats});
write('assembled-graph', graph);
write('fingerprint-input', {projectRoot:process.cwd(), filePaths:scan.files.map(f => f.path), gitCommitHash});
console.log(JSON.stringify({issues:issues.slice(0,25), stats}, null, 2));
if (issues.length) process.exitCode = 1;
