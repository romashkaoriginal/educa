import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Parents from './Parents';
import { adminFetch } from './adminApi';

vi.mock('./adminApi', () => ({ adminFetch: vi.fn() }));
vi.mock('./useSectionRefresh', () => ({ useSectionRefresh: vi.fn() }));

const response = (data, ok = true) => Promise.resolve({ ok, json: async () => data });

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    if (url.endsWith('/parents/report-logs')) {
      return response({ logs: [{
        id: 11,
        createdAt: '2026-09-24T11:55:00.000Z',
        reportType: 'monthly',
        triggerScope: 'bulk',
        triggeredByName: 'Лина KUBIK ЦТ',
        status: 'sent',
        parent: { firstName: 'Анна', lastName: 'Иванова' }
      }] });
    }
    return response({});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test('показывает связь с учеником и создаёт родителя по username', async () => {
  render(<Parents />);

  expect(await screen.findByText('Иван Ученик')).toBeInTheDocument();
  expect(screen.getByText('Доступ активен')).toBeInTheDocument();
  expect(screen.getByText('Отправлен')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Добавить родителя/i }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Ученики *'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: '@maria_parent' } });
  fireEvent.change(screen.getByLabelText('Имя *'), { target: { value: 'Мария' } });
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

test('менеджер массово отправляет недельный отчёт после подтверждения', async () => {
  render(<Parents currentUser={{ role: 'manager' }} />);

  const button = await screen.findByRole('button', { name: 'Отправить отчёт за неделю всем' });
  fireEvent.click(button);

  await waitFor(() => {
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/parents\/reports\/weekly\/send$/),
      { method: 'POST' }
    );
  });
});

test('менеджер видит автора и результат ручной отправки в журнале', async () => {
  render(<Parents currentUser={{ role: 'manager' }} />);

  fireEvent.click(await screen.findByText(/Журнал ручных отправок/));
  expect(await screen.findByText('Лина KUBIK ЦТ')).toBeInTheDocument();
  expect(screen.getByText('Всем родителям')).toBeInTheDocument();
});

test('менеджер отправляет месячный отчёт только выбранному родителю', async () => {
  render(<Parents currentUser={{ role: 'manager' }} />);

  const button = await screen.findByRole('button', { name: 'Отправить месячный отчёт' });
  fireEvent.click(button);

  await waitFor(() => {
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Анна'));
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/parents\/10\/reports\/monthly\/send$/),
      { method: 'POST' }
    );
  });
});

test('преподаватель не видит кнопки принудительной отправки', async () => {
  render(<Parents currentUser={{ role: 'teacher' }} />);

  await screen.findByText('Иван Ученик');
  expect(screen.queryByRole('button', { name: 'Отправить недельный отчёт' })).not.toBeInTheDocument();
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
