// AdminPanel использует тот же устойчивый транспорт: Telegram initData,
// тайм-ауты, повторы безопасных GET и единое сетевое логирование.
import { apiFetch, getTelegramInitData } from '../../pages/api';

export { getTelegramInitData };

export const adminFetch = (url, options = {}) => apiFetch(url, options);
