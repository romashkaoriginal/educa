<#
.SYNOPSIS
  Изолированное локальное тестовое окружение для проверки викторины (и
  прочего backend-кода) на актуальном коде — без Docker, без прод/dev БД.

  Поднимает отдельный кластер Postgres во .local-test-env/pgdata (порт 54329,
  auth=trust, отдельный от системного Postgres), заполняет его сидом
  (предмет, учитель, N учеников, живое занятие, викторина с вопросами) и
  либо просто держит окружение готовым, либо запускает backend.

.PARAMETER Action
  start   — поднять изолированный Postgres (idempotent, если уже поднят — молча продолжит)
  stop    — остановить изолированный Postgres
  seed    — засеять тестовые данные (Postgres должен быть поднят)
  serve   — запустить backend на этой БД (порт 5057) в текущем окне
  status  — показать, поднят ли кластер

.EXAMPLE
  .\local-test-env.ps1 start
  .\local-test-env.ps1 seed -Students 50 -Questions 10
  .\local-test-env.ps1 serve
  # в другом окне:
  cd back; $env:LOAD_TEST_URL="http://localhost:5057"; ...; node scripts/quizLoadTest.js
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'seed', 'serve', 'status')]
  [string]$Action = 'status',

  [int]$Students = 50,
  [int]$Questions = 10
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$dataDir = Join-Path $root '.local-test-env\pgdata'
$logDir = Join-Path $root '.local-test-env\pglog'
$logFile = Join-Path $logDir 'server.log'

function Test-PgRunning {
  $result = & "$pgBin\pg_ctl.exe" -D $dataDir status 2>&1
  return $LASTEXITCODE -eq 0
}

switch ($Action) {
  'start' {
    if (-not (Test-Path $dataDir)) {
      Write-Host "Кластер не инициализирован. Запусти сначала:"
      Write-Host "  & `"$pgBin\initdb.exe`" -D `"$dataDir`" -U educa_test --auth=trust -E UTF8"
      Write-Host "  и выставь port = 54329 в $dataDir\postgresql.conf"
      exit 1
    }
    if (Test-PgRunning) {
      Write-Host "Изолированный Postgres уже поднят (порт 54329)."
    } else {
      New-Item -ItemType Directory -Force -Path $logDir | Out-Null
      & "$pgBin\pg_ctl.exe" -D $dataDir -l $logFile start
      Write-Host "Изолированный Postgres поднят на порту 54329."
    }
  }
  'stop' {
    if (Test-PgRunning) {
      & "$pgBin\pg_ctl.exe" -D $dataDir stop
      Write-Host "Изолированный Postgres остановлен."
    } else {
      Write-Host "Уже не запущен."
    }
  }
  'status' {
    if (Test-PgRunning) { Write-Host "Изолированный Postgres: работает (порт 54329)." }
    else { Write-Host "Изолированный Postgres: не запущен." }
  }
  'seed' {
    if (-not (Test-PgRunning)) {
      Write-Host "Сначала подними Postgres: .\local-test-env.ps1 start"
      exit 1
    }
    Push-Location (Join-Path $root 'back')
    try {
      Get-Content .env.localtest | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
          [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
        }
      }
      node scripts/seedLocalTestEnv.js $Students $Questions
    } finally { Pop-Location }
  }
  'serve' {
    if (-not (Test-PgRunning)) {
      Write-Host "Сначала подними Postgres: .\local-test-env.ps1 start"
      exit 1
    }
    Push-Location (Join-Path $root 'back')
    try {
      Get-Content .env.localtest | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
          [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
        }
      }
      node src/app.js
    } finally { Pop-Location }
  }
}
