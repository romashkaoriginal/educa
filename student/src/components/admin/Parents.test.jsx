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
          studentId: 1,
          telegramId: '555',
          telegramUsername: 'parent_one',
          firstName: 'Анна',
          isActive: true,
          student: {
            id: 1,
            firstName: 'Иван',
            lastName: 'Ученик',
            isActive: true,
            subjects: [{ id: 3, name: 'Математика', icon: '📐', UserSubject: { isActive: true } }]
          },
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
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: '@maria_parent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  await waitFor(() => {
    const call = adminFetch.mock.calls.find(([url, options]) => url.endsWith('/parents') && options?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body)).toMatchObject({
      studentId: 2,
      telegramUsername: '@maria_parent'
    });
  });
});

test('менеджер принудительно отправляет недельный отчёт', async () => {
  render(<Parents currentUser={{ role: 'manager' }} />);

  const button = await screen.findByRole('button', { name: 'Отправить отчёт за неделю' });
  fireEvent.click(button);

  await waitFor(() => {
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/parents\/reports\/weekly\/send$/),
      { method: 'POST' }
    );
  });
});

test('преподаватель не видит кнопки принудительной отправки', async () => {
  render(<Parents currentUser={{ role: 'teacher' }} />);

  await screen.findByText('Иван Ученик');
  expect(screen.queryByRole('button', { name: 'Отправить отчёт за неделю' })).not.toBeInTheDocument();
});
