import { prepareImageForUpload } from './ImageUploadField';

afterEach(() => {
  delete global.createImageBitmap;
  jest.restoreAllMocks();
});

test('не изменяет изображение, которое уже безопасно для прокси', async () => {
  const file = new File([new Uint8Array(100 * 1024)], 'small.png', { type: 'image/png' });
  await expect(prepareImageForUpload(file)).resolves.toBe(file);
});

test('сжимает большое изображение перед отправкой', async () => {
  const close = jest.fn();
  global.createImageBitmap = jest.fn(async () => ({ width: 2400, height: 1200, close }));
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: jest.fn() });
  jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob([new Uint8Array(700 * 1024)], { type: 'image/webp' }));
  });
  const file = new File([new Uint8Array(2 * 1024 * 1024)], 'large.png', { type: 'image/png' });

  const prepared = await prepareImageForUpload(file);

  expect(prepared.type).toBe('image/webp');
  expect(prepared.name).toBe('large.webp');
  expect(prepared.size).toBeLessThanOrEqual(800 * 1024);
  expect(close).toHaveBeenCalled();
});
