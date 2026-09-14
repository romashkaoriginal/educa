function normalizeTelegramId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) {
    const error = new Error('Telegram ID должен содержать только цифры');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function normalizeTelegramUsername(value) {
  const normalized = String(value ?? '').trim().replace(/^@+/, '').toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_]{5,32}$/.test(normalized)) {
    const error = new Error('Некорректный Telegram username');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

// Старые записи могли сохраниться с одним или несколькими символами @.
// Новые значения всегда хранятся без @, а варианты нужны только для поиска
// и безопасного автоматического исправления исторических данных.
function telegramUsernameCandidates(value) {
  const username = normalizeTelegramUsername(value);
  if (!username) return [];
  return [username, `@${username}`, `@@${username}`, `@@@${username}`];
}

module.exports = {
  normalizeTelegramId,
  normalizeTelegramUsername,
  telegramUsernameCandidates
};
