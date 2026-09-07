import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminStatistics from './Statistics';
import { adminFetch } from './adminApi';

vi.mock('./adminApi', () => ({ adminFetch: vi.fn() }));

const response = (data) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(data),
});

beforeEach(() => {
  adminFetch.mockImplementation((url) => {
    if (url.includes('/stats/students')) {
      return response({
        students: [{
          id: 1,
          firstName: 'Анна',
          lastName: 'Иванова',
          telegramUsername: 'anna',
          subjects: [{ id: 1, name: 'Математика', icon: '📐' }],
        }],
      });
    }
    if (url.includes('section=practice')) {
      return response({
        practice: {
          summary: { eligibleStudents: 3, activeStudents: 2, activeStudentDays: 5, averageSolvedPerStudent: 6.7, todayStudents: 1, totalAttempts: 20, accuracy: 65 },
          subjects: [{
            subject: { id: 1, name: 'Математика', icon: '📐' },
            eligibleStudents: 3,
            activeStudents: 2,
            activePercent: 67,
            todayStudents: 1,
            todayAttempts: 4,
            totalAttempts: 20,
            activeStudentDays: 5,
            averageSolvedPerStudent: 6.7,
            accuracy: 65,
            problemTopics: [{ topicId: 4, name: 'Дроби', icon: '➗', attempts: 10, errorCount: 5, affectedStudents: 2, errorRate: 50 }],
            problemQuestions: [{ questionId: 9, topicName: 'Дроби', questionText: 'Вычислите $\\frac{1}{2}+\\frac{1}{3}$', attempts: 5, errorCount: 4, affectedStudents: 2, errorRate: 80 }],
          }],
        },
      });
    }
    if (url.includes('section=homework')) {
      return response({
        homework: {
          summary: { eligibleStudents: 3, activeStudents: 2, completedWorks: 2, averageCompletedPerStudent: 0.7, averageScore: 78 },
          subjects: [{
            subject: { id: 1, name: 'Математика', icon: '📐' },
            summary: { eligibleStudents: 3, activeStudents: 2, averageCompletedPerStudent: 0.7, averageScore: 78 },
            homeworks: [{
              id: 7,
              title: 'Дроби',
              eligibleStudents: 3,
              eligibleStudentIds: [1, 2, 3],
              completedCount: 2,
              completionPercent: 67,
              averageScore: 78,
              completedStudents: [],
              commonErrors: [{ questionId: 9, questionText: 'Вычислите $\\frac{1}{2}+\\frac{1}{3}$', errorRate: 50, errorCount: 1 }],
            }],
          }],
        },
      });
    }
    return response({});
  });
});

test('преподаватель видит общую практику, статистику ДЗ и частые ошибки', async () => {
  const { container } = render(<AdminStatistics currentUser={{ role: 'teacher' }} />);

  expect(await screen.findByText('Проблемные темы')).toBeInTheDocument();
  expect(screen.getByText('Проблемные задания')).toBeInTheDocument();
  expect(screen.getAllByText('Среднее заданий на ученика').length).toBeGreaterThan(0);
  expect(container.querySelector('.katex')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Домашка/ }));
  expect(await screen.findByText('Общий средний балл')).toBeInTheDocument();
  expect(screen.getAllByText('78%').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: /Дроби.*2\/3 сдали/ }));
  expect(await screen.findByText('Частые ошибки')).toBeInTheDocument();
  await waitFor(() => expect(container.querySelectorAll('.katex').length).toBeGreaterThan(0));
});

test('предмет меняет сводку, а сортировка ДЗ учитывает нули и поиск', async () => {
  const math = { id: 1, name: 'Математика', icon: '📐' };
  const physics = { id: 2, name: 'Физика', icon: '⚛' };
  adminFetch.mockImplementation(url => {
    if (url.includes('/stats/students')) return response({ students: [
      { id: 1, firstName: 'Анна', subjects: [math] },
      { id: 2, firstName: 'Борис', subjects: [math, physics] },
      { id: 3, firstName: 'Вера', subjects: [physics] },
    ] });
    if (url.includes('section=homework')) return response({ homework: {
      summary: { completedWorks: 3 },
      subjects: [
        { subject: math, summary: { completedWorks: 1 }, homeworks: [
          { id: 1, title: 'Алгебра', completedStudents: [{ userId: 2 }], commonErrors: [] },
        ] },
        { subject: physics, summary: { completedWorks: 2 }, homeworks: [
          { id: 2, title: 'Механика', completedStudents: [{ userId: 3 }], commonErrors: [] },
          { id: 3, title: 'Оптика', completedStudents: [{ userId: 3 }], commonErrors: [] },
        ] },
      ],
    } });
    return response({ practice: { summary: {}, subjects: [] } });
  });
  render(<AdminStatistics currentUser={{ role: 'admin' }} />);
  fireEvent.click(screen.getByRole('button', { name: /Домашка/ }));
  await screen.findByText('Всего выполнено ДЗ');
  const names = () => within(screen.getByLabelText('Список учеников')).getAllByRole('button').map(button => button.textContent);
  fireEvent.change(screen.getByLabelText('Порядок учеников'), { target: { value: 'desc' } });
  expect(names()).toEqual([expect.stringContaining('Вера'), expect.stringContaining('Борис'), expect.stringContaining('Анна')]);
  fireEvent.change(screen.getByLabelText('Порядок учеников'), { target: { value: 'asc' } });
  expect(names()[0]).toContain('Анна');
  expect(names()[0]).toContain('Выполнено ДЗ: 0');
  fireEvent.change(screen.getByLabelText('Предмет'), { target: { value: '1' } });
  expect(names()).toHaveLength(2);
  expect(screen.queryByText('Механика')).not.toBeInTheDocument();
  expect(screen.getByText('Всего выполнено ДЗ').parentElement).toHaveTextContent('1');
  fireEvent.change(screen.getByPlaceholderText('🔍 Поиск...'), { target: { value: 'Борис' } });
  expect(names()).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Период статистики'), { target: { value: 'all' } });
  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(expect.stringMatching(/section=homework$/)));
});
