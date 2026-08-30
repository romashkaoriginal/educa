// Утилита для fetch с автоматическим добавлением Telegram initData
import { inferRequest, reportApiFailure, reportClientError } from '../utils/errorReporter';

export const getTelegramInitData = () => window.Telegram?.WebApp?.initData || '';

const getInitData = getTelegramInitData;
const DEFAULT_TIMEOUT_MS = 12000;

export const apiFetch = async (url, options = {}) => {
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

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {}),
        'x-telegram-init-data': initData,
      },
    });
    if (!response.ok) void reportApiFailure(response, url, fetchOptions);
    return response;
  } catch (error) {
    if (error?.name !== 'AbortError') {
      reportClientError({
        ...inferRequest(url, fetchOptions.method || 'GET'),
        message: error?.message || 'Сетевая ошибка',
        stack: error?.stack,
        code: 'NETWORK_ERROR'
      });
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
};
