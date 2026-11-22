import json
from pathlib import Path

workspace = Path.cwd()
data = workspace / '.ua'
scratch = data / 'tmp'
intermediate = data / 'intermediate'
batches = json.loads((intermediate / 'batches.json').read_text())['batches']
types = {'docs': 'document', 'config': 'config', 'infra': 'pipeline'}
weights = {'documents': 0.5, 'related': 0.5, 'configures': 0.6, 'depends_on': 0.6,
           'deploys': 0.7, 'imports': 0.7}

meta = {}
for row in (scratch / 'docs-batch-meta.tsv').read_text().splitlines():
    path, summary, tags, links = row.split('|')
    meta[path] = (summary, tags.lower().split(','), links.split(',') if links else [])

def node_type(file):
    path = file['path']
    if Path(path).name in ('go.mod', 'go.sum'):
        return 'config'
    return types.get(file['fileCategory'], 'file')

files = {f['path']: f for batch in batches for f in batch['files']}
ids = {path: f'{node_type(f)}:{path}' for path, f in files.items()}

def edge(source, target, kind):
    return dict(source=ids[source], target=ids[target], type=kind,
                direction='forward', weight=weights[kind])

for batch in batches:
    i = batch['batchIndex']
    if not 13 <= i <= 22:
        continue
    extraction = json.loads((scratch / f'ua-file-extract-results-{i}.json').read_text())
    assert not extraction.get('filesUnreadable')
    extracted = {f['path']: f for f in extraction['results']}
    nodes, edges = [], []
    expected_imports = 0
    for f in batch['files']:
        path = f['path']
        summary, tags, links = meta.pop(path)
        if path in extracted:
            non_empty = extracted[path]['nonEmptyLines']
        else:
            assert path in extraction['filesSkipped']
            non_empty = sum(bool(line.strip()) for line in (workspace / path).read_text().splitlines())
        complexity = 'simple' if non_empty < 50 else 'moderate' if non_empty <= 200 else 'complex'
        nodes.append(dict(id=ids[path], type=node_type(f), name=Path(path).name,
                          filePath=path, summary=summary, tags=tags, complexity=complexity))
        for link in links:
            kind, target = link.split(':', 1)
            if target in ids:
                edges.append(edge(path, target, kind))
            else:
                print(f'Warning: omitted {path} → {target} (not in inventory)')
        imports = batch['batchImportData'].get(path, [])
        if f['fileCategory'] == 'code':
            expected_imports += len(imports)
            edges.extend(edge(path, target, 'imports') for target in imports)
    assert sum(e['type'] == 'imports' for e in edges) == expected_imports
    assert len(nodes) == len(batch['files'])
    (intermediate / f'batch-{i}.json').write_text(json.dumps(dict(nodes=nodes, edges=edges), ensure_ascii=False, indent=2) + '\n')
    print(i, len(nodes), len(edges))

assert not meta
