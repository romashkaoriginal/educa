const { purgeExpiredErrorLogs } = require('./errorLogging');

const RETENTION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let retentionTimer = null;

async function runRetention() {
  try {
    const removed = await purgeExpiredErrorLogs();
    if (removed > 0) console.log(`[ErrorLog] Удалено устаревших записей: ${removed}`);
  } catch (error) {
    console.error('[ErrorLog] Ошибка очистки устаревших логов:', error);
  }
}

function startErrorLogRetention() {
  void runRetention();
  retentionTimer = setInterval(runRetention, RETENTION_CHECK_INTERVAL_MS);
  retentionTimer.unref?.();
}

function stopErrorLogRetention() {
  if (retentionTimer) clearInterval(retentionTimer);
  retentionTimer = null;
}

module.exports = { runRetention, startErrorLogRetention, stopErrorLogRetention };
