import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AccessExpired, { MANAGER_CONTACT_URL } from './AccessExpired';
import { apiFetch, ACCESS_EXPIRED_EVENT } from './api';

afterEach(() => { vi.restoreAllMocks(); });

describe('AccessExpired', () => {
  it('показывает блокировку со ссылкой на менеджера', () => {
    render(<AccessExpired />);
    expect(screen.getByText('Доступ закончился')).toBeTruthy();
    expect(screen.getByText(/продлить доступ на следующий месяц/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Написать менеджеру' }).getAttribute('href')).toBe(MANAGER_CONTACT_URL);
  });

  it('apiFetch сообщает приложению о 403 ACCESS_EXPIRED', async () => {
    const listener = vi.fn();
    window.addEventListener(ACCESS_EXPIRED_EVENT, listener);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'ACCESS_EXPIRED' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )));
    await apiFetch('/api/practice/student/1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.removeEventListener(ACCESS_EXPIRED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
