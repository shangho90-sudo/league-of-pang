param([Parameter(Mandatory=$true)][string]$AssetId)
$ErrorActionPreference = 'Stop'
$plan = Get-Content -Raw -LiteralPath 'dev/tripo-hero-plan.json' | ConvertFrom-Json
if ($plan.status -ne 'approved') { throw 'This production plan has not been approved.' }
$asset = $plan.plans | Where-Object { $_.id -eq $AssetId }
if (-not $asset) { throw "Unknown approved asset: $AssetId" }
$recordDir = '_art/tripo-heroes/records'
New-Item -ItemType Directory -Force -Path $recordDir | Out-Null
$recordPath = Join-Path $recordDir ($AssetId + '.json')
$lockPath = Join-Path $recordDir ($AssetId + '.started')
if ((Test-Path -LiteralPath $recordPath) -or (Test-Path -LiteralPath $lockPath)) {
  throw "Asset already submitted. Resume the existing task instead: $AssetId"
}
Set-Content -LiteralPath $lockPath -Value (Get-Date -Format o)
$assetArgs = @($asset.commandArguments) + @('--json', '--yes')
$env:TRIPO_CLIENT_APP = 'codex'
$env:TRIPO_DISTRIBUTION_CHANNEL = 'codex_plugin'
& tripo @assetArgs | Tee-Object -FilePath $recordPath
exit $LASTEXITCODE
