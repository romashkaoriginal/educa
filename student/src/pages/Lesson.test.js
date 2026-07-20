import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import Lesson from './Lesson';
import { apiFetch } from './api';
import { useData } from './DataContext';

jest.mock('./api', () => ({ apiFetch: jest.fn() }));
jest.mock('./DataContext', () => ({ useData: jest.fn() }));
jest.mock('./Quiz', () => () => <div>Старая викторина</div>);

const jsonResponse = (body) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body)
});

const subject = { id: 1, name: 'Физика', icon: '⚛️' };
const teacher = { id: 2, firstName: 'Анна', lastName: 'Иванова' };

function mockContext(currentLesson = null) {
  useData.mockReturnValue({
    currentLesson,
    setCurrentLesson: jest.fn(),
    lessonSocket: null,
    lessonConnected: false,
    lessonReconnecting: false,
    dismissLessonNotice: jest.fn()
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.Telegram = { WebApp: {} };
});

test('показывает неактивные активности и расписание, когда занятия нет', async () => {
  mockContext(null);
  const upcoming = {
    id: 10,
    status: 'scheduled',
    subject,
    teacher,
    scheduledAt: '2026-07-21T15:00:00.000Z'
  };
  apiFetch.mockImplementation((url) => {
    if (url.endsWith('/current')) return jsonResponse({ lesson: null });
    if (url.endsWith('/schedule/upcoming')) return jsonResponse({ lesson: upcoming });
    if (url.endsWith('/schedule/week')) return jsonResponse({ lessons: [upcoming] });
    return jsonResponse({});
  });

  render(<Lesson studentId={1} studentName="Ученик" isTabActive />);

  expect(await screen.findByText('Сейчас занятия нет')).toBeInTheDocument();
  expect(screen.getByText('Будет доступна во время занятия')).toBeInTheDocument();
  expect(screen.getByText('Будет доступно во время занятия')).toBeInTheDocument();
  expect(screen.getByText('Расписание')).toBeInTheDocument();
  expect(screen.getByText('Войти по коду →')).toBeInTheDocument();
});

test('показывает трансляцию и live-инструменты во время занятия', async () => {
  const liveLesson = {
    id: 11,
    status: 'live',
    subject,
    teacher,
    topic: 'Механика',
    streamUrl: 'https://example.com/live',
    startedAt: '2026-07-20T15:00:00.000Z'
  };
  mockContext(liveLesson);
  apiFetch.mockImplementation((url) => {
    if (url.endsWith('/current')) return jsonResponse({ lesson: liveLesson });
    if (url.endsWith('/schedule/upcoming')) return jsonResponse({ lesson: null });
    if (url.endsWith('/schedule/week')) return jsonResponse({ lessons: [] });
    if (url.endsWith('/state')) return jsonResponse({ lesson: liveLesson, activePoll: null, activeQuiz: null, myQuestions: [], materials: [] });
    if (url.endsWith('/attendance/ping')) return jsonResponse({ attendance: {} });
    return jsonResponse({});
  });

  render(<Lesson studentId={1} studentName="Ученик" isTabActive />);

  expect(await screen.findByText('Занятие идёт')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Перейти к занятию ↗' })).toBeInTheDocument();
  expect(screen.getByText('Ожидайте запуска преподавателем')).toBeInTheDocument();
  expect(screen.getByText('Сейчас нет активного вопроса')).toBeInTheDocument();
  expect(screen.getByText('Связь с преподавателем')).toBeInTheDocument();
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
});
