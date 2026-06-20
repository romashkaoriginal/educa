# Run ONLY the backend locally against the local database.
# Prod (back/.env, kubik-ct.online) is NOT touched - vars are set for this process only.
#
# Run:  powershell -File back/dev-local.ps1

$env:DATABASE_URL = "postgresql://postgres:20342034@localhost:5432/kubik_local"
$env:DATABASE_SSL = "false"
$env:NODE_ENV     = "development"
$env:PORT         = "5000"
$env:JWT_SECRET   = "local-dev-secret"

Set-Location $PSScriptRoot
Write-Host "Local backend -> localhost:5000, DB -> kubik_local (local PostgreSQL)" -ForegroundColor Green
npm run dev
