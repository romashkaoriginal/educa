import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import SuperAdmin, { formatBytes, getMemoryStatus } from './SuperAdmin';
import { adminFetch } from './adminApi';

jest.mock('./adminApi', () => ({ adminFetch: jest.fn() }));

const diagnostics = {
  memory: {
    totalBytes: 2 * 1024 ** 3,
    usedBytes: 768 * 1024 ** 2,
    availableBytes: 1280 * 1024 ** 2,
    processBytes: 96 * 1024 ** 2,
    usagePercent: 37.5,
  },
  onlineUsers: 7,
  measuredAt: '2026-08-29T12:30:15.000Z',
};

beforeEach(() => {
  adminFetch.mockResolvedValue({ ok: true, json: async () => diagnostics });
});

afterEach(() => jest.clearAllMocks());

test('показывает память и уникальных онлайн-пользователей', async () => {
  render(<SuperAdmin />);

  expect(await screen.findByText('7')).toBeInTheDocument();
  expect(screen.getByText('768 МБ')).toBeInTheDocument();
  expect(screen.getByText('1,3 ГБ')).toBeInTheDocument();
  expect(screen.getByText('2,0 ГБ')).toBeInTheDocument();
  expect(screen.getByText('Норма')).toBeInTheDocument();
  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/admin/diagnostics'),
    { cache: 'no-store' },
  ));
});

test('выбирает предупреждение по проценту памяти', () => {
  expect(getMemoryStatus(74.9).tone).toBe('normal');
  expect(getMemoryStatus(75).tone).toBe('warning');
  expect(getMemoryStatus(90).tone).toBe('critical');
});

test('форматирует объём памяти для интерфейса', () => {
  expect(formatBytes(512 * 1024 ** 2)).toBe('512 МБ');
  expect(formatBytes(2 * 1024 ** 3)).toBe('2,0 ГБ');
});
