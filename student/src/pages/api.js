// Утилита для fetch с автоматическим добавлением Telegram initData
const getInitData = () => window.Telegram?.WebApp?.initData || '';

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