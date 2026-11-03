// Read-only, offline Tripo validation. This script never submits generation jobs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(fs.readFileSync(new URL('./tripo-assets.json', import.meta.url), 'utf8'));
const plans = [];
for (const asset of manifest.assets) {
  const args = ['make', `${manifest.style} ${asset.prompt}`, '-p', `face_limit=${asset.faces}`,
    '-p', 'texture=true', '-p', 'pbr=true', '--name', `pang-${asset.id}`, '-o', manifest.outputParent];
  if (asset.rig) args.push('--then', `rig-check,rig:rig_type=${asset.rig},out_format=glb,retarget:animation=preset:walk,animate_in_place=true,out_format=glb,export_with_geometry=true`);
  // Invoke the installed command through PowerShell on Windows; respect its execution policy.
  // Avoid shell interpolation of asset prompts by storing the argument array as JSON.
  let result;
  const env = { ...process.env, TRIPO_CLIENT_APP: 'codex', TRIPO_DISTRIBUTION_CHANNEL: 'codex_plugin' };
  if (process.platform === 'win32') {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pang-tripo-plan-'));
    const argsPath = path.join(tempDir, 'args.json');
    fs.writeFileSync(argsPath, JSON.stringify([...args, '--dry-run', '--json']));
    try {
      result = spawnSync('pwsh.exe', ['-NoProfile', '-Command',
        '$env:TRIPO_CLIENT_APP="codex"; $env:TRIPO_DISTRIBUTION_CHANNEL="codex_plugin"; $assetArgs=Get-Content -Raw -LiteralPath $env:PANG_TRIPO_ARGS | ConvertFrom-Json; & tripo @assetArgs; exit $LASTEXITCODE'],
        { encoding: 'utf8', env: { ...env, PANG_TRIPO_ARGS: argsPath } });
    } finally {
      fs.unlinkSync(argsPath);
      fs.rmdirSync(tempDir);
    }
  } else result = spawnSync('tripo', [...args, '--dry-run', '--json'], { encoding: 'utf8', env });
  if (result.error || result.status !== 0) throw new Error(`${asset.id}: ${result.error || result.stderr || result.stdout}`);
  const plan = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  if (!plan.valid) throw new Error(`${asset.id}: invalid plan`);
  plans.push({ id: asset.id, label: asset.label, commandArguments: args, estimatedCredits: asset.rig ? 75 : 40,
    runtimeFile: `${manifest.runtimeDirectory}/${asset.id}.glb`, plan });
  console.log(`${asset.id}: ${plan.valid ? 'valid' : 'INVALID'}; ${plan.model}; ${plan.steps.map(s => s.name).join(' -> ')}`);
}
fs.mkdirSync('dev', { recursive: true });
fs.writeFileSync('dev/tripo-plan.json', JSON.stringify({ status: 'awaiting-credit-approval',
  estimatedCredits: plans.reduce((sum, p) => sum + p.estimatedCredits, 0), plans }, null, 2) + '\n');
console.log('Saved dev/tripo-plan.json. No generation submitted.');
