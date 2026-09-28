const { excelChoiceOptions } = require('./excelChoiceOptions');

const HW_TYPE_ALIASES = {
  single: 'single_choice', single_choice: 'single_choice',
  multiple: 'multiple_choice', multiple_choice: 'multiple_choice',
  short: 'short_answer', short_answer: 'short_answer',
  numeric: 'numeric', number: 'numeric',
  matching: 'matching',
  ordering: 'ordering',
  fill: 'fill_blanks', fill_blanks: 'fill_blanks',
  truefalse: 'true_false', true_false: 'true_false', tf: 'true_false',
};

function parseHomeworkRow(row) {
  const typeRaw = String(row.type || '').trim().toLowerCase();
  const questionText = String(row.question || '').trim();
  const correctRaw = String(row.correct ?? '').trim();
  const points = parseInt(row.points, 10) || 10;
  const explanation = String(row.explanation || '').trim() || null;

  const questionType = HW_TYPE_ALIASES[typeRaw];
  if (!questionType) {
    return { error: `неизвестный тип "${row.type}" (допустимо: single, multiple, short, numeric, matching, ordering, fill, truefalse)` };
  }
  if (!questionText) return { error: 'пустой текст вопроса' };

  const base = { questionType, questionText, explanation, points };

  switch (questionType) {
    case 'single_choice': {
      const { options, indexes } = excelChoiceOptions(row);
      if (options.length < 2) return { error: 'нужно минимум 2 варианта (колонки a–d)' };
      const idx = indexes[correctRaw.toLowerCase()];
      if (idx === undefined || idx >= options.length) return { error: `correct должен быть буквой существующего варианта (a–d), получено "${correctRaw}"` };
      return { question: { ...base, options, correctAnswer: idx } };
    }
    case 'multiple_choice': {
      const { options, indexes } = excelChoiceOptions(row);
      if (options.length < 2) return { error: 'нужно минимум 2 варианта (колонки a–d)' };
      const letters = correctRaw.toLowerCase().split(/[,\s]+/).filter(Boolean);
      const indices = [...new Set(letters.map(l => indexes[l]))];
      if (indices.length === 0 || indices.some(i => i === undefined || i >= options.length)) {
        return { error: `correct должен быть буквами вариантов через запятую (напр. a,c), получено "${correctRaw}"` };
      }
      return { question: { ...base, options, correctAnswer: indices } };
    }
    case 'true_false': {
      const v = correctRaw.toLowerCase();
      if (!['true', 'false', 'да', 'нет', 'верно', 'неверно'].includes(v)) {
        return { error: `correct должен быть true или false, получено "${correctRaw}"` };
      }
      const isTrue = ['true', 'да', 'верно'].includes(v);
      return { question: { ...base, options: null, correctAnswer: isTrue } };
    }
    case 'short_answer': {
      const variants = correctRaw.split('|').map(s => s.trim()).filter(Boolean);
      if (variants.length === 0) return { error: 'укажите хотя бы один правильный ответ в correct' };
      return { question: { ...base, options: null, correctAnswer: variants } };
    }
    case 'numeric': {
      const value = parseFloat(String(correctRaw).replace(',', '.'));
      if (Number.isNaN(value)) return { error: `correct должен быть числом, получено "${correctRaw}"` };
      const tolerance = parseFloat(String(row.tolerance || '').replace(',', '.')) || 0;
      return { question: { ...base, options: null, correctAnswer: { value, tolerance } } };
    }
    case 'ordering': {
      const items = correctRaw.split('|').map(s => s.trim()).filter(Boolean);
      if (items.length < 2) return { error: 'укажите минимум 2 элемента в correct через | в правильном порядке' };
      return { question: { ...base, options: null, correctAnswer: items } };
    }
    case 'matching': {
      const pairs = correctRaw.split(';').map(s => s.trim()).filter(Boolean).map(p => {
        const [left, right] = p.split('=').map(x => (x || '').trim());
        return { left, right };
      });
      if (pairs.length === 0 || pairs.some(p => !p.left || !p.right)) {
        return { error: 'укажите пары в формате "лево=право" через ; (напр. Россия=Москва ; Франция=Париж)' };
      }
      return { question: { ...base, options: pairs, correctAnswer: pairs } };
    }
    case 'fill_blanks': {
      // Каждый пропуск через ; ; внутри пропуска варианты через |
      const blanks = correctRaw.split(';').map(b => b.split('|').map(s => s.trim()).filter(Boolean)).filter(arr => arr.length);
      if (blanks.length === 0) return { error: 'укажите ответы для пропусков в correct (через ; , варианты через |)' };
      return { question: { ...base, options: null, correctAnswer: blanks } };
    }
    default:
      return { error: 'неподдерживаемый тип' };
  }
}

module.exports = { parseHomeworkRow };
