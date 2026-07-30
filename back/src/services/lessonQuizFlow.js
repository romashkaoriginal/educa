function nextQuestionState(quiz) {
  return {
    currentQuestionIndex: Number(quiz.currentQuestionIndex) + 1,
    questionRevealState: 'question',
    explanationRevealed: false
  };
}

module.exports = { nextQuestionState };
