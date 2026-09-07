import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentHomework from './Homework';
import { apiFetch } from './api';
vi.mock('./api', () => ({ apiFetch: vi.fn() }));
vi.mock('./DataContext', () => ({ useData: () => fixture }));
const fixture = {
  subjects: [{ id: 1, name: 'Математика' }],
  homeworks: [{ id: 25, title: 'Тест сохранения', subjectId: 1, openDate: '2020-01-01', closeDate: '2099-01-01', questions: [
    { id: 101, questionType: 'single_choice', questionText: 'Первый вопрос', options: ['Три', 'Четыре'], correctAnswer: 1, points: 10 },
    { id: 102, questionType: 'single_choice', questionText: 'Второй вопрос', options: ['Пять', 'Шесть'], correctAnswer: 1, points: 10 },
  ] }], loading: { homework: false }, homeworkHomeToken: 0, refreshAfterHomework: vi.fn(),
};
test('exit keeps answers and a fresh device restores the question and previous answer', async () => {
  localStorage.clear(); let draft = null, revision = 0;
  apiFetch.mockImplementation(async (url, options = {}) => {
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body); expect(body.revision).toBe(revision);
      draft = body.data; revision++;
      return { ok: true, status: 200, json: async () => ({ revision }) };
    }
    return { ok: true, status: 200, json: async () => ({ draft, revision }) };
  });
  function open() {
    fireEvent.click(screen.getByRole('button', { name: /Тест сохранения/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Начать выполнение' }));
  }
  const view = render(<StudentHomework studentId={5} />); open();
  await screen.findByText('Первый вопрос');
  fireEvent.click(screen.getByRole('button', { name: /B Четыре/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Далее →' }));
  await screen.findByText('Второй вопрос');
  await waitFor(() => expect(draft.currentQuestionIndex).toBe(1));
  fireEvent.click(screen.getAllByRole('button', { name: '← Назад' })[0]);
  expect(JSON.parse(localStorage.getItem('hw_draft_5_25')).answers[0]).toBe(1);
  view.unmount(); localStorage.clear();
  render(<StudentHomework studentId={5} />); open();
  await screen.findByText('Второй вопрос');
  await waitFor(() => expect(JSON.parse(localStorage.getItem('hw_draft_5_25')).answers[0]).toBe(1));
});
