// Утилита для fetch с Telegram initData (для AdminPanel)
import { inferRequest, reportApiFailure, reportClientError } from '../../utils/errorReporter';

export const getTelegramInitData = () => window.Telegram?.WebApp?.initData || '';

const getInitData = getTelegramInitData;

export const adminFetch = async (url, options = {}) => {
  const initData = getInitData();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
        'x-telegram-init-data': initData,
      },
    });
    if (!response.ok) void reportApiFailure(response, url, options);
    return response;
  } catch (error) {
    reportClientError({
      ...inferRequest(url, options.method || 'GET'),
      message: error?.message || 'Сетевая ошибка',
      stack: error?.stack,
      code: 'NETWORK_ERROR'
    });
    throw error;
  }
};
