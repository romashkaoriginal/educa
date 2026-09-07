import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentPicker from './StudentPicker';
import { apiFetch } from './api';

vi.mock('./api', () => ({ apiFetch: vi.fn() }));
const students = [
  { id: 347, firstName: 'Иван', telegramUsername: 'Hereibe', isActive: true, subjects: [{ name: 'Физика' }] },
  { id: 2, firstName: 'Анна', telegramUsername: 'anna', isActive: true, subjects: [] },
  { id: 3, firstName: 'Олег', isActive: true, subjects: [{ name: 'Математика', UserSubject: { accessEndDate: '2020-01-01' } }] },
  { id: 4, firstName: 'Пётр', telegramUsername: 'petr', isActive: false }
];
beforeEach(() => {
  vi.resetAllMocks();
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ students }) });
});

test('загружает полный свежий список, включая ученика без предметов и с истёкшим доступом', async () => {
  sessionStorage.setItem('prefetchedStudents', '[]');
  render(<StudentPicker onSelect={vi.fn()} />);
  await screen.findByText('@Hereibe');
  expect(screen.getByText('Показано 4 из 4')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Анна/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Олег/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Пётр/ })).toBeDisabled();
  expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/students'), expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
});

test('ищет username с @, пробелами и другим регистром и выбирает нужный ID', async () => {
  const onSelect = vi.fn();
  render(<StudentPicker onSelect={onSelect} />);
  await screen.findByText('@Hereibe');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  @HEREIBE  ' } });
  expect(screen.getByText('Показано 1 из 4')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Иван/ }));
  expect(onSelect).toHaveBeenCalledWith(students[0]);
});

test('ищет по имени и позволяет сбросить поиск без результатов', async () => {
  render(<StudentPicker onSelect={vi.fn()} />);
  await screen.findByText('@Hereibe');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'анна' } });
  expect(screen.getByText('Показано 1 из 4')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'неизвестный' } });
  expect(screen.getByText('Ученик не найден')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить поиск' }));
  expect(screen.getByText('Показано 4 из 4')).toBeInTheDocument();
});

test('ошибка загрузки не выглядит как пустой список и повтор действительно загружает данные', async () => {
  apiFetch.mockResolvedValueOnce({ ok: false, status: 500 });
  render(<StudentPicker onSelect={vi.fn()} />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Ученики пока не добавлены')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  await screen.findByText('@Hereibe');
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
});
