import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import LessonQuizArena from './LessonQuizArena';
// jsdom cannot calculate styles on KaTeX MathML; formula rendering has its own suite.
vi.mock('./MathText', () => ({ default: ({ text }) => <span>{text}</span> }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const base = { id: 5, mode: 'single_step', status: 'active', phase: 'question', joined: true,
  currentQuestionIndex: 0, totalQuestions: 5, serverNow: Date.now(), deadline: Date.now() + 30000,
  title: 'Алгебра', currentQuestion: { id: 12, questionText: 'Решите $x^2=4$', options: ['$2$', '$-2$', '$\\pm 2$'], timeLimit: 30, correctAnswer: [2], explanation: 'Скрытый разбор' } };
test('quiz escapes the hidden lesson tab, accepts selection and never exposes answer keys', () => {
  const onAnswer = vi.fn();
  render(<div style={{ display: 'none' }}><LessonQuizArena quiz={base} studentId={1} onAnswer={onAnswer} onClose={() => {}} /></div>);
  expect(screen.getByRole('dialog')).toHaveAttribute('open');
  expect(screen.getByRole('timer')).toBeVisible();
  expect(screen.queryByText('Скрытый разбор')).not.toBeInTheDocument();
  const choices = screen.getAllByRole('button', { pressed: false });
  fireEvent.click(choices[2]);
  fireEvent.click(screen.getByRole('button', { name: /Отправить ответ/ }));
  expect(onAnswer).toHaveBeenCalledWith(12, [2]);
});
test('reconnection preserves accepted answer and prevents a second submission', () => {
  render(<LessonQuizArena quiz={{ ...base, myAnswer: { selectedAnswer: [1] } }} onClose={() => {}} />);
  expect(screen.getByText('Ответ принят')).toBeVisible();
  expect(screen.getByRole('button', { pressed: true })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /Отправить ответ/ })).not.toBeInTheDocument();
});
test('start before the first question has a visible waiting screen', () => {
  render(<LessonQuizArena quiz={{ ...base, phase: 'waiting', currentQuestion: null }} onClose={() => {}} />);
  expect(screen.getByText('Сейчас начнём.')).toBeVisible();
});
test('final shows top three podium, places four to ten, and own place outside top ten', () => {
  const entries = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, place: index + 1, name: `Ученик ${index + 1}`, totalScore: 10 - index }));
  const onClose = vi.fn();
  render(<LessonQuizArena quiz={{ ...base, phase: 'finished', leaderboard: entries, myStanding: { place: 14, totalScore: 0 } }} onClose={onClose} />);
  expect(screen.getByLabelText('Тройка лидеров').children).toHaveLength(3);
  expect(screen.getByLabelText('Места с четвёртого по десятое').children).toHaveLength(7);
  expect(screen.getByLabelText('Ваш результат')).toHaveTextContent('14');
  fireEvent.click(screen.getByRole('button', { name: /Вернуться к занятию/ }));
  expect(onClose).toHaveBeenCalledOnce();
});
