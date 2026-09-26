import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Practice from './Practice';
import { apiFetch } from './api';
import { useData } from './DataContext';

vi.mock('./api', () => ({ apiFetch: vi.fn() }));
vi.mock('./DataContext', () => ({ useData: vi.fn() }));

const okResponse = (body = {}) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body)
});

test('отправляет серверу исходный индекс выбранного перемешанного варианта', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const subject = { id: 1, name: 'Физика', icon: '⚛️' };
  const topic = { id: 10, subjectId: 1, name: 'Механика', icon: '📝' };
  const question = {
    id: 100,
    topicId: 10,
    questionText: 'Тестовый вопрос',
    options: ['Первый', 'Второй', 'Третий'],
    correctAnswer: [2],
    difficulty: 'medium'
  };
  const loadDailyGoal = vi.fn().mockResolvedValue({ dailyGoal: 15, goals: [] });
  const loadPredictedScore = vi.fn().mockResolvedValue(null);

  useData.mockReturnValue({
    practiceTopics: [topic],
    subjects: [subject],
    refreshAfterPractice: vi.fn().mockResolvedValue(undefined),
    loading: { practice: false },
    prefetchQuestions: vi.fn(),
    getQuestions: vi.fn().mockResolvedValue([question]),
    updatePracticeStatsOptimistic: vi.fn(),
    streak: null,
    streakLoaded: true,
    setStreak: vi.fn(),
    setStreakLoaded: vi.fn(),
    loadStreak: vi.fn(),
    dailyGoal: { dailyGoal: 15, goals: [] },
    loadDailyGoal,
    patchDailyGoal: vi.fn(),
    predictedScore: null,
    loadPredictedScore,
    leaderboard: { top: [] },
    loadLeaderboard: vi.fn(),
    loadWeakTopicsQuestions: vi.fn(),
    loadSubjectDashboard: vi.fn(),
    practiceIntent: null,
    clearPracticeIntent: vi.fn(),
    practiceHomeToken: 0
  });
  apiFetch.mockImplementation(() => okResponse({}));

  render(<Practice studentId={7} />);
  fireEvent.click(await screen.findByRole('button', { name: /Решать тесты/ }));
  await screen.findByText('Тестовый вопрос');

  fireEvent.click(screen.getByRole('button', { name: /Второй/ }));

  await waitFor(() => {
    const request = apiFetch.mock.calls.find(([url]) => url.endsWith('/practice/answer'));
    expect(request).toBeTruthy();
    expect(JSON.parse(request[1].body)).toMatchObject({
      studentId: 7,
      questionId: 100,
      selectedAnswer: [1]
    });
  });
});
