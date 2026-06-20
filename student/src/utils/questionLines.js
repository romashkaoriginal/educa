// Подсчёт «строк» вопроса практики — ОБЩАЯ логика с бэком
// (back/src/utils/questionLines.js). Держать синхронной.

export const CHARS_PER_LINE = 32;
export const MAX_TOTAL_LINES = 8;

export function countLines(text) {
  const str = String(text || '');
  if (!str.trim()) return 0;
  return str.split('\n').reduce((sum, segment) => {
    const len = segment.trim().length;
    return sum + Math.max(1, Math.ceil(len / CHARS_PER_LINE));
  }, 0);
}

export function totalQuestionLines(questionText, options) {
  let lines = countLines(questionText);
  const opts = Array.isArray(options) ? options : [];
  for (const opt of opts) lines += countLines(opt);
  return lines;
}

export function checkQuestionLines(questionText, options) {
  const lines = totalQuestionLines(questionText, options);
  return { ok: lines <= MAX_TOTAL_LINES, lines, max: MAX_TOTAL_LINES };
}
