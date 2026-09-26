import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import LeaderboardModal from './LeaderboardModal';
import { apiFetch } from '../pages/api';

vi.mock('../pages/api', () => ({ apiFetch: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('student sees their score in the leaderboard even outside the visible top', async () => {
  apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      leaderboard: [{ id: 1, name: 'Лидер', totalScore: 96 }],
      myScore: 48,
      dateFrom: '2026-09-01T00:00:00.000Z',
      dateTo: '2026-09-30T23:59:59.999Z'
    })
  });

  render(<LeaderboardModal open onClose={() => {}} subjectId={5} subjectName="Русский язык" />);

  expect(await screen.findByLabelText('Твои баллы за период')).toHaveTextContent('48 баллов');
  expect(screen.getByText('Лидер')).toBeVisible();
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/practice\/leaderboard-combined\/5$/)
  ));
});

test('shows empty state when the teacher-set period has ended', async () => {
  apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      leaderboard: [], myScore: null,
      dateFrom: '2026-01-01T00:00:00.000Z', dateTo: '2026-01-31T23:59:59.999Z'
    })
  });

  render(<LeaderboardModal open onClose={() => {}} subjectId={5} subjectName="Русский язык" />);

  expect(await screen.findByText('Период лидерборда завершён — ждите новый от преподавателя')).toBeVisible();
});
