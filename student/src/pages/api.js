// Утилита для fetch с автоматическим добавлением Telegram initData
export const getTelegramInitData = () => window.Telegram?.WebApp?.initData || '';

const getInitData = getTelegramInitData;
const DEFAULT_TIMEOUT_MS = 12000;

export const apiFetch = (url, options = {}) => {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const initData = getInitData();
  const controller = new AbortController();
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  return fetch(url, {
    ...fetchOptions,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
      'x-telegram-init-data': initData,
    },
  }).finally(() => {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  });
};
