# Деплой фронта на VPS (все файлы, нужные для docker build)
$sshHost = "root@93.125.82.173"
$remote = "/opt/educa/student"

scp student/Dockerfile "${sshHost}:${remote}/"
scp student/package.json "${sshHost}:${remote}/"
scp student/package-lock.json "${sshHost}:${remote}/"
scp student/nginx.conf "${sshHost}:${remote}/"
scp -r student/scripts "${sshHost}:${remote}/"
scp -r student/public "${sshHost}:${remote}/"
scp -r student/src "${sshHost}:${remote}/"

ssh $sshHost "cd /opt/educa && docker compose build --no-cache frontend && docker compose up -d frontend"

Write-Host "Frontend done. Check: https://kubik-ct.online/version.json"
