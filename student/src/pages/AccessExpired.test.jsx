import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AccessExpired, { MANAGER_CONTACT_URL } from './AccessExpired';
import { apiFetch, ACCESS_EXPIRED_EVENT, ACCESS_NOT_STARTED_EVENT } from './api';

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

  it('будущий доступ показывает дату начала по Минску и не предлагает продление', () => {
    render(<AccessExpired startsAt="2026-10-08T10:22:00Z" />);
    expect(screen.getByText('Доступ ещё не начался')).toBeTruthy();
    expect(screen.getByText(/8 октября.*13:22/)).toBeTruthy();
    expect(screen.queryByText(/продлить доступ/)).toBeNull();
  });

  it('apiFetch передаёт дату начала отдельно от события истёкшего доступа', async () => {
    const listener = vi.fn();
    const expired = vi.fn();
    window.addEventListener(ACCESS_NOT_STARTED_EVENT, listener);
    window.addEventListener(ACCESS_EXPIRED_EVENT, expired);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'ACCESS_NOT_STARTED', startsAt: '2026-10-08T10:22:00Z' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )));
    await apiFetch('/api/practice/student/632');
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.removeEventListener(ACCESS_NOT_STARTED_EVENT, listener);
    window.removeEventListener(ACCESS_EXPIRED_EVENT, expired);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.startsAt).toBe('2026-10-08T10:22:00Z');
    expect(expired).not.toHaveBeenCalled();
  });
});
