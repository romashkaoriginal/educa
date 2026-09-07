import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentApp from './StudentApp';
import { apiFetch } from './api';

vi.mock('./api', () => ({ apiFetch: vi.fn() }));
vi.mock('./Practice', () => ({ default: ({ studentId }) => <div>Практика ученика {studentId}</div> }));
vi.mock('./Homework', () => ({ default: () => null }));
vi.mock('./Statistics', () => ({ default: () => null }));
vi.mock('./Lesson', () => ({ default: () => null }));
vi.mock('./DataContext', () => ({
  DataProvider: ({ children }) => children,
  useData: () => ({ subjects: [], preloadAllData: () => {}, lessonNotice: null })
}));

beforeEach(() => {
  vi.resetAllMocks();
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ students: [{ id: 347, firstName: 'Иван', telegramUsername: 'Hereibe', isActive: true }] }) });
});

test('суперадмин без кэша находит ученика, открывает его и возвращается к свежему списку', async () => {
  sessionStorage.clear();
  render(<StudentApp initialUser={{ id: 1, role: 'superadmin' }} />);
  await screen.findByText('@Hereibe');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '@hereibe' } });
  fireEvent.click(screen.getByRole('button', { name: /Иван/ }));
  expect(screen.getByText('Практика ученика 347')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '← Все ученики' }));
  await screen.findByRole('searchbox');
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

test('обычный ученик входит в свой раздел без запроса административного списка', () => {
  render(<StudentApp initialUser={{ id: 347, role: 'student', isActive: true }} />);
  expect(screen.getByText('Практика ученика 347')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '← Все ученики' })).not.toBeInTheDocument();
  expect(apiFetch).not.toHaveBeenCalled();
});
