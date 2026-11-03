// Run only the approved, as-yet-unsubmitted remainder. The PS runner locks each ID.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const plan = JSON.parse(fs.readFileSync('dev/tripo-hero-plan.json', 'utf8'));
if (plan.status !== 'approved') throw new Error('Approval required.');
const ids = process.argv.slice(2);
if (!ids.length || ids.some(id => !plan.plans.some(p => p.id === id))) throw new Error('Pass explicit approved asset IDs.');
let cursor = 0, failures = 0;
await Promise.all(Array.from({length: 3}, async () => {
  while (cursor < ids.length) {
    const id = ids[cursor++];
    const file = fs.openSync(`_art/tripo-heroes/${id}.log`, 'a');
    const code = await new Promise(resolve => {
      const child = spawn('pwsh.exe', ['-NoProfile', '-File', 'tools/run-hero-asset.ps1', '-AssetId', id], {
        windowsHide: true, stdio: ['ignore', file, file], env: process.env,
      });
      child.on('error', e => { console.error(id, e.message); resolve(1); });
      child.on('exit', resolve);
    });
    fs.closeSync(file);
    if (code !== 0) { failures++; console.log(`${id}: stopped, exit ${code}; no retry submitted`); }
    else {
      const result = JSON.parse(fs.readFileSync(`_art/tripo-heroes/records/${id}.json`, 'utf8').replace(/^\uFEFF/, '').trim());
      console.log(JSON.stringify({id, task_id: result.task_id, status: result.status, credits: result.credits_consumed, preview: result.preview}));
    }
  }
}));
process.exitCode = failures ? 1 : 0;
