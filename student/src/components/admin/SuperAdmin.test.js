import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

test('показывает подробный живой журнал ошибок', async () => {
  adminFetch.mockImplementation(async (url) => ({
    ok: true,
    json: async () => url.includes('/error-logs') ? {
      logs: [{
        id: '91', source: 'backend', severity: 'error', statusCode: 500, code: 'DB_TIMEOUT',
        message: 'Не удалось сохранить ответ', area: 'practice', action: 'submit',
        method: 'POST', path: '/api/practice/answer', userId: 14, userName: 'Иван Петров',
        userRole: 'student', context: { topicId: 7, practiceTopicName: 'Дроби' }, occurrences: 2,
        firstSeenAt: '2026-08-30T12:00:00.000Z', lastSeenAt: '2026-08-30T12:01:00.000Z'
      }],
      total: 1,
      summary: { lastHour: 1, last24Hours: 1 }
    } : diagnostics
  }));

  render(<SuperAdmin />);
  const message = await screen.findByText('Не удалось сохранить ответ');
  expect(screen.getByText('×2')).toBeInTheDocument();
  fireEvent.click(message.closest('button'));
  expect(screen.getByText(/Иван Петров · Ученик · ID 14/)).toBeInTheDocument();
  expect(screen.getByText('Дроби')).toBeInTheDocument();
});
