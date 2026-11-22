const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const projectRoot = process.cwd();
const {batches} = require('../intermediate/batches.json');
for (const b of batches.filter(b=>[9,10,11,12,23,24].includes(b.batchIndex))) {
  const prefix = '.ua/tmp/middle-' + b.batchIndex;
  fs.writeFileSync(prefix+'-input.json', JSON.stringify({projectRoot,batchFiles:b.files,batchImportData:b.batchImportData}));
  execFileSync('node',['/root/.agents/skills/understand/extract-structure.mjs',prefix+'-input.json',prefix+'-extract.json'],{stdio:'inherit'});
  const result = JSON.parse(fs.readFileSync(prefix+'-extract.json','utf8'));
  if (!result.scriptCompleted || result.filesUnreadable.length) throw new Error(prefix + ': ' + JSON.stringify(result.filesUnreadable));
  console.log(b.batchIndex, result.filesAnalyzed, result.filesSkipped.join(', '));
}
