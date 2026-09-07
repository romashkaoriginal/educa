import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import FormattingTextarea from './FormattingTextarea';

function ControlledEditor() {
  const [value, setValue] = React.useState('Текст вопроса');
  return <FormattingTextarea aria-label="Вопрос" value={value} onChange={setValue} />;
}

test('добавляет и повторным нажатием снимает жирное форматирование', () => {
  render(<ControlledEditor />);
  const textarea = screen.getByLabelText('Вопрос');
  textarea.setSelectionRange(0, 5);
  fireEvent.select(textarea);

  fireEvent.click(screen.getByRole('button', { name: 'Жирный' }));
  expect(textarea).toHaveValue('**Текст** вопроса');

  fireEvent.click(screen.getByRole('button', { name: 'Жирный' }));
  expect(textarea).toHaveValue('Текст вопроса');
});

test('кнопки недоступны без выделения', () => {
  render(<ControlledEditor />);
  expect(screen.getByRole('button', { name: 'Курсив' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Подчёркнутый' })).toBeDisabled();
});
