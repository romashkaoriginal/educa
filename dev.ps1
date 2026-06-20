# Local run of the whole project with one command: backend + frontend.
# Everything runs on YOUR machine (localhost). Prod / VPS is NOT touched.
# Database = your local PostgreSQL 17 (database "kubik_local").
#
# Run:   powershell -File dev.ps1
# Stop:  close the two opened windows "KUBIK backend" and "KUBIK frontend".

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$dbUrl = "postgresql://postgres:20342034@localhost:5432/kubik_local"

# Make sure local Postgres service is running
$svc = Get-Service -Name "postgresql-x64-17" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne "Running") {
    Write-Host "Starting PostgreSQL service..." -ForegroundColor Cyan
    Start-Service "postgresql-x64-17"
}

# --- Backend in its own window (localhost:5000, local DB) ---
Write-Host "Starting backend -> localhost:5000" -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle='KUBIK backend';" +
    "`$env:DATABASE_URL='$dbUrl';" +
    "`$env:DATABASE_SSL='false'; `$env:NODE_ENV='development';" +
    "`$env:PORT='5000'; `$env:JWT_SECRET='local-dev-secret';" +
    "Set-Location '$root\back'; npm run dev"
)

# --- Frontend in its own window (localhost:3000 -> talks to local backend) ---
Write-Host "Starting frontend -> localhost:3000" -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle='KUBIK frontend';" +
    "Set-Location '$root\student'; npm start"
)

Write-Host ""
Write-Host "Done. Open http://localhost:3000 (it opens automatically in ~20s)." -ForegroundColor Yellow
Write-Host "Backend and frontend logs are in the two new PowerShell windows." -ForegroundColor DarkGray
