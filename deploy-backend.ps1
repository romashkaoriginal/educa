# Деплой бэкенда на VPS
$sshHost = "root@93.125.82.173"
$remote = "/opt/educa/back"

scp back/Dockerfile "${sshHost}:${remote}/"
scp back/package.json "${sshHost}:${remote}/"
scp back/package-lock.json "${sshHost}:${remote}/"
scp -r back/src "${sshHost}:${remote}/"

ssh $sshHost "cd /opt/educa && docker compose build --no-cache backend && docker compose up -d backend"

Write-Host "Backend done."
