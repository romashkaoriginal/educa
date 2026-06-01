// Утилита для fetch с Telegram initData (для AdminPanel)
const getInitData = () => window.Telegram?.WebApp?.initData || '';

export const adminFetch = (url, options = {}) => {
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