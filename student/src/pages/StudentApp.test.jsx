import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudentAppContent } from './StudentApp';
import Lesson from './Lesson';
import { useData } from './DataContext';

vi.mock('./Practice', () => ({ default: () => <div>Практика</div> }));
vi.mock('./Homework', () => ({ default: () => <div>Домашка</div> }));
vi.mock('./Statistics', () => ({ default: () => <div>Статистика</div> }));
vi.mock('./Lesson', () => ({ default: vi.fn(() => <div>Раздел занятий</div>) }));
vi.mock('./DataContext', () => ({
  DataProvider: ({ children }) => children,
  useData: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

test('клик по глобальному уведомлению открывает конкретное live-занятие', async () => {
  const dismissLessonNotice = vi.fn();
  useData.mockReturnValue({
    subjects: [],
    preloadAllData: vi.fn(),
    loadStreak: vi.fn(),
    refreshDashboard: vi.fn(),
    requestPracticeHome: vi.fn(),
    requestHomeworkHome: vi.fn(),
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
    preloadAllData: vi.fn(),
    loadStreak: vi.fn(),
    refreshDashboard: vi.fn(),
    requestPracticeHome: vi.fn(),
    requestHomeworkHome: vi.fn(),
    lessonNotice: null,
    dismissLessonNotice: vi.fn()
  });

  render(<StudentAppContent selectedStudent={{ id: 1, firstName: 'Иван' }} />);

  await waitFor(() => {
    const props = Lesson.mock.calls[Lesson.mock.calls.length - 1][0];
    expect(props.isTabActive).toBe(true);
    expect(props.entryRequest).toEqual({ lessonId: 23, nonce: 1 });
  });
});

test('гость не монтирует закрытый раздел занятия', () => {
  useData.mockReturnValue({
    subjects: [],
    preloadAllData: vi.fn(),
    loadStreak: vi.fn(),
    refreshDashboard: vi.fn(),
    requestPracticeHome: vi.fn(),
    requestHomeworkHome: vi.fn(),
    lessonNotice: null,
    dismissLessonNotice: vi.fn()
  });

  render(<StudentAppContent selectedStudent={{ id: 299, firstName: 'Гость' }} isGuest />);

  expect(Lesson).not.toHaveBeenCalled();
  expect(screen.queryByText('Раздел занятий')).not.toBeInTheDocument();
});
