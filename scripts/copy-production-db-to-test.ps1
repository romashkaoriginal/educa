# One-time PostgreSQL copy. Never copies environment files, roles or credentials.
# Requires SSH key access and disabled Telegram/CRM delivery on the test backend.
# Run -ValidateOnly for read-only checks. There is deliberately no safety bypass.
[CmdletBinding()]
param([switch]$ValidateOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sourceHost = 'root@93.125.82.173'
$targetHost = 'root@87.232.67.145'
$sshOptions = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes')

function Invoke-RemoteScript {
    param([string]$Server, [string]$Script)
    # PowerShell may append CRLF when piping to native processes. Normalize on
    # the receiving end as well, including the last heredoc delimiter.
    $result = $Script.Replace("`r", '') | & ssh @sshOptions $Server 'tr -d ''\r'' | bash -se'
    if ($LASTEXITCODE -ne 0) { throw "Remote operation failed on $Server. Inspect the last completed step; do not blindly rerun." }
    return ($result -join "`n")
}

function Get-EnvironmentMap {
    param($Container)
    $values = @{}
    foreach ($entry in $Container.Config.Env) {
        $pair = $entry -split '=', 2
        $values[$pair[0]] = $pair[1]
    }
    return $values
}

function Get-ServerState {
    param([string]$Server, [string]$Project)
    $raw = Invoke-RemoteScript $Server "docker inspect $Project-backend-1 $Project-postgres-1"
    $containers = @($raw | ConvertFrom-Json)
    $backend = $containers[0]
    $postgres = $containers[1]
    $appEnv = Get-EnvironmentMap $backend
    $dbEnv = Get-EnvironmentMap $postgres
    $uri = [uri]$appEnv['DATABASE_URL']
    if ($uri.Host -ne 'postgres' -or $uri.AbsolutePath -ne '/educa' -or
        $dbEnv['POSTGRES_USER'] -ne 'educa' -or $dbEnv['POSTGRES_DB'] -ne 'educa') {
        throw "Unexpected database connection on $Server. Expected the local educa database."
    }
    foreach ($container in $containers) {
        if ($container.Config.Labels.'com.docker.compose.project' -ne $Project -or
            @($container.NetworkSettings.Networks.PSObject.Properties.Name).Count -ne 1 -or
            $container.NetworkSettings.Networks.PSObject.Properties.Name -ne "${Project}_default") {
            throw "Unexpected container project or network on $Server."
        }
        if (-not $container.State.Running) { throw "Expected running containers on $Server." }
    }
    if ($null -ne $postgres.NetworkSettings.Ports.'5432/tcp') { throw "Database port is published on $Server." }
    $dataMount = @($postgres.Mounts | Where-Object { $_.Destination -eq '/var/lib/postgresql/data' })
    if ($dataMount.Count -ne 1 -or $dataMount[0].Type -ne 'volume' -or
        $dataMount[0].Name -ne "${Project}_postgres_data") { throw "Unexpected database storage on $Server." }
    $databaseCheck = @'
docker exec -i __PROJECT__-postgres-1 psql -X -U educa -d educa -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT json_build_object(
  'subscriptions', (SELECT count(*) FROM pg_subscription),
  'publications', (SELECT count(*) FROM pg_publication),
  'foreign_servers', (SELECT count(*) FROM pg_foreign_server),
  'extra_extensions', (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql'),
  'encoding', pg_encoding_to_char(encoding), 'collation', datcollate, 'ctype', datctype,
  'version', current_setting('server_version_num')::int / 10000,
  'bytes', pg_database_size(current_database())
) FROM pg_database WHERE datname = current_database();
SQL
'@
    $info = (Invoke-RemoteScript $Server ($databaseCheck.Replace('__PROJECT__', $Project))) | ConvertFrom-Json
    if ($info.subscriptions -ne 0 -or $info.publications -ne 0 -or $info.foreign_servers -ne 0 -or $info.extra_extensions -ne 0) {
        throw "Replication, external database dependencies or extra extensions need manual review on $Server."
    }
    return @{ App = $appEnv; Db = $dbEnv; Info = $info }
}

function Assert-TestDeliveryDisabled {
    param($State)
    $credentialsPresent = -not [string]::IsNullOrWhiteSpace($State.App['BOT_TOKEN']) -or
        -not [string]::IsNullOrWhiteSpace($State.App['AMOCRM_TOKEN'])
    if ($credentialsPresent) {
        if ($State.App['EXTERNAL_DELIVERY_ENABLED'] -ne 'false') {
            throw 'SAFETY STOP: disable external delivery on test before copying. No database was replaced.'
        }
        # A flag alone is insufficient: verify the running image implements and
        # enforces both guards, while preserving BOT_TOKEN for Mini App login.
        $probe = @'
docker exec -i educa_test-backend-1 node <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED, 'false');
  for (const file of ['/app/src/bot.js', '/app/src/services/amocrm.js']) {
    assert.ok(fs.readFileSync(file, 'utf8').includes("process.env.EXTERNAL_DELIVERY_ENABLED === 'false'"), 'Delivery guard missing');
  }
  const bot = require('/app/src/bot');
  bot.startBot();
  assert.equal(bot.getBot(), null);
  const result = await require('/app/src/services/amocrm').sendToAmoCRM({});
  assert.equal(result.disabled, true);
  assert.equal(result.ok, false);
  console.log('Verified: Telegram and amoCRM delivery disabled');
  process.exit(0);
})().catch(error => { console.error(error.message); process.exit(1); });
JS
'@
        Invoke-RemoteScript $targetHost $probe | Write-Host
    }
    $running = Invoke-RemoteScript $targetHost 'docker ps --filter label=com.docker.compose.project=educa_test --format ''{{.Label "com.docker.compose.service"}}'''
    $unexpected = @($running -split "`n" | Where-Object { $_ -and $_ -notin @('postgres', 'backend', 'frontend') })
    if ($unexpected.Count) { throw 'Additional test services are running; review their database access and delivery before copying.' }
}

Write-Host 'Checking source and destination (read-only)...'
$source = Get-ServerState $sourceHost 'educa'
$target = Get-ServerState $targetHost 'educa_test'
foreach ($property in @('encoding', 'collation', 'ctype', 'version')) {
    if ($source.Info.$property -ne $target.Info.$property) { throw "Database $property differs; manual compatibility review required." }
}
if ($source.Db['POSTGRES_PASSWORD'] -eq $target.Db['POSTGRES_PASSWORD'] -or
    $source.App['JWT_SECRET'] -eq $target.App['JWT_SECRET']) { throw 'Test and production credentials must be independent.' }
Assert-TestDeliveryDisabled $target
Write-Host 'Isolation and delivery checks passed.'
if ($ValidateOnly) { Write-Host 'Validation only: no changes made.'; return }

$runId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '_' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$backupDir = "/opt/educa/backups/db-copy-$runId"
$stageDb = 'educa_copy_' + $runId.ToLowerInvariant()
$oldDb = 'educa_before_' + $runId.ToLowerInvariant()

# Only backup-file creation and pg_dump occur on production. No application stop,
# SQL mutation, role export, restore, cleanup or replication setup is performed there.
$dumpScript = @'
set -euo pipefail
umask 077
test -d /opt/educa
mkdir -p /opt/educa/backups
mkdir __DIR__
available=$(df -PB1 /opt/educa | awk 'NR==2 {print $4}')
required=$(docker exec educa-postgres-1 psql -X -U educa -d educa -Atc 'SELECT pg_database_size(current_database()) * 3')
test "$available" -gt "$required"
docker exec educa-postgres-1 pg_dump -U educa -d educa --format=custom --lock-wait-timeout=30s > __DIR__/production.dump
test -s __DIR__/production.dump
sha256sum __DIR__/production.dump | cut -d ' ' -f 1
'@
Write-Host "Creating production snapshot; retained at $sourceHost $backupDir/production.dump"
$sourceHash = Invoke-RemoteScript $sourceHost ($dumpScript.Replace('__DIR__', $backupDir))
if ($sourceHash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid source archive checksum.' }

Write-Host 'Preparing protected backup directory on test...'
Invoke-RemoteScript $targetHost "umask 077`nmkdir -p /opt/educa/backups`nmkdir $backupDir" | Out-Null
# scp -3 transfers through this machine using SSH, without saving the dump locally.
& scp @sshOptions -3 "${sourceHost}:$backupDir/production.dump" "${targetHost}:$backupDir/production.dump"
if ($LASTEXITCODE -ne 0) { throw 'Archive transfer failed. Test database has not been changed.' }
$targetHash = Invoke-RemoteScript $targetHost "sha256sum $backupDir/production.dump | cut -d ' ' -f 1"
if ($sourceHash -ne $targetHash) { throw 'Archive checksum mismatch. Test database has not been changed.' }

# Repeat the guard immediately before starting any restore work.
$target = Get-ServerState $targetHost 'educa_test'
Assert-TestDeliveryDisabled $target

$restoreScript = @'
set -euo pipefail
umask 077
cd /opt/educa
exec 9>/opt/educa/backups/db-copy.lock
flock -n 9 || { echo 'Another database copy is in progress.'; exit 1; }
test -s __DIR__/production.dump
available=$(df -PB1 /opt/educa | awk 'NR==2 {print $4}')
test "$available" -gt __REQUIRED_BYTES__
docker exec educa_test-postgres-1 createdb -U educa -T template0 __STAGE__
docker exec -i educa_test-postgres-1 pg_restore -U educa -d __STAGE__ --no-owner --no-privileges --exit-on-error --single-transaction < __DIR__/production.dump
docker exec -i educa_test-postgres-1 psql -X -U educa -d __STAGE__ -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'restored_tables=' || count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');
SELECT format('SELECT %L AS table_name, count(*) AS rows FROM %I.%I;', schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname, tablename;
\gexec
SQL
echo 'Staging restore verified. Stopping test backend for backup and cutover.'
docker compose -p educa_test stop backend
# If anything fails after this point, leave backend stopped for inspection.
# Both the archive and original database are retained; no DROP is used.
docker exec educa_test-postgres-1 pg_dump -U educa -d educa -Fc --lock-wait-timeout=30s > __DIR__/test-before.dump
test -s __DIR__/test-before.dump
docker exec -i educa_test-postgres-1 pg_restore --list < __DIR__/test-before.dump > /dev/null
docker exec -i educa_test-postgres-1 psql -X -U educa -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'educa' AND pid <> pg_backend_pid();
BEGIN;
ALTER DATABASE educa RENAME TO __OLD__;
ALTER DATABASE __STAGE__ RENAME TO educa;
COMMIT;
SQL
echo 'Database cutover complete. Original database retained as __OLD__.'
docker compose -p educa_test start backend
healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --output /dev/null http://127.0.0.1:5000/; then healthy=true; break; fi
  sleep 2
done
if [ "$healthy" != true ]; then
  docker compose -p educa_test stop backend
  echo 'Backend health check failed. Left stopped. Restore previous database names after investigation.'
  exit 1
fi
docker exec educa_test-postgres-1 psql -X -U educa -d educa -At -v ON_ERROR_STOP=1 -c "SELECT 'active_database=' || current_database(); SELECT 'subscriptions=' || count(*) FROM pg_subscription;"
echo 'COPY COMPLETE: production database unchanged; no synchronization configured.'
echo 'Backup directory: __DIR__'
echo 'Previous test database: __OLD__'
'@
$requiredBytes = ([long]$source.Info.bytes * 6 + [long]$target.Info.bytes * 3).ToString([Globalization.CultureInfo]::InvariantCulture)
$restoreScript = $restoreScript.Replace('__DIR__', $backupDir).Replace('__STAGE__', $stageDb).Replace('__OLD__', $oldDb).Replace('__REQUIRED_BYTES__', $requiredBytes)
Write-Host 'Restoring snapshot into a separate database on test; original test database is still intact...'
Invoke-RemoteScript $targetHost $restoreScript | Write-Host
Write-Host 'Copy completed. Keep the retained original database and backups until testing is finished.'
