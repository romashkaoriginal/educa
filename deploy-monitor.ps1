# Выкладка только production monitor. Не запускает и не изменяет test-сервер.
$sshHost = "root@93.125.82.173"
$remoteRoot = "/opt/educa"

ssh $sshHost "mkdir -p ${remoteRoot}/monitor"
scp docker-compose.yml "${sshHost}:${remoteRoot}/"
scp monitor/Dockerfile monitor/entrypoint.sh "${sshHost}:${remoteRoot}/monitor/"

ssh $sshHost "cd $remoteRoot && docker compose config --quiet && docker compose build monitor && docker compose up -d --no-deps monitor && docker compose ps monitor"

Write-Host "Production monitor deployed. Check: ssh $sshHost 'cd $remoteRoot && docker compose logs --tail=50 monitor'"
