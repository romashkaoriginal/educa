function parseOptions(options) {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatSingleOption(opts, index) {
  if (index == null || Number.isNaN(Number(index))) return null;
  const idx = parseInt(index, 10);
  if (idx < 0 || idx >= opts.length) return null;
  const text = String(opts[idx] ?? '').trim();
  return text || null;
}

// index — один индекс варианта, либо массив индексов (multiple choice).
function formatPracticeOption(options, index) {
  const opts = parseOptions(options);
  if (!opts.length) return null;

  if (Array.isArray(index)) {
    const texts = index
      .map((i) => formatSingleOption(opts, i))
      .filter(Boolean);
    return texts.length ? texts.join(', ') : null;
  }

  return formatSingleOption(opts, index);
}

function buildRecentErrorPayload(row) {
  const question = row.question || {};
  const options = question.options;
  const selectedAnswer = row.selectedAnswer ?? row.selectedAnswerIndex;
  const correctIndex = question.correctAnswer;

  return {
    id: row.id,
    topicId: row.topicId,
    topicName: row.topic?.name || 'Тема',
    topicIcon: row.topic?.icon || '📝',
    difficulty: question.difficulty || 'medium',
    date: row.answeredAt || row.createdAt,
    explanation: question.explanation || null,
    questionText: question.questionText
      ? String(question.questionText).slice(0, 200)
      : null,
    userAnswer: formatPracticeOption(options, selectedAnswer),
    correctAnswer: formatPracticeOption(options, correctIndex)
  };
}

module.exports = {
  formatPracticeOption,
  buildRecentErrorPayload
};
