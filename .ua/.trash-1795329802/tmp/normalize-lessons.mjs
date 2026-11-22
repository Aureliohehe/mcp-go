import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
const dir = '.ua/intermediate/';
const read = name => JSON.parse(readFileSync(dir + name, 'utf8'));
const graph = read('assembled-graph.json');
const tour = read('tour.normalized.json');
const fileKinds = new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint']);
const files = graph.nodes.filter(n => fileKinds.has(n.type));
const byId = new Map(files.map(n => [n.id, n.filePath]));
const orders = new Set(tour.map(step => step.order));
const detailedPaths = new Set(tour.flatMap(step => step.nodeIds.map(id => byId.get(id))).filter(Boolean));
const scan = new Map(read('scan-result.json').files.map(f => [f.path, f.sizeLines]));
const raw = {};
for (const name of readdirSync(dir).filter(n => /^code-lessons(?:\.detailed\.\d+)?\.json$/.test(n)).sort()) {
  const batch = read(name);
  for (const [p, lesson] of Object.entries(batch.files ?? batch)) {
    if (Object.hasOwn(raw, p)) console.error('Duplicate lesson: ' + p);
    else raw[p] = lesson;
  }
}
const output = {};
let detailed = 0;
for (const n of files) {
  const p = n.filePath;
  const lesson = detailedPaths.has(p) ? raw[p] : null;
  let previousEnd = 0;
  const sections = [];
  for (const section of (lesson?.sections ?? []).slice(0,10)) {
    const r = section.lineRange;
    if (!Array.isArray(r) || r.length !== 2 || !r.every(Number.isInteger)
        || r[0] <= previousEnd || r[1] < r[0] || r[1] > scan.get(p)
        || !section.title || !section.explanation) continue;
    const normalized = {title:section.title, explanation:section.explanation, lineRange:r};
    if (orders.has(section.tourOrder)) normalized.tourOrder = section.tourOrder;
    sections.push(normalized);
    previousEnd = r[1];
  }
  if (sections.length) detailed++;
  else if (detailedPaths.has(p)) throw Error('Missing detail for tour file: ' + p);
  output[p] = {overview:lesson?.overview?.trim() || n.summary, sections};
}
const overview = Object.keys(output).length - detailed;
writeFileSync(dir + 'code-lessons.normalized.json', JSON.stringify({version:1,generatedAt:new Date().toISOString(),files:output},null,2) + '\n');
console.log(JSON.stringify({detailed, overview}));
