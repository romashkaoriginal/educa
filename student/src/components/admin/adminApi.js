// Утилита для fetch с Telegram initData (для AdminPanel)
const getInitData = () => window.Telegram?.WebApp?.initData || '';

export const adminFetch = (url, options = {}) => {
  const initData = getInitData();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  return fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
      'x-telegram-init-data': initData,
    },
  });
};