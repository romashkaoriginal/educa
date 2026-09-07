// Утилита для fetch с автоматическим добавлением Telegram initData
import { inferRequest, reportClientError } from '../utils/errorReporter';

export const getTelegramInitData = () => window.Telegram?.WebApp?.initData || '';

const getInitData = getTelegramInitData;
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 350;

const isRequestRetryable = (method) => ['GET', 'HEAD'].includes(String(method || 'GET').toUpperCase());
const isResponseRetryable = (response) => response?.status === 429 || response?.status >= 500;
const isVisibleAndOnline = () => (
  (typeof navigator === 'undefined' || navigator.onLine !== false)
  && (typeof document === 'undefined' || document.visibilityState !== 'hidden')
);

const retryDelay = (ms, signal) => {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timerId = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timerId);
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
};

export const apiFetch = async (url, options = {}) => {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const initData = getInitData();
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const maxRetries = isRequestRetryable(method) ? Math.max(0, Math.min(3, Number(retries) || 0)) : 0;
  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    if (externalSignal?.aborted) abortFromExternalSignal();
    else externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        method,
        signal: controller.signal,
        headers: {
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...(fetchOptions.headers || {}),
          'x-telegram-init-data': initData,
        },
      });

      if (attempt < maxRetries && isResponseRetryable(response) && isVisibleAndOnline()) {
        await retryDelay(retryDelayMs * (2 ** attempt), externalSignal);
        continue;
      }

      // HTTP-ошибки регистрирует backend — повторная запись с frontend не нужна.
      return response;
    } catch (error) {
      const externallyAborted = Boolean(externalSignal?.aborted);
      const mayRetry = !externallyAborted
        && !timedOut
        && attempt < maxRetries
        && isVisibleAndOnline();

      if (mayRetry) {
        await retryDelay(retryDelayMs * (2 ** attempt), externalSignal);
        continue;
      }

      if (!externallyAborted && isVisibleAndOnline()) {
        reportClientError({
          ...inferRequest(url, method),
          message: timedOut ? 'Превышено время ожидания ответа' : (error?.message || 'Сетевая ошибка'),
          stack: error?.stack,
          code: timedOut ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
          severity: 'warning',
          context: { attempts: attempt + 1 }
        });
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortFromExternalSignal);
    }
  }

  throw new Error('Request failed without a response');
};
