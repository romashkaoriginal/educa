import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Parents from './Parents';
import { adminFetch } from './adminApi';

vi.mock('./adminApi', () => ({ adminFetch: vi.fn() }));
vi.mock('./useSectionRefresh', () => ({ useSectionRefresh: vi.fn() }));

const response = (data, ok = true) => Promise.resolve({ ok, json: async () => data });

beforeEach(() => {
  adminFetch.mockImplementation((url, options = {}) => {
    if (url.endsWith('/parents') && options.method === 'POST') {
      return response({ parent: { id: 22 } });
    }
    if (url.endsWith('/parents')) {
      return response({
        manualReportsEnabled: true,
        reportSchedule: {
          weekly: '2026-09-14T15:00:00.000Z',
          monthly: '2026-10-05T15:00:00.000Z'
        },
        parents: [{
          id: 10,
          telegramId: '555',
          telegramUsername: 'parent_one',
          firstName: 'Анна',
          isActive: true,
          students: [{
            id: 1,
            firstName: 'Иван',
            lastName: 'Ученик',
            isActive: true,
            subjects: [{ id: 3, name: 'Математика', icon: '📐', UserSubject: { isActive: true } }]
          }],
          lastReport: { status: 'sent' }
        }]
      });
    }
    if (url.endsWith('/students')) {
      return response({
        students: [
          { id: 1, firstName: 'Иван', lastName: 'Ученик' },
          { id: 2, firstName: 'Мария', lastName: 'Ученица' }
        ]
      });
    }
    if (url.endsWith('/parents/10/reports/weekly/preview') && options.method === 'POST') {
      return response({ parent: { id: 10, firstName: 'Анна' }, reportType: 'weekly', period: { startDate: '2026-09-08', endDate: '2026-09-14' }, messages: ['📊 <b>Еженедельный отчёт</b>\nРешено задач: <b>7</b>'], previewToken: 'signed-preview-token' });
    }
    if (url.endsWith('/parents/10/reports/weekly/send') && options.method === 'POST') return response({ message: 'Отчёт отправлен', messageCount: 1, status: 'sent' });
    return response({});
  });
});

afterEach(() => vi.clearAllMocks());

test('показывает связь с учеником и создаёт родителя по username', async () => {
  render(<Parents />);

  expect(await screen.findByText('Иван Ученик')).toBeInTheDocument();
  expect(screen.getByText('Доступ активен')).toBeInTheDocument();
  expect(screen.getByText('Отправлен')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Добавить родителя/i }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Ученики *'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: '@maria_parent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  await waitFor(() => {
    const call = adminFetch.mock.calls.find(([url, options]) => url.endsWith('/parents') && options?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body)).toMatchObject({
      studentIds: [2],
      telegramUsername: '@maria_parent'
    });
  });
});

test('менеджер просматривает и подтверждает недельный отчёт конкретного родителя', async () => {
  render(<Parents currentUser={{ role: 'manager' }} />);

  const button = await screen.findByRole('button', { name: 'Отправить отчёт за неделю' });
  fireEvent.click(button);

  await waitFor(() => {
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/parents\/10\/reports\/weekly\/preview$/),
      { method: 'POST' }
    );
  });
  expect(await screen.findByRole('dialog', { name: 'Предпросмотр недельного отчёта' })).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить и отправить' }));
  await waitFor(() => {
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/parents\/10\/reports\/weekly\/send$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ previewToken: 'signed-preview-token' }) })
    );
  });
  expect(await screen.findByText('Отчёт отправлен: 1 сообщ.')).toBeInTheDocument();
});

test('преподаватель не видит кнопки принудительной отправки', async () => {
  render(<Parents currentUser={{ role: 'teacher' }} />);

  await screen.findByText('Иван Ученик');
  expect(screen.queryByRole('button', { name: 'Отправить отчёт за неделю' })).not.toBeInTheDocument();
});

test.each([
  ['skipped_no_telegram', 'Родитель ещё не подтвердил Telegram ID через бота', 'Не запускал бота'],
  ['failed', 'Forbidden: bot was blocked by the user', 'Заблокировал бота'],
  ['failed', 'Bad Request: chat not found', 'Не запускал бота или неверный ID'],
  ['failed', 'Connection timed out', 'Ошибка: Connection timed out']
])('объясняет менеджеру причину статуса %s', async (status, error, expectedLabel) => {
  adminFetch.mockImplementation((url) => {
    if (url.endsWith('/parents')) {
      return response({
        parents: [{
          id: 10,
          telegramId: '555',
          firstName: 'Анна',
          students: [{ id: 1, firstName: 'Иван', isActive: true, subjects: [] }],
          lastReport: { status, error }
        }]
      });
    }
    if (url.endsWith('/students')) return response({ students: [] });
    return response({});
  });

  render(<Parents currentUser={{ role: 'manager' }} />);

  expect(await screen.findByText(expectedLabel)).toBeInTheDocument();
});
