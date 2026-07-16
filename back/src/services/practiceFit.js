// Эвристическая проверка «вопрос помещается на контрольном экране 360×640»
// (ТЗ §4.2). Точный рендер в WebView Telegram не воспроизвести на сервере,
// поэтому оцениваем занимаемую высоту по длине текста и высоте изображения.
// Пороги намеренно консервативны: лучше предупредить о крупном вопросе,
// чем пропустить тот, что даст скролл у ученика.

const SCREEN = { width: 360, height: 640 };

// Высоты фиксированных зон практики на контрольном экране (px, приблизительно):
const CHROME = {
  topBar: 52,        // верхняя панель приложения
  bottomNav: 64,     // нижняя навигация
  metaRow: 34,       // сложность + кнопка подсказки
  navRow: 44,        // «предыдущий/следующий»
  paddings: 40       // суммарные внешние отступы карточки
};

// Доступная под контент (текст + варианты + картинка) высота.
const CONTENT_HEIGHT = SCREEN.height
  - CHROME.topBar - CHROME.bottomNav - CHROME.metaRow - CHROME.navRow - CHROME.paddings; // ≈ 406

// Оценка ширины символа и высоты строки для минимально допустимых кеглей (ТЗ §4.1).
const QUESTION = { charsPerLine: 30, lineHeight: 22 }; // ~16px шрифт, ширина карточки ~300
const OPTION = { charsPerLine: 26, lineHeight: 21, minTapHeight: 48, gap: 8 };

function wrappedLines(text, charsPerLine) {
  const clean = String(text || '').trim();
  if (!clean) return 0;
  // Учитываем и явные переносы, и перенос по ширине.
  return clean.split(/\r?\n/).reduce((sum, ln) => {
    return sum + Math.max(1, Math.ceil(ln.length / charsPerLine));
  }, 0);
}

function questionTextHeight(text) {
  const lines = wrappedLines(text, QUESTION.charsPerLine);
  return lines * QUESTION.lineHeight;
}

function optionsHeight(options) {
  const list = Array.isArray(options) ? options : [];
  return list.reduce((sum, opt) => {
    const lines = wrappedLines(opt, OPTION.charsPerLine);
    const h = Math.max(OPTION.minTapHeight, lines * OPTION.lineHeight + 16);
    return sum + h + OPTION.gap;
  }, 0);
}

// Высота, которую займёт изображение вопроса. Доля высоты экрана зависит от
// наличия текста (ТЗ §4.1): с текстом — до ~22%, без текста — до ~32%.
function imageHeight(hasImage, hasText) {
  if (!hasImage) return 0;
  const ratio = hasText ? 0.22 : 0.32;
  return Math.round(SCREEN.height * ratio) + 12; // + отступ под картинкой
}

/**
 * @returns {{ fits: boolean, estimated: number, available: number }}
 */
function checkQuestionFits({ questionText, options, hasImage }) {
  const hasText = !!(questionText && String(questionText).trim());
  const estimated =
    imageHeight(!!hasImage, hasText) +
    questionTextHeight(questionText) +
    optionsHeight(options);

  return {
    fits: estimated <= CONTENT_HEIGHT,
    estimated: Math.round(estimated),
    available: Math.round(CONTENT_HEIGHT)
  };
}

const FIT_ERROR_MESSAGE =
  'Вопрос не помещается на одном экране. Сократите условие или варианты ответа.';

module.exports = { checkQuestionFits, FIT_ERROR_MESSAGE, SCREEN, CONTENT_HEIGHT };
