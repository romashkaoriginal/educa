// Утилита для fetch с автоматическим добавлением Telegram initData
export const getTelegramInitData = () => window.Telegram?.WebApp?.initData || '';

const getInitData = getTelegramInitData;

export const apiFetch = (url, options = {}) => {
  const initData = getInitData();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      'x-telegram-init-data': initData,
    },
  });
};