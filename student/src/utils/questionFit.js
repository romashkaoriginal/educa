// Клиентская копия эвристики помещаемости вопроса на экран 360×640 (ТЗ §4.2).
// Должна совпадать по порогам с back/src/services/practiceFit.js — при правках
// синхронизировать оба файла.

const SCREEN = { width: 360, height: 640 };
const CONTENT_HEIGHT = 640 - 52 - 64 - 34 - 44 - 40; // ≈ 406

const QUESTION = { charsPerLine: 30, lineHeight: 22 };
const OPTION = { charsPerLine: 26, lineHeight: 21, minTapHeight: 48, gap: 8 };

function wrappedLines(text, charsPerLine) {
  const clean = String(text || '').trim();
  if (!clean) return 0;
  return clean.split(/\r?\n/).reduce(
    (sum, ln) => sum + Math.max(1, Math.ceil(ln.length / charsPerLine)),
    0
  );
}

function imageHeight(hasImage, hasText) {
  if (!hasImage) return 0;
  const ratio = hasText ? 0.22 : 0.32;
  return Math.round(SCREEN.height * ratio) + 12;
}

export function checkQuestionFits({ questionText, options, hasImage }) {
  const hasText = !!(questionText && String(questionText).trim());
  const questionHeight = wrappedLines(questionText, QUESTION.charsPerLine) * QUESTION.lineHeight;
  const optionsH = (Array.isArray(options) ? options : []).reduce((sum, opt) => {
    const lines = wrappedLines(opt, OPTION.charsPerLine);
    return sum + Math.max(OPTION.minTapHeight, lines * OPTION.lineHeight + 16) + OPTION.gap;
  }, 0);
  const estimated = imageHeight(!!hasImage, hasText) + questionHeight + optionsH;
  return { fits: estimated <= CONTENT_HEIGHT, estimated: Math.round(estimated), available: Math.round(CONTENT_HEIGHT) };
}

export const FIT_ERROR_MESSAGE =
  'Вопрос не помещается на одном экране. Сократите условие или варианты ответа.';

export { SCREEN };
