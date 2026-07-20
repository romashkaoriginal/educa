const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { PracticeImage, PracticeQuestion } = require('../models');
const { Op } = require('sequelize');

// Файловое хранилище (docker volume). Путь можно переопределить через env.
const UPLOAD_DIR = process.env.PRACTICE_UPLOAD_DIR
  || path.join(__dirname, '..', '..', 'uploads', 'practice');

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;      // 10 МБ исходник (ТЗ §5.2)
const MAX_SOURCE_PIXELS = 40 * 1024 * 1024;     // защита от pixel-flood (ТЗ §5.2)
const MAX_LONG_SIDE = 1600;                     // длинная сторона после resize (ТЗ §5.3)
const WEBP_QUALITY = 87;                        // читаемость текста/формул (ТЗ §5.3)

// sharp декодирует по реальному содержимому, а не по расширению —
// это и есть проверка настоящего формата (ТЗ §5.3.1). SVG/GIF отклоняем.
const ALLOWED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp']);

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
 * Принимает исходный buffer, оптимизирует и сохраняет как WebP.
 * Возвращает запись PracticeImage (переиспользует существующую при совпадении хеша).
 * ТЗ §5.3, §5.4.
 */
async function processAndStore(buffer) {
  if (!buffer || !buffer.length) {
    throw new ImageError('Пустой файл изображения.');
  }
  if (buffer.length > MAX_SOURCE_BYTES) {
    throw new ImageError('Файл больше 10 МБ.');
  }

  let meta;
  try {
    // rotate() применяет EXIF-ориентацию и снимает необходимость хранить EXIF.
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (e) {
    throw new ImageError('Файл не является поддерживаемым изображением.');
  }

  if (!ALLOWED_INPUT_FORMATS.has(meta.format)) {
    throw new ImageError('Поддерживаются только JPG, PNG и WebP.');
  }
  if (meta.pages && meta.pages > 1) {
    throw new ImageError('Анимированные изображения не поддерживаются.');
  }
  if (meta.width && meta.height && meta.width * meta.height > MAX_SOURCE_PIXELS) {
    throw new ImageError('Слишком большое разрешение изображения.');
  }

  const hasAlpha = !!meta.hasAlpha;

  // rotate() без аргумента — по EXIF; withMetadata не вызываем, EXIF стирается.
  let pipeline = sharp(buffer, { failOn: 'error' }).rotate();

  const longSide = Math.max(meta.width || 0, meta.height || 0);
  if (longSide > MAX_LONG_SIDE) {
    // Не увеличиваем маленькие (withoutEnlargement), сохраняем пропорции.
    pipeline = pipeline.resize({
      width: MAX_LONG_SIDE,
      height: MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  const optimized = await pipeline
    .webp({ quality: WEBP_QUALITY, alphaQuality: hasAlpha ? 90 : 100 })
    .toBuffer({ resolveWithObject: true });

  let outBuffer = optimized.data;
  let outFormat = 'webp';
  let outMime = 'image/webp';
  // Итоговые размеры: из результата кодирования WebP, либо из исходных
  // метаданных, если оставляем оригинал — второй sharp(...).metadata() не нужен.
  let outWidth = optimized.info.width;
  let outHeight = optimized.info.height;

  // Если WebP получился больше оригинала — оставляем оригинал (ТЗ §5.3.8),
  // но только для уже безопасных растровых форматов.
  if (outBuffer.length > buffer.length) {
    outBuffer = buffer;
    outFormat = meta.format === 'jpeg' ? 'jpg' : meta.format;
    outMime = `image/${meta.format}`;
    outWidth = meta.width;
    outHeight = meta.height;
  }

  const fileHash = crypto.createHash('sha256').update(outBuffer).digest('hex');

  // Дедупликация по хешу оптимизированного файла (ТЗ §5.4).
  const existing = await PracticeImage.findOne({ where: { fileHash } });
  if (existing && fs.existsSync(storagePath(existing.storageKey))) {
    return existing;
  }

  const storageKey = `${fileHash.slice(0, 16)}_${Date.now()}.${outFormat === 'jpg' ? 'jpg' : outFormat}`;
  ensureDir();
  fs.writeFileSync(storagePath(storageKey), outBuffer);

  return PracticeImage.create({
    storageKey,
    mimeType: outMime,
    width: outWidth,
    height: outHeight,
    fileSize: outBuffer.length,
    fileHash
  });
}

/**
 * Удаляет изображение, только если на него больше не ссылается ни один вопрос
 * (ни как условие, ни как подсказка) — ТЗ §5.4.
 */
async function deleteImageIfOrphan(imageId, { excludeQuestionId } = {}) {
  if (!imageId) return;
  const where = {
    [Op.or]: [{ questionImageId: imageId }, { hintImageId: imageId }]
  };
  if (excludeQuestionId) {
    where.id = { [Op.ne]: excludeQuestionId };
  }
  const stillUsed = await PracticeQuestion.count({ where });
  if (stillUsed > 0) return;

  const image = await PracticeImage.findByPk(imageId);
  if (!image) return;
  try {
    const p = storagePath(image.storageKey);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.error('Failed to unlink image file:', e.message);
  }
  await image.destroy();
}

module.exports = {
  processAndStore,
  deleteImageIfOrphan,
  storagePath,
  UPLOAD_DIR,
  ImageError,
  MAX_SOURCE_BYTES
};
