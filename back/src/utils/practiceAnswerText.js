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

function formatPracticeOption(options, index) {
  if (index == null || Number.isNaN(Number(index))) return null;
  const idx = parseInt(index, 10);
  if (idx < 0) return null;
  const opts = parseOptions(options);
  if (!opts.length || idx >= opts.length) return null;
  const text = String(opts[idx] ?? '').trim();
  return text || null;
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
