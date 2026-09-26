import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent, act, within } from '@testing-library/react';
import { vi, afterEach, test, expect } from 'vitest';
import StreamPresentation, { StreamLeaderboard, StreamScreen } from './StreamPresentation';
import { adminFetch } from './adminApi';

vi.mock('./adminApi', () => ({ adminFetch: vi.fn() }));
const originalTelegram = window.Telegram;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  if (originalTelegram === undefined) delete window.Telegram;
  else Object.defineProperty(window, 'Telegram', { configurable: true, value: originalTelegram });
});

test('teacher screen opens inside the app without requesting a popup', async () => {
  const popup = vi.spyOn(window, 'open');
  adminFetch.mockResolvedValue({ ok: true, json: async () => ({ title: 'Алгебра', phase: 'lobby', status: 'active', participantCount: 3 }) });
  render(<StreamPresentation source={{ lessonQuizId: 5 }} onClose={() => {}} />);
  expect(screen.getByRole('dialog', { name: 'Экран трансляции' })).toHaveAttribute('open');
  await waitFor(() => expect(screen.getByRole('button', { name: /Показать первый вопрос/ })).toBeVisible());
  expect(popup).not.toHaveBeenCalled();
  popup.mockRestore();
});

test('fullscreen is requested on the open stream dialog and controls stay interactive', async () => {
  adminFetch.mockResolvedValue({ ok: true, json: async () => ({ title: 'Алгебра', phase: 'lobby', status: 'active', participantCount: 3 }) });
  render(<StreamPresentation source={{ lessonQuizId: 5 }} onClose={() => {}} />);

  const dialog = screen.getByRole('dialog', { name: 'Экран трансляции' });
  const requestFullscreen = vi.fn().mockResolvedValue(undefined);
  dialog.requestFullscreen = requestFullscreen;
  fireEvent.click(screen.getByRole('button', { name: 'На весь экран' }));

  await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1));
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: dialog });
  fireEvent(document, new Event('fullscreenchange'));
  expect(await screen.findByRole('button', { name: 'Выйти из полного экрана' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(await screen.findByRole('button', { name: /Показать первый вопрос/ }));
  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/quizzes/5/show-question'),
    expect.objectContaining({ method: 'POST' })
  ));
});

test('Telegram Mini App uses its native fullscreen API instead of the browser API', async () => {
  const eventHandlers = {};
  const requestFullscreen = vi.fn();
  const exitFullscreen = vi.fn();
  const webApp = {
    isFullscreen: false,
    requestFullscreen,
    exitFullscreen,
    onEvent: vi.fn((name, handler) => { eventHandlers[name] = handler; }),
    offEvent: vi.fn()
  };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: webApp } });
  adminFetch.mockResolvedValue({ ok: true, json: async () => ({ title: 'Алгебра', phase: 'lobby', status: 'active', participantCount: 3 }) });
  render(<StreamPresentation source={{ lessonQuizId: 5 }} onClose={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'На весь экран' }));
  expect(requestFullscreen).toHaveBeenCalledTimes(1);

  act(() => {
    webApp.isFullscreen = true;
    eventHandlers.fullscreenChanged();
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Выйти из полного экрана' }));
  expect(exitFullscreen).toHaveBeenCalledTimes(1);
});

test('podium has three places and list stops at tenth', () => {
  const entries = Array.from({ length: 12 }, (_, id) => ({ id, name: `Участник ${id + 1}`, totalScore: 100 - id }));
  render(<StreamLeaderboard entries={entries} />);
  expect(screen.getByLabelText('Тройка лидеров').children).toHaveLength(3);
  expect(screen.getByLabelText('Места с четвёртого по десятое').children).toHaveLength(7);
  expect(screen.queryByText('Участник 11')).not.toBeInTheDocument();
});

test('empty and single participant rankings have no invented winners', () => {
  const { rerender } = render(<StreamLeaderboard />);
  expect(screen.getByText('Пока нет результатов')).toBeInTheDocument();
  rerender(<StreamLeaderboard entries={[{ id: 1, name: 'Анна', totalScore: 5 }]} />);
  expect(screen.getByLabelText('Тройка лидеров').children).toHaveLength(1);
});

test('stream question never renders correct-answer metadata, even if supplied', async () => {
  adminFetch.mockResolvedValue({ ok: true, json: async () => ({
    phase: 'question', title: 'Алгебра', serverNow: Date.now(), deadline: Date.now() + 30000,
    questionIndex: 0, totalQuestions: 1, leaderboard: [],
    question: { questionText: 'Сколько будет два плюс два?', options: ['3', '4'], timeLimit: 30, correctAnswer: 1, explanation: 'Секрет' },
  }) });
  render(<StreamScreen source={{ lessonQuizId: 1 }} hostWindow={window} />);
  await waitFor(() => expect(screen.getByText('Сколько будет два плюс два?')).toBeInTheDocument());
  expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/quizzes/1/stream'),
    expect.any(Object)
  );
  expect(screen.queryByText('Секрет')).not.toBeInTheDocument();
  expect(screen.queryByText(/Правильный ответ/)).not.toBeInTheDocument();
  expect(screen.getByRole('timer')).toBeInTheDocument();
});

test('failed stream request displays a recoverable connection error', async () => {
  adminFetch.mockResolvedValue({ ok: false, status: 503 });
  render(<StreamScreen source={{ lessonQuizId: 1 }} hostWindow={window} />);
  await waitFor(() => expect(screen.getByText('Связь прервана. Восстанавливаем…')).toBeInTheDocument());
});

test('общий лидерборд не называется трансляцией и открывается для выбранного предмета', async () => {
  adminFetch.mockResolvedValue({ ok: true, json: async () => ({
    phase: 'weekly', serverNow: Date.now(), periodDays: 7, leaderboard: []
  }) });
  render(<StreamPresentation source={{ subjectId: 2, subjectName: 'Английский', periodDays: 7 }} onClose={() => {}} />);

  expect(screen.getByRole('dialog', { name: 'Лидерборд' })).toHaveAttribute('open');
  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/stream/weekly?subjectId=2&periodDays=7'),
    expect.any(Object)
  ));
  expect(screen.getByRole('button', { name: 'Закрыть лидерборд' })).toBeVisible();
});

test('преподаватель открывает профиль ученика из общего лидерборда', async () => {
  adminFetch.mockImplementation((url) => {
    if (url.includes('/students/9/profile')) {
      return Promise.resolve({ ok: true, json: async () => ({ student: {
        id: 9, firstName: 'Анна', lastName: 'Иванова', telegramUsername: 'anna', telegramId: '123456',
        isActive: true, createdAt: '2026-01-15T00:00:00.000Z', subjects: [{ id: 1, name: 'Математика', icon: '📐', isActive: true }]
      } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({
      phase: 'weekly', serverNow: Date.now(), periodDays: 7,
      leaderboard: [{ id: 9, name: 'Анна', totalScore: 42 }]
    }) });
  });
  render(<StreamPresentation source={{ subjectId: 1, subjectName: 'Математика', periodDays: 7 }} onClose={() => {}} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Открыть профиль Анна' }));
  const profile = await screen.findByRole('dialog', { name: 'Профиль ученика' });
  expect(profile).toHaveTextContent('@anna');
  expect(within(profile).getByText('123456')).toBeVisible();
  expect(within(profile).getByText(/Математика/)).toBeVisible();
  expect(adminFetch).toHaveBeenCalledWith(expect.stringContaining('/lesson-admin/students/9/profile'));
});
