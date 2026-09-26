import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MemeModal from './MemeModal';
import { apiFetch } from '../pages/api';

vi.mock('../pages/api', () => ({ apiFetch: vi.fn() }));

beforeEach(() => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, reaction: 'stone' }) });
});

afterEach(() => vi.clearAllMocks());

test('сохраняет выбранную реакцию на конкретный мем', async () => {
  render(<MemeModal meme={{ id: 17, storageKey: 'meme.webp' }} onClose={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Каменное лицо' }));

  await waitFor(() => {
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/practice\/daily-memes\/17\/reaction$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reaction: 'stone' }) })
    );
  });
});
