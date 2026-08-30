# Деплой фронтенда и бэкенда на test VPS.
# Секреты и доменные переменные уже настроены на сервере и намеренно не копируются.
$sshHost = "root@87.232.67.145"
$remoteRoot = "/opt/educa"

scp student/Dockerfile student/package.json student/package-lock.json student/nginx.conf "${sshHost}:${remoteRoot}/student/"
scp -r student/scripts student/public student/src "${sshHost}:${remoteRoot}/student/"

scp back/Dockerfile back/package.json back/package-lock.json "${sshHost}:${remoteRoot}/back/"
scp -r back/src "${sshHost}:${remoteRoot}/back/"

ssh $sshHost "cd $remoteRoot && docker compose -p educa_test build frontend backend && docker compose -p educa_test up -d frontend backend && docker image prune -f && docker builder prune -f"

Write-Host "Test deployment complete: https://test.ct-kubik.online"
