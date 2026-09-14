param(
  [switch]$ValidateOnly,
  [string[]]$Files,
  [string]$Commit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$sshHost = 'root@93.125.82.173'
$remoteRoot = '/opt/educa'
$composeProject = 'educa'
$healthUrl = 'https://kubik-ct.online/'
$allowedRoots = @('back/src/', 'student/src/', 'student/public/', 'student/scripts/')
$allowedFiles = @('back/Dockerfile', 'back/package.json', 'back/package-lock.json', 'student/Dockerfile', 'student/package.json', 'student/package-lock.json', 'student/nginx.conf', 'student/index.html', 'student/vite.config.mjs')

function Invoke-Checked {
  $command = @($args)
  if ($command.Count -eq 0) { throw 'No command supplied.' }
  & $command[0] @($command[1..($command.Count - 1)])
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $($command -join ' ')" }
}

function ConvertTo-DeployPath([string]$Path) {
  $path = $Path.Replace('\', '/')
  if ([string]::IsNullOrWhiteSpace($path) -or [IO.Path]::IsPathRooted($Path) -or $path -match '(^|/)\.\.(/|$)' -or $path -notmatch '^[A-Za-z0-9._/-]+$') {
    throw "Invalid deployment path: $Path"
  }
  $allowed = $allowedFiles -contains $path
  if (-not $allowed) { $allowed = @($allowedRoots | Where-Object { $path.StartsWith($_, [StringComparison]::Ordinal) }).Count -gt 0 }
  if (-not $allowed) { throw "Only frontend/backend build inputs are allowed: $path" }
  return $path
}

function Get-CommitPaths([string]$Revision) {
  Invoke-Checked git rev-parse --verify "$Revision^{commit}" | Out-Null
  $paths = @(git diff-tree --root --no-commit-id --name-only -r $Revision)
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect commit $Revision" }
  $result = @()
  foreach ($path in $paths) { try { $result += ConvertTo-DeployPath $path } catch { } }
  if ($result.Count -eq 0) { throw "Commit $Revision has no deployable frontend/backend files." }
  return @($result | Sort-Object -Unique)
}

function Get-SelectedFilePaths([string[]]$InputPaths) {
  $paths = @()
  foreach ($item in $InputPaths) {
    foreach ($path in $item.Split(',', [StringSplitOptions]::RemoveEmptyEntries)) {
      $paths += ConvertTo-DeployPath $path.Trim()
    }
  }
  return @($paths | Sort-Object -Unique)
}

function Get-CommitSnapshot([string]$Revision, [string[]]$Paths) {
  $root = Join-Path ([IO.Path]::GetTempPath()) ("educa-deploy-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $root | Out-Null
  try {
    $existing = @(); $deleted = @()
    foreach ($path in $Paths) {
      git cat-file -e "${Revision}:$path" 2>$null
      if ($LASTEXITCODE -eq 0) { $existing += $path } else { $deleted += $path }
    }
    if ($existing.Count -gt 0) {
      git archive --format=tar $Revision -- $existing | tar -xf - -C $root
      if ($LASTEXITCODE -ne 0) { throw "Unable to extract commit $Revision" }
    }
    return @{ Root = $root; Existing = $existing; Deleted = $deleted }
  } catch { Remove-Item -LiteralPath $root -Recurse -Force; throw }
}

function Invoke-PreciseDeploy([string[]]$Paths, [string]$SourceRoot, [string[]]$Deleted = @()) {
  $services = @()
  if (@($Paths + $Deleted | Where-Object { $_.StartsWith('back/', [StringComparison]::Ordinal) }).Count -gt 0) { $services += 'backend' }
  if (@($Paths + $Deleted | Where-Object { $_.StartsWith('student/', [StringComparison]::Ordinal) }).Count -gt 0) { $services += 'frontend' }
  $services = @($services | Sort-Object -Unique)
  if ($services.Count -eq 0) { throw 'No service selected for rebuild.' }

  foreach ($path in $Paths) {
    $local = Join-Path $SourceRoot $path
    if (-not (Test-Path -LiteralPath $local -PathType Leaf)) { throw "Local file not found: $path" }
    $remote = "$remoteRoot/$path"
    Invoke-Checked ssh $sshHost "mkdir -p '$(Split-Path -Parent $remote)'"
    Invoke-Checked scp $local "${sshHost}:$remote"
  }
  foreach ($path in $Deleted) { Invoke-Checked ssh $sshHost "rm -f -- '$remoteRoot/$path'" }

  $serviceList = $services -join ' '
  Invoke-Checked ssh $sshHost "cd $remoteRoot && docker compose -p $composeProject build $serviceList && docker compose -p $composeProject up -d $serviceList"
  Start-Sleep -Seconds 3
  Invoke-Checked curl.exe --fail --silent --show-error --head $healthUrl
  Invoke-Checked ssh $sshHost "cd $remoteRoot && docker compose -p $composeProject ps $serviceList"
  Write-Host "Precise production deployment complete: $($Paths.Count) files; services: $serviceList"
}

$selectedFiles = @()
if ($null -ne $Files) { $selectedFiles = @(Get-SelectedFilePaths $Files) }
$hasFiles = $selectedFiles.Count -gt 0
if ($hasFiles -and -not [string]::IsNullOrWhiteSpace($Commit)) { throw 'Use either -Files or -Commit, not both.' }
Invoke-Checked ssh $sshHost "test -d $remoteRoot/student -a -d $remoteRoot/back -a -f $remoteRoot/docker-compose.yml"

if ($ValidateOnly) {
  if ($hasFiles) { $selectedFiles | Out-Null }
  if (-not [string]::IsNullOrWhiteSpace($Commit)) { Get-CommitPaths $Commit | Out-Null }
  Write-Host 'Production deployment configuration is valid.'
  exit 0
}

if ($hasFiles) {
  Invoke-PreciseDeploy -Paths $selectedFiles -SourceRoot $PSScriptRoot
  exit 0
}
if (-not [string]::IsNullOrWhiteSpace($Commit)) {
  $snapshot = Get-CommitSnapshot $Commit (Get-CommitPaths $Commit)
  try { Invoke-PreciseDeploy -Paths $snapshot.Existing -SourceRoot $snapshot.Root -Deleted $snapshot.Deleted }
  finally { Remove-Item -LiteralPath $snapshot.Root -Recurse -Force }
  exit 0
}

# Full deployment keeps the original clean-copy behavior.
Invoke-Checked ssh $sshHost "test $remoteRoot = /opt/educa && rm -rf $remoteRoot/student/src $remoteRoot/student/public $remoteRoot/student/scripts $remoteRoot/back/src"
Invoke-Checked scp student/Dockerfile student/package.json student/package-lock.json student/nginx.conf student/index.html student/vite.config.mjs "${sshHost}:${remoteRoot}/student/"
Invoke-Checked scp -r student/scripts student/public student/src "${sshHost}:${remoteRoot}/student/"
Invoke-Checked scp back/Dockerfile back/package.json back/package-lock.json "${sshHost}:${remoteRoot}/back/"
Invoke-Checked scp -r back/src "${sshHost}:${remoteRoot}/back/"
Invoke-Checked ssh $sshHost "cd $remoteRoot && docker compose -p $composeProject build frontend backend && docker compose -p $composeProject up -d frontend backend"
Start-Sleep -Seconds 3
Invoke-Checked curl.exe --fail --silent --show-error --head $healthUrl
Invoke-Checked ssh $sshHost "cd $remoteRoot && docker compose -p $composeProject ps"
Write-Host "Production deployment complete: $healthUrl"
