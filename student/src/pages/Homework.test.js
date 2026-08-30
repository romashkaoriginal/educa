import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentHomework, { MatchingWire } from './Homework';
import { apiFetch } from './api';

jest.mock('./api', () => ({ apiFetch: jest.fn() }));
jest.mock('./DataContext', () => ({
  useData: () => ({
    homeworks: [],
    subjects: [],
    refreshAfterHomework: jest.fn(),
    loading: { homework: false },
    homeworkHomeToken: 0,
  }),
}));

const pairs = [
  { left: 'панорама', right: 'широкий вид местности' },
  { left: 'филармония', right: 'концертная организация' },
];

test('matching прокручивается по тексту и поддерживает выбор через коннекторы', () => {
  const onChange = jest.fn();

  render(
    <MatchingWire
      pairs={pairs}
      rightOrder={[0, 1]}
      connections={{}}
      colors={['#534AB7', '#1D9E75']}
      onChange={onChange}
    />
  );

  const leftText = screen.getByText('панорама');
  fireEvent.pointerDown(leftText, { clientX: 10, clientY: 10 });
  expect(leftText.closest('.mw-block')).not.toHaveClass('mw-block--active');

  fireEvent.click(screen.getByRole('button', { name: 'Соединить «панорама»' }));
  expect(leftText.closest('.mw-block')).toHaveClass('mw-block--active');

  fireEvent.click(screen.getByRole('button', { name: 'Выбрать соответствие «широкий вид местности»' }));
  expect(onChange).toHaveBeenCalledWith({ 0: 0 });
});

test('предпросмотр преподавателя проверяет ответы локально и не создаёт попытку', () => {
  const onExitPreview = jest.fn();
  const previewHomework = {
    id: 25,
    title: 'Проверка интерфейса',
    subjectId: 1,
    questions: [{
      id: 101,
      questionType: 'single_choice',
      questionText: 'Сколько будет 2 + 2?',
      options: ['3', '4'],
      correctAnswer: 1,
      points: 10,
    }],
  };

  render(
    <StudentHomework
      studentId={5}
      previewHomework={previewHomework}
      onExitPreview={onExitPreview}
    />
  );

  expect(screen.getByText('Режим ученика · без сохранения')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /B 4/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Проверить ответы' }));

  expect(screen.getByText('Предпросмотр преподавателя · результат не сохранён')).toBeInTheDocument();
  expect(screen.getByText('1 из 1')).toBeInTheDocument();
  expect(apiFetch).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Закрыть предпросмотр' }));
  expect(onExitPreview).toHaveBeenCalledTimes(1);
});
