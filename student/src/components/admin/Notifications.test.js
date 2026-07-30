import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Notifications from './Notifications';
import { adminFetch } from './adminApi';

jest.mock('./adminApi', () => ({ adminFetch: jest.fn() }));
jest.mock('./useSectionRefresh', () => ({ useSectionRefresh: jest.fn() }));

const jsonResponse = (data) => Promise.resolve({
  ok: true,
  json: async () => data,
});

beforeEach(() => {
  adminFetch.mockImplementation((url) => {
    if (url.endsWith('/notify/preview')) {
      return jsonResponse({
        students: Array.from({ length: 32 }, (_, index) => ({
          id: index + 100,
          firstName: `Получатель ${index + 1}`,
          isActive: true,
        })),
      });
    }
    if (url.endsWith('/students')) {
      return jsonResponse({
        students: [{
          id: 7,
          firstName: 'Иван',
          lastName: 'Ученик',
          telegramUsername: 'student7',
          telegramId: '700',
          isActive: true,
        }],
      });
    }
    if (url.endsWith('/notify/send')) {
      return jsonResponse({
        message: 'Отправлено: 1, ошибок: 0',
        results: { sent: [{ id: 7, name: 'Иван Ученик' }], failed: [] },
      });
    }
    return jsonResponse({});
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('выбор одного ученика не превращается в массовую отправку', async () => {
  render(
    <Notifications
      subjects={[{ id: 1, name: 'Математика', icon: '📐' }]}
      currentUser={{ id: 1, role: 'admin', firstName: 'Админ' }}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /Одному ученику/i }));
  fireEvent.click(screen.getByRole('button', { name: /Выбрать ученика/i }));
  fireEvent.click(await screen.findByText('Иван Ученик'));
  fireEvent.change(screen.getByPlaceholderText('Введите текст сообщения...'), {
    target: { value: 'Проверка' },
  });

  fireEvent.click(screen.getByRole('button', { name: /Отправить \(1 получ\.\)/i }));
  expect(screen.getByText(/1 получателям/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Да, отправить 1 сообщений/i }));

  await waitFor(() => {
    const sendCall = adminFetch.mock.calls.find(([url]) => url.endsWith('/notify/send'));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse(sendCall[1].body);
    expect(body).toEqual({
      mode: 'single',
      text: 'Проверка',
      studentId: 7,
    });
    expect(body.filters).toBeUndefined();
  });
});
