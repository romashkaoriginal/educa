import { createHomeworkDraftSync } from './homeworkDraftSync';
import { apiFetch } from '../pages/api';
vi.mock('../pages/api', () => ({ apiFetch: vi.fn() }));
beforeEach(() => { vi.useRealTimers(); apiFetch.mockReset(); localStorage.clear(); });

test('serializes updates and retains all answers while a save is in flight', async () => {
  let finish;
  apiFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 2 }) });
  const sync = createHomeworkDraftSync(1, 10, 0, () => {});
  sync.update({ answers: { 0: 'a' } });
  sync.update({ answers: { 0: 'a', 1: 'b' } });
  expect(apiFetch).toHaveBeenCalledTimes(1);
  finish({ ok: true, json: async () => ({ revision: 1 }) });
  await sync.flush();
  expect(JSON.parse(apiFetch.mock.calls[1][1].body)).toEqual({ revision: 1, data: { answers: { 0: 'a', 1: 'b' } } });
  expect(JSON.parse(localStorage.getItem('hw_draft_1_10')).serverRevision).toBe(2);
  sync.stop();
});

test('keeps different homework drafts independent and stops on a stale revision', async () => {
  apiFetch.mockResolvedValue({ status: 409, ok: false });
  const status = vi.fn();
  const first = createHomeworkDraftSync(1, 10, 1, status);
  const second = createHomeworkDraftSync(1, 20, 0, status);
  first.update({ answers: { 0: 'math' } });
  second.update({ answers: { 0: 'physics' } });
  await Promise.all([first.flush(), second.flush()]);
  first.update({ answers: {} });
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(localStorage.getItem('hw_draft_1_10')).answers[0]).toBe('math');
  expect(JSON.parse(localStorage.getItem('hw_draft_1_20')).answers[0]).toBe('physics');
  expect(status).toHaveBeenCalledWith(expect.stringContaining('другом устройстве'));
});
