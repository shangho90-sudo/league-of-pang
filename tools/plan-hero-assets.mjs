// Offline validation only: this script never submits paid jobs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(fs.readFileSync('tools/tripo-hero-assets.json', 'utf8'));
const plans = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pang-hero-plan-'));
try {
  for (const asset of manifest.assets) {
    const textured = asset.texture !== false;
    const args = ['make', `${manifest.style} ${asset.prompt}`, '-p', `face_limit=${asset.faces}`,
      '-p', `texture=${textured}`, '-p', `pbr=${textured}`, '--name', `pang-hero-${asset.id}`, '-o', manifest.outputParent];
    const argsFile = path.join(tmp, 'args.json');
    fs.writeFileSync(argsFile, JSON.stringify([...args, '--dry-run', '--json']));
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-Command',
      '$env:TRIPO_CLIENT_APP="codex"; $env:TRIPO_DISTRIBUTION_CHANNEL="codex_plugin"; $assetArgs=Get-Content -Raw -LiteralPath $env:PANG_TRIPO_ARGS | ConvertFrom-Json; & tripo @assetArgs; exit $LASTEXITCODE'], {
      encoding: 'utf8', env: {...process.env, PANG_TRIPO_ARGS: argsFile},
    });
    if (result.error || result.status !== 0) throw new Error(`${asset.id}: ${result.error || result.stderr || result.stdout}`);
    const plan = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    if (!plan.valid || plan.steps.length !== 1) throw new Error(`Unexpected plan: ${asset.id}`);
    plans.push({id: asset.id, label: asset.label, commandArguments: args, modelAlias: 'tripo-p1',
      estimatedCredits: textured ? 40 : 30, runtimeFile: `${manifest.runtimeDirectory}/${asset.id}.glb`, plan});
    console.log(`${plans.length}. ${asset.id}: ${plan.model}; ${textured ? 40 : 30} credits; valid`);
  }
} finally {
  fs.unlinkSync(path.join(tmp, 'args.json'));
  fs.rmdirSync(tmp);
}
fs.writeFileSync('dev/tripo-hero-plan.json', JSON.stringify({status: 'awaiting-credit-approval',
  estimatedCredits: plans.reduce((sum, p) => sum + p.estimatedCredits, 0), plans}, null, 2) + '\n');
console.log('Saved dev/tripo-hero-plan.json. No credits spent.');
