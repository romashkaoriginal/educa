import { apiFetch } from './api';
import { reportClientError } from '../utils/errorReporter';

vi.mock('../utils/errorReporter', () => ({
  inferRequest: (url, method) => ({ path: url, method }),
  reportClientError: vi.fn()
}));

describe('apiFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.Telegram = { WebApp: { initData: 'signed-init-data' } };
    global.fetch = vi.fn();
    reportClientError.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('передаёт Telegram initData и пользовательские заголовки', async () => {
    fetch.mockResolvedValue({ ok: true });

    await apiFetch('/api/example', { headers: { 'x-request-id': 'request-1' } });

    expect(fetch).toHaveBeenCalledWith('/api/example', expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-request-id': 'request-1',
        'x-telegram-init-data': 'signed-init-data',
      }),
      signal: expect.any(AbortSignal),
    }));
  });

  test('прерывает зависший запрос по тайм-ауту', async () => {
    let requestSignal;
    fetch.mockImplementation((url, options) => {
      requestSignal = options.signal;
      return new Promise((resolve, reject) => {
        requestSignal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const request = apiFetch('/api/slow', { timeoutMs: 25 });
    vi.advanceTimersByTime(25);

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal.aborted).toBe(true);
  });

  test('повторяет безопасный GET после временной сетевой ошибки', async () => {
    fetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await apiFetch('/api/retry', { retryDelayMs: 0 });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  test('не повторяет POST и сообщает только о финальном сетевом сбое', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiFetch('/api/submit', { method: 'POST', retryDelayMs: 0 })).rejects.toThrow('Failed to fetch');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'NETWORK_ERROR',
      severity: 'warning',
      context: { attempts: 1 }
    }));
  });
});
