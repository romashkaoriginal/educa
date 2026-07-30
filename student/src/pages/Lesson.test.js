import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Lesson from './Lesson';
import { apiFetch } from './api';
import { useData } from './DataContext';

jest.mock('./api', () => ({ apiFetch: jest.fn() }));
jest.mock('./DataContext', () => ({ useData: jest.fn() }));

const jsonResponse = (body) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body)
});

const subject = { id: 1, name: 'Физика', icon: '⚛️' };

function mockContext(currentLesson = null, overrides = {}) {
  const context = {
    currentLesson,
    setCurrentLesson: jest.fn(),
    lessonSocket: null,
    lessonConnected: false,
    lessonReconnecting: false,
    dismissLessonNotice: jest.fn(),
    ...overrides
  };
  useData.mockReturnValue(context);
  return context;
}

const liveLesson = {
  id: 11,
  status: 'live',
  subject,
  topic: 'Законы Ньютона',
  streamUrl: 'https://example.com/live',
  startedAt: '2026-07-20T15:00:00.000Z'
};

// Роуты состояния занятия отдаются с флагами, по которым рисуется экран (ТЗ §4.2).
const mockLive = (state = {}) => {
  apiFetch.mockImplementation((url) => {
    if (url.includes('/current?studentId=1')) return jsonResponse({ lesson: liveLesson });
    if (url.includes('/schedule/upcoming-list')) return jsonResponse({ lessons: [] });
    if (url.includes('/schedule/upcoming')) return jsonResponse({ lesson: null });
    if (url.includes('/state?studentId=1')) return jsonResponse({
      lesson: liveLesson, isLive: true, canAskQuestions: true,
      activePoll: null, activeQuiz: null, myQuestions: [], materials: [], ...state
    });
    if (url.includes('/questions?studentId=1')) return jsonResponse({ question: { id: 40, status: 'pending', text: 'Можно повторить?' } });
    return jsonResponse({ attendance: {} });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  window.Telegram = { WebApp: {} };
});

test('без активного занятия показывает состояние и расписание с предметами', async () => {
  mockContext(null);
  // Два разных предмета: по строке расписания должно быть понятно, к чему тема.
  const russian = { id: 2, name: 'Русский язык', icon: '📕' };
  const upcoming = {
    id: 10, status: 'scheduled', subject, topic: 'Законы Ньютона',
    scheduledAt: '2026-07-28T15:00:00.000Z'
  };
  const later = {
    id: 11, status: 'scheduled', subject: russian, topic: 'Приставки',
    scheduledAt: '2026-07-30T06:15:00.000Z'
  };
  apiFetch.mockImplementation((url) => {
    if (url.includes('/current?studentId=1')) return jsonResponse({ lesson: null });
    if (url.includes('/schedule/upcoming-list')) return jsonResponse({ lessons: [upcoming, later] });
    if (url.includes('/schedule/upcoming')) return jsonResponse({ lesson: upcoming });
    return jsonResponse({});
  });

  render(<Lesson studentId={1} isTabActive />);

  // ТЗ §4.1: ближайшее занятие выделено отдельной карточкой.
  expect(await screen.findByText('Ближайшее занятие')).toBeInTheDocument();
  expect(screen.getByText('Сейчас занятия нет')).toBeInTheDocument();
  expect(document.querySelector('.lesson-next-topic')).toHaveTextContent('Законы Ньютона');
  expect(document.querySelector('.lesson-next-subject')).toHaveTextContent('Физика');

  // Лента ниже показывает все занятия, включая ближайшее — календарь остаётся полным.
  const subjectNames = [...document.querySelectorAll('.lesson-day-subject')].map((node) => node.textContent);
  expect(subjectNames).toEqual(['⚛️Физика', '📕Русский язык']);
  const topics = [...document.querySelectorAll('.lesson-day-topic')].map((node) => node.textContent);
  expect(topics).toEqual(['Законы Ньютона', 'Приставки']);

  // Шапка раздела не дублирует карточку ближайшего занятия.
  expect(screen.queryByText(/Ближайшее: /)).not.toBeInTheDocument();

  // Кнопка «Посмотреть расписание» убрана — расписание и так на экране.
  expect(screen.queryByRole('button', { name: 'Посмотреть расписание' })).not.toBeInTheDocument();

  // ТЗ §8.4: викторина, голосование и вопросы преподавателю не отображаются.
  expect(screen.queryByText('Голосование')).not.toBeInTheDocument();
  expect(screen.queryByText(/Будет доступн/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Задать вопрос преподавателю/)).not.toBeInTheDocument();
  // ТЗ §8.1: блока «Викторины вне занятий» больше нет.
  expect(screen.queryByText('Викторины вне занятий')).not.toBeInTheDocument();
});

test('шапка раздела показывает состояние занятия', async () => {
  mockContext(null);
  apiFetch.mockImplementation((url) => {
    if (url.includes('/current?studentId=1')) return jsonResponse({ lesson: null });
    if (url.includes('/schedule/upcoming-list')) return jsonResponse({ lessons: [] });
    if (url.includes('/schedule/upcoming')) return jsonResponse({ lesson: null });
    return jsonResponse({});
  });

  render(<Lesson studentId={1} isTabActive />);

  // Синяя шапка — такая же, как в других разделах приложения.
  expect(await screen.findByRole('heading', { name: 'Занятие' })).toBeInTheDocument();
  expect(screen.getByText('Занятий пока не запланировано')).toBeInTheDocument();
});

test('пустое расписание показывает только пояснение', async () => {
  mockContext(null);
  apiFetch.mockImplementation((url) => {
    if (url.includes('/current?studentId=1')) return jsonResponse({ lesson: null });
    if (url.includes('/schedule/upcoming-list')) return jsonResponse({ lessons: [] });
    if (url.includes('/schedule/upcoming')) return jsonResponse({ lesson: null });
    return jsonResponse({});
  });

  render(<Lesson studentId={1} isTabActive />);

  expect(await screen.findByText('Сейчас занятия нет')).toBeInTheDocument();
  expect(screen.getByText(/Пока новых занятий нет/)).toBeInTheDocument();
  expect(screen.queryByText('Ближайшее занятие')).not.toBeInTheDocument();
});

test('идущее занятие сразу показывает карточку и подключает сокет без промежуточного шага', async () => {
  const lessonSocket = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
  mockContext(liveLesson, { lessonSocket, lessonConnected: true });
  mockLive();

  render(<Lesson studentId={1} isTabActive />);

  expect(await screen.findByText('Занятие идёт')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Физика' })).toBeInTheDocument();
  expect(screen.getByText('Законы Ньютона')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Перейти к трансляции' })).toBeInTheDocument();

  // ТЗ §5 состояние №3: вместо пустых карточек — текст ожидания.
  expect(await screen.findByText('Ожидайте заданий от преподавателя')).toBeInTheDocument();
  expect(screen.queryByText('Голосование')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Расписание занятий →' })).toBeInTheDocument();

  await waitFor(() => expect(lessonSocket.emit).toHaveBeenCalledWith('student:join-lesson', {
    lessonId: 11, studentId: 1, forceReconnect: true
  }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/attendance/ping?studentId=1'), expect.anything()));
});

test('карточка голосования появляется только после запуска преподавателем', async () => {
  const lessonSocket = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
  mockContext(liveLesson, { lessonSocket, lessonConnected: true });
  mockLive({
    activePoll: {
      id: 5, status: 'active', question: 'Всё понятно?', hasAnswered: false, myOptionId: null,
      options: [{ id: 1, text: 'Понятно', order: 0 }, { id: 2, text: 'Нужно повторить', order: 1 }]
    }
  });

  render(<Lesson studentId={1} isTabActive />);

  expect(await screen.findByText('Всё понятно?')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Понятно' })).toBeInTheDocument();
  expect(screen.queryByText('Ожидайте заданий от преподавателя')).not.toBeInTheDocument();
});

test('вопрос викторины скрыт, пока преподаватель его не показал', async () => {
  const lessonSocket = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
  mockContext(liveLesson, { lessonSocket, lessonConnected: true });
  mockLive({
    activeQuiz: { id: 7, mode: 'single_step', questionRevealState: 'hidden', currentQuestion: null, myAnswer: null }
  });

  render(<Lesson studentId={1} isTabActive />);

  expect(await screen.findByText('Ожидайте заданий от преподавателя')).toBeInTheDocument();
  expect(screen.queryByText('Вопрос от преподавателя')).not.toBeInTheDocument();
});

test('вопрос преподавателю скрыт, если он отключён', async () => {
  const lessonSocket = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
  mockContext(liveLesson, { lessonSocket, lessonConnected: true });
  mockLive({ canAskQuestions: false });

  render(<Lesson studentId={1} isTabActive />);

  expect(await screen.findByText('Занятие идёт')).toBeInTheDocument();
  expect(screen.queryByText('Задать вопрос преподавателю')).not.toBeInTheDocument();
});

test('отправляет вопрос преподавателю во время занятия', async () => {
  const lessonSocket = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
  mockContext(liveLesson, { lessonSocket, lessonConnected: true });
  mockLive();

  render(<Lesson studentId={1} isTabActive />);

  fireEvent.click(await screen.findByRole('button', { name: /Задать вопрос преподавателю/ }));
  const dialog = screen.getByRole('dialog', { name: 'Задать вопрос' });
  fireEvent.change(within(dialog).getByPlaceholderText('Что осталось непонятным?'), { target: { value: 'Можно повторить?' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отправить' }));

  expect(await screen.findByText('Преподаватель получил уведомление')).toBeInTheDocument();
  // Заголовок кнопки остаётся неизменным даже сразу после отправки.
  expect(screen.getByRole('button', { name: /Задать вопрос преподавателю/ })).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledWith(
    expect.stringContaining('/lessons/11/questions?studentId=1'),
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Можно повторить?' }) })
  );
});

test('голосование исчезает у ученика, когда преподаватель его закрывает', async () => {
  const handlers = {};
  const lessonSocket = {
    emit: jest.fn(),
    on: jest.fn((event, cb) => { handlers[event] = cb; }),
    off: jest.fn()
  };
  mockContext(liveLesson, { lessonSocket, lessonConnected: true });

  let pollActive = true;
  apiFetch.mockImplementation((url) => {
    if (url.includes('/current?studentId=1')) return jsonResponse({ lesson: liveLesson });
    if (url.includes('/schedule/upcoming-list')) return jsonResponse({ lessons: [] });
    if (url.includes('/schedule/upcoming')) return jsonResponse({ lesson: null });
    if (url.includes('/state?studentId=1')) return jsonResponse({
      lesson: liveLesson, isLive: true, canAskQuestions: true,
      // Закрытая без раскрытия результатов викторина возвращается как activePoll: null
      // (back/src/services/lessonState.js serializeActivePoll) — карточка должна пропасть.
      activePoll: pollActive
        ? { id: 5, status: 'active', question: 'Всё понятно?', hasAnswered: false, myOptionId: null,
            options: [{ id: 1, text: 'Понятно', order: 0 }, { id: 2, text: 'Нужно повторить', order: 1 }] }
        : null,
      activeQuiz: null, myQuestions: [], materials: []
    });
    return jsonResponse({ attendance: {} });
  });

  render(<Lesson studentId={1} isTabActive />);

  expect(await screen.findByText('Всё понятно?')).toBeInTheDocument();

  pollActive = false;
  handlers['poll:closed']?.({ pollId: 5 });

  await waitFor(() => expect(screen.queryByText('Всё понятно?')).not.toBeInTheDocument());
  expect(await screen.findByText('Ожидайте заданий от преподавателя')).toBeInTheDocument();
});

test('текст кнопки вопроса не меняется, статус вопроса виден только в подписи', async () => {
  const handlers = {};
  const lessonSocket = {
    emit: jest.fn(),
    on: jest.fn((event, cb) => { handlers[event] = cb; }),
    off: jest.fn()
  };
  mockContext(liveLesson, { lessonSocket, lessonConnected: true });
  mockLive({ myQuestions: [{ id: 40, status: 'pending', text: 'Можно повторить?' }] });

  render(<Lesson studentId={1} isTabActive />);

  // Заголовок кнопки всегда «Задать вопрос преподавателю» — статус виден только
  // в подписи под ним, чтобы кнопка не выглядела занятой прошлым вопросом.
  expect(await screen.findByRole('button', { name: /Задать вопрос преподавателю/ })).toBeInTheDocument();
  expect(screen.getByText('Ожидает ответа')).toBeInTheDocument();

  handlers['question:status-changed']?.({ question: { id: 40, status: 'answered', text: 'Можно повторить?' } });

  await waitFor(() => expect(screen.queryByText('Ожидает ответа')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Задать вопрос преподавателю/ })).toBeInTheDocument();
});
