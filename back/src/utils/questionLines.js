// Подсчёт «строк» вопроса практики для ограничения объёма (чтобы вопрос
// влезал на экран Mini App без скролла). Логика ОБЩАЯ с фронтом
// (student/src/utils/questionLines.js) — держать синхронной.
//
// Аппроксимация: при шрифте 14px в карточке Mini App в одну строку влезает
// ~CHARS_PER_LINE символов. Строки = ceil(длина/CHARS_PER_LINE) с учётом
// явных переносов \n. Лимит — суммарно по вопросу и всем вариантам.

const CHARS_PER_LINE = 32; // символов в одной строке (≈ ширина карточки, 14px)
const MAX_TOTAL_LINES = 8;  // макс. суммарно строк (вопрос + все варианты)

// Сколько визуальных строк займёт один текст
function countLines(text) {
  const str = String(text || '');
  if (!str.trim()) return 0;
  // Каждый явный перенос — отдельный сегмент, каждый сегмент переносится по ширине
  return str.split('\n').reduce((sum, segment) => {
    const len = segment.trim().length;
    return sum + Math.max(1, Math.ceil(len / CHARS_PER_LINE));
  }, 0);
}

// Суммарное число строк вопроса + вариантов
function totalQuestionLines(questionText, options) {
  let lines = countLines(questionText);
  const opts = Array.isArray(options) ? options : [];
  for (const opt of opts) {
    lines += countLines(opt);
  }
  return lines;
}

// Проверка лимита. Возвращает { ok, lines, max }
function checkQuestionLines(questionText, options) {
  const lines = totalQuestionLines(questionText, options);
  return { ok: lines <= MAX_TOTAL_LINES, lines, max: MAX_TOTAL_LINES };
}

module.exports = {
  CHARS_PER_LINE,
  MAX_TOTAL_LINES,
  countLines,
  totalQuestionLines,
  checkQuestionLines
};
