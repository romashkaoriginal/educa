import { apiFetch } from './api';

describe('apiFetch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.Telegram = { WebApp: { initData: 'signed-init-data' } };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
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
    jest.advanceTimersByTime(25);

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal.aborted).toBe(true);
  });
});
