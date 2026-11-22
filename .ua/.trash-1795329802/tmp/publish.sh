#!/usr/bin/env bash
set -euo pipefail
skill_dir=/root/.agents/skills/understand
node -e 'const r=require("./.ua/intermediate/review.json"); if(r.issues.length) process.exit(1)'
cp .ua/intermediate/assembled-graph.json .ua/tmp/knowledge-graph.json
mv .ua/tmp/knowledge-graph.json .ua/knowledge-graph.json
if [[ -f .ua/intermediate/code-lessons.normalized.json ]]; then
  mv .ua/intermediate/code-lessons.normalized.json .ua/code-lessons.json
fi
node "$skill_dir/build-fingerprints.mjs" .ua/intermediate/fingerprint-input.json
node <<'NODE'
const fs = require('node:fs');
const graph = require('./.ua/knowledge-graph.json');
const scan = require('./.ua/intermediate/scan-result.json');
const {analyzedAt:lastAnalyzedAt, gitCommitHash} = graph.project;
const meta = {lastAnalyzedAt, gitCommitHash, version:graph.version, analyzedFiles:scan.files.length};
fs.writeFileSync('.ua/tmp/meta.json', JSON.stringify(meta, null, 2) + '\n');
fs.renameSync('.ua/tmp/meta.json', '.ua/meta.json');
NODE
