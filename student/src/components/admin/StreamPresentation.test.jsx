import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { vi, afterEach, test, expect } from 'vitest';
import StreamPresentation, { StreamLeaderboard, StreamScreen } from './StreamPresentation';
import { adminFetch } from './adminApi';

vi.mock('./adminApi', () => ({ adminFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('teacher screen opens inside the app without requesting a popup', async () => {
  const popup = vi.spyOn(window, 'open');
  adminFetch.mockResolvedValue({ ok: true, json: async () => ({ title: 'Алгебра', phase: 'lobby', status: 'active', participantCount: 3 }) });
  render(<StreamPresentation source={{ lessonQuizId: 5 }} onClose={() => {}} />);
  expect(screen.getByRole('dialog', { name: 'Экран трансляции' })).toHaveAttribute('open');
  await waitFor(() => expect(screen.getByRole('button', { name: /Показать первый вопрос/ })).toBeVisible());
  expect(popup).not.toHaveBeenCalled();
  popup.mockRestore();
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
