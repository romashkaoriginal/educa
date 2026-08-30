import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LessonAdmin, { mergeStudentQuestionUpdate } from './Lesson';
import { adminFetch } from './adminApi';
import { io } from 'socket.io-client';

jest.mock('./adminApi', () => ({ adminFetch: jest.fn(), getTelegramInitData: jest.fn(() => 'test') }));
jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('./ImageUploadField', () => () => null);

const response = (body) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body)
});

const baseLesson = {
  id: 7,
  status: 'scheduled',
  subjectId: 1,
  subject: { id: 1, name: 'Математика' },
  teacher: { id: 2, firstName: 'Анна', lastName: 'Иванова' },
  fromSchedule: true,
  questionsEnabled: true,
  scheduledAt: '2026-07-21T15:00:00.000Z',
  topic: 'Квадратные уравнения'
};

let lesson;
let sessionState;

beforeEach(() => {
  jest.clearAllMocks();
  lesson = { ...baseLesson };
  sessionState = { lesson, polls: [], quizzes: [], materials: [] };
  window.confirm = jest.fn(() => true);
  io.mockReturnValue({ on: jest.fn(), emit: jest.fn(), disconnect: jest.fn() });
  adminFetch.mockImplementation((url, options = {}) => {
    if (url.endsWith('/lesson-admin/lessons/7/polls') && options.method === 'POST') {
      return response({ poll: { id: 22, question: 'Всё понятно?', status: 'draft', options: [] } });
    }
    if (url.endsWith('/lesson-admin/lessons/7/quizzes') && options.method === 'POST') {
      return response({ quiz: { id: 32, title: 'Новая викторина', status: 'draft', mode: 'single_step', questions: [] } });
    }
    if (url.endsWith('/lesson-admin/lessons/7') && options.method === 'DELETE') return response({ ok: true, deletedLessonId: 7 });
    if (url.endsWith('/lesson-admin/lessons/7') && options.method === 'PATCH') return response({ lesson: { ...lesson, ...JSON.parse(options.body) } });
    if (url.endsWith('/lesson-admin/lessons/7/start')) return response({ lesson: { ...lesson, status: 'live' } });
    if (url.endsWith('/lesson-admin/lessons/start-now')) return response({ lesson: { ...lesson, id: 8, status: 'live', fromSchedule: false } });
    if (url.includes('/lesson-admin/lessons?status=')) return response({ lessons: [lesson] });
    if (url.endsWith('/lesson-admin/lessons')) return response({ lessons: [lesson] });
    if (url.endsWith('/lesson-admin/teacher-subjects')) return response({ assignments: [] });
    if (url.endsWith('/lesson-admin/lessons/7/state')) return response(sessionState);
    if (url.endsWith('/lesson-admin/lessons/7/questions')) return response({ questions: [] });
    if (url.endsWith('/lesson-admin/lessons/7/reactions/summary')) return response({ summary: {} });
    if (url.endsWith('/lesson-admin/lessons/7/attendance')) return response({ attendance: [] });
    if (url.includes('/lesson-admin/polls/21/results')) return response({ results: { total: 0, options: [] } });
    if (url.endsWith('/users')) return response({ users: [] });
    if (url.endsWith('/students')) return response({ students: [] });
    if (url.includes('/practice/topics/')) return response({ topics: [] });
    return response({});
  });
});

test('сохраняет имя ученика, если ответ обновления статуса не содержит student', () => {
  const student = { id: 9, firstName: 'Антон', lastName: 'Иванов' };
  expect(mergeStudentQuestionUpdate(
    { id: 51, status: 'pending', student },
    { id: 51, status: 'answered' }
  )).toEqual({ id: 51, status: 'answered', student });
});

test('показывает подготовку только после открытия занятия', async () => {
  render(<LessonAdmin subjects={[{ id: 1, name: 'Математика' }]} currentUser={{ role: 'admin' }} />);

  expect(await screen.findByText('Расписание')).toBeInTheDocument();
  expect(screen.queryByText('Подготовка занятия')).not.toBeInTheDocument();
  expect(screen.queryByText(/в эфире/)).not.toBeInTheDocument();

  fireEvent.click(await screen.findByRole('button', { name: 'Открыть →' }));

  expect(await screen.findByText('Подготовка занятия')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '← К расписанию' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Расписание')).not.toBeInTheDocument());
});

test('после завершения активности позволяет создать новое голосование и новую викторину', async () => {
  lesson.status = 'live';
  sessionState = {
    lesson,
    polls: [{ id: 21, question: 'Первое голосование', status: 'closed', isAnonymous: true, options: [] }],
    quizzes: [{ id: 31, title: 'Первая викторина', status: 'finished', mode: 'single_step', questions: [] }],
    materials: []
  };

  render(<LessonAdmin subjects={[{ id: 1, name: 'Математика' }]} currentUser={{ role: 'teacher' }} />);
  // ТЗ §3: идущее занятие живёт в блоке «Начать занятие», а не в таблице расписания.
  fireEvent.click(await screen.findByRole('button', { name: /Математика/ }));

  fireEvent.click(await screen.findByRole('button', { name: '+ Новое голосование' }));
  fireEvent.click(screen.getByRole('button', { name: 'Создать голосование' }));

  fireEvent.click(await screen.findByRole('button', { name: '+ Новая викторина' }));
  fireEvent.change(screen.getByPlaceholderText('Название викторины'), { target: { value: 'Новая викторина' } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать викторину' }));

  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/lessons/7/polls'),
    expect.objectContaining({ method: 'POST' })
  ));
  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/lessons/7/quizzes'),
    expect.objectContaining({ method: 'POST' })
  ));
});

test('позволяет выбрать одну из нескольких подготовленных викторин', async () => {
  sessionState = {
    lesson,
    polls: [],
    quizzes: [
      { id: 31, title: 'Первая викторина', status: 'draft', mode: 'single_step', questions: [] },
      { id: 32, title: 'Вторая викторина', status: 'draft', mode: 'self_paced', questions: [] }
    ],
    materials: []
  };

  render(<LessonAdmin subjects={[{ id: 1, name: 'Математика' }]} currentUser={{ role: 'teacher' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Открыть →' }));

  const picker = await screen.findByLabelText('Подготовленные викторины');
  expect(picker).toHaveValue('31');
  fireEvent.change(picker, { target: { value: '32' } });
  expect(picker).toHaveValue('32');
  expect(screen.getByText(/самостоятельно · вопросов: 0/)).toBeInTheDocument();
});

// Групп как сущности больше нет: ученик попадает на занятие по доступу к предмету,
// а преподаватель назначается напрямую на предмет.
test('раздела «Группы» нет, преподаватель назначается на предмет', async () => {
  render(<LessonAdmin subjects={[{ id: 1, name: 'Математика' }]} currentUser={{ role: 'admin' }} />);

  expect(await screen.findByText('Расписание')).toBeInTheDocument();
  expect(screen.queryByText('Группы')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Название группы')).not.toBeInTheDocument();
  expect(screen.getByText('Преподаватели')).toBeInTheDocument();

  // Групповые роуты не дёргаются вообще.
  expect(adminFetch).not.toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/groups'),
    expect.anything()
  );
});

// ТЗ §7/§8.10: ссылка на трансляцию указывается непосредственно перед началом.
test('запуск из расписания подставляет тему и требует ссылку на трансляцию', async () => {
  render(<LessonAdmin subjects={[{ id: 1, name: 'Математика' }]} currentUser={{ role: 'teacher' }} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Начать занятие' }));

  const dialog = await screen.findByRole('dialog', { name: 'Начать занятие' });
  expect(within(dialog).getByDisplayValue('Квадратные уравнения')).toBeInTheDocument();
  const submit = within(dialog).getByRole('button', { name: 'Начать и уведомить учеников' });
  expect(submit).toBeDisabled();

  fireEvent.change(within(dialog).getByPlaceholderText('https://…'), { target: { value: 'https://meet.example/abc' } });
  fireEvent.click(submit);

  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/lessons/7/start'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ topic: 'Квадратные уравнения', streamUrl: 'https://meet.example/abc' })
    })
  ));
});

// ТЗ §7 «Отдельный быстрый запуск» / §8.12.
test('быстрый запуск создаёт занятие вне расписания', async () => {
  render(<LessonAdmin subjects={[{ id: 1, name: 'Математика' }]} currentUser={{ role: 'teacher' }} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Начать занятие сейчас' }));

  const dialog = await screen.findByRole('dialog', { name: 'Начать занятие' });
  fireEvent.change(within(dialog).getByPlaceholderText('https://…'), { target: { value: 'https://meet.example/now' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Начать и уведомить учеников' }));

  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/lessons/start-now'),
    expect.objectContaining({ method: 'POST' })
  ));
});

test('показывает удаление завершённого занятия преподавателю и отправляет DELETE', async () => {
  lesson.status = 'finished';

  render(<LessonAdmin subjects={[{ id: 1, name: 'Математика' }]} currentUser={{ role: 'teacher' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('безвозвратно удалены'));
  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/lessons/7'),
    expect.objectContaining({ method: 'DELETE' })
  ));
});

test('редактирование занятия открывает модалку и отправляет PATCH с новой темой и датой', async () => {
  render(<LessonAdmin subjects={[{ id: 1, name: 'Математика' }]} currentUser={{ role: 'teacher' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Редактировать' }));

  const dialog = await screen.findByRole('dialog', { name: 'Редактировать занятие' });
  const topicInput = within(dialog).getByPlaceholderText('Например, законы Ньютона');
  fireEvent.change(topicInput, { target: { value: 'Логарифмы' } });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

  await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lesson-admin/lessons/7'),
    expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('Логарифмы')
    })
  ));

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Редактировать занятие' })).not.toBeInTheDocument());
});
