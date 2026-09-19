const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

// Файловое хранилище (docker volume). Путь можно переопределить через env,
// по аналогии с PRACTICE_UPLOAD_DIR (ТЗ практики, project_practice_images).
const UPLOAD_DIR = process.env.PROBLEM_REPORT_UPLOAD_DIR
  || path.join(__dirname, '..', '..', 'uploads', 'problem-reports');

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;   // 10 МБ — предел файла из Telegram
const MAX_LONG_SIDE = 1600;                  // длинная сторона после resize
const WEBP_QUALITY = 87;

function ensureDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function storagePath(storageKey) {
  return path.join(UPLOAD_DIR, storageKey);
}

class ImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageError';
    this.isImageError = true;
  }
}

/**
 * Принимает buffer скриншота (уже скачанный из Telegram), оптимизирует
 * и сохраняет как WebP. Возвращает storageKey.
 */
async function storeScreenshot(buffer) {
  if (!buffer || !buffer.length) {
    throw new ImageError('Пустой файл скриншота.');
  }
  if (buffer.length > MAX_SOURCE_BYTES) {
    throw new ImageError('Файл больше 10 МБ.');
  }

  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (e) {
    throw new ImageError('Файл не является поддерживаемым изображением.');
  }

  let pipeline = sharp(buffer, { failOn: 'error' }).rotate();
  const longSide = Math.max(meta.width || 0, meta.height || 0);
  if (longSide > MAX_LONG_SIDE) {
    pipeline = pipeline.resize({
      width: MAX_LONG_SIDE,
      height: MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  const optimized = await pipeline
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const fileHash = crypto.createHash('sha256').update(optimized).digest('hex');
  const storageKey = `${fileHash.slice(0, 16)}_${Date.now()}.webp`;

  ensureDir();
  fs.writeFileSync(storagePath(storageKey), optimized);

  return storageKey;
}

function deleteScreenshots(storageKeys) {
  for (const key of storageKeys || []) {
    try {
      const p = storagePath(key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {
      console.error('Failed to unlink problem report screenshot:', e.message);
    }
  }
}

module.exports = {
  storeScreenshot,
  deleteScreenshots,
  storagePath,
  UPLOAD_DIR,
  ImageError,
  MAX_SOURCE_BYTES
};
