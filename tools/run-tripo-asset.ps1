param([Parameter(Mandatory=$true)][string]$AssetId)
$ErrorActionPreference = 'Stop'
$plan = Get-Content -Raw -LiteralPath 'dev/tripo-plan.json' | ConvertFrom-Json
$asset = $plan.plans | Where-Object { $_.id -eq $AssetId }
if (-not $asset) { throw "Unknown approved asset: $AssetId" }
$recordDir = '_art/tripo-map/records'
New-Item -ItemType Directory -Force -Path $recordDir | Out-Null
$recordPath = Join-Path $recordDir ($AssetId + '.json')
$lockPath = Join-Path $recordDir ($AssetId + '.started')
if ((Test-Path -LiteralPath $recordPath) -or (Test-Path -LiteralPath $lockPath)) {
  throw "Asset already submitted. Inspect its record and resume the existing task; do not submit twice: $AssetId"
}
Set-Content -LiteralPath $lockPath -Value (Get-Date -Format o)
$assetArgs = @($asset.commandArguments) + @('--json', '--yes')
$env:TRIPO_CLIENT_APP = 'codex'
$env:TRIPO_DISTRIBUTION_CHANNEL = 'codex_plugin'
& tripo @assetArgs | Tee-Object -FilePath $recordPath
exit $LASTEXITCODE
