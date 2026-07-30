import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudentAppContent } from './StudentApp';
import Lesson from './Lesson';
import { useData } from './DataContext';

jest.mock('./Practice', () => () => <div>Практика</div>);
jest.mock('./Homework', () => () => <div>Домашка</div>);
jest.mock('./Statistics', () => () => <div>Статистика</div>);
jest.mock('./Lesson', () => jest.fn(() => <div>Раздел занятий</div>));
jest.mock('./DataContext', () => ({
  DataProvider: ({ children }) => children,
  useData: jest.fn()
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

test('клик по глобальному уведомлению открывает конкретное live-занятие', async () => {
  const dismissLessonNotice = jest.fn();
  useData.mockReturnValue({
    subjects: [],
    preloadAllData: jest.fn(),
    loadStreak: jest.fn(),
    refreshDashboard: jest.fn(),
    requestPracticeHome: jest.fn(),
    requestHomeworkHome: jest.fn(),
    lessonNotice: { type: 'started', lesson: { id: 17, subject: { name: 'Физика' } } },
    dismissLessonNotice
  });

  render(<StudentAppContent selectedStudent={{ id: 1, firstName: 'Иван' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Занятие началось Перейти в занятие' }));

  expect(dismissLessonNotice).toHaveBeenCalled();
  await waitFor(() => {
    const props = Lesson.mock.calls[Lesson.mock.calls.length - 1][0];
    expect(props.entryRequest).toEqual({ lessonId: 17, nonce: 1 });
  });
  const props = Lesson.mock.calls[Lesson.mock.calls.length - 1][0];
  expect(props.isTabActive).toBe(true);
});

test('lessonId из Telegram-ссылки сразу открывает конкретное занятие', async () => {
  window.history.replaceState({}, '', '/?v=123&lessonId=23');
  useData.mockReturnValue({
    subjects: [],
    preloadAllData: jest.fn(),
    loadStreak: jest.fn(),
    refreshDashboard: jest.fn(),
    requestPracticeHome: jest.fn(),
    requestHomeworkHome: jest.fn(),
    lessonNotice: null,
    dismissLessonNotice: jest.fn()
  });

  render(<StudentAppContent selectedStudent={{ id: 1, firstName: 'Иван' }} />);

  await waitFor(() => {
    const props = Lesson.mock.calls[Lesson.mock.calls.length - 1][0];
    expect(props.isTabActive).toBe(true);
    expect(props.entryRequest).toEqual({ lessonId: 23, nonce: 1 });
  });
});
