param([switch]$ValidateOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$sshHost = 'root@93.125.82.173'
$remoteRoot = '/opt/educa'
$composeProject = 'educa'
$healthUrl = 'https://kubik-ct.online/'

function Invoke-Checked {
  if ($args.Count -lt 1) { throw 'No command supplied.' }
  $command = @($args)
  & $command[0] @($command[1..($command.Count - 1)])
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code ${LASTEXITCODE}: $($command -join ' ')" }
}

Invoke-Checked ssh $sshHost "test -d $remoteRoot/student -a -d $remoteRoot/back -a -f $remoteRoot/docker-compose.yml"
if ($ValidateOnly) { Write-Host 'Production deployment configuration is valid.'; exit 0 }
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
