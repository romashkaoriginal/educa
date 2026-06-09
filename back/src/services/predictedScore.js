const CONFIG = require('../config/predictedScore');

const DIFFICULTIES = ['easy', 'medium', 'hard'];

function calcDifficultyMastery(results, difficulty) {
  const filtered = results.filter(r => r.difficulty === difficulty);
  const N = filtered.length;
  if (N === 0) return 0;

  const C = filtered.filter(r => r.isCorrect).length;
  const T = CONFIG.MIN_PER_DIFFICULTY[difficulty] || 10;
  const A = C / N;
  const V = Math.min(1, N / T);
  return A * V;
}

function calcTopicProgress(topicResults) {
  const easyM = calcDifficultyMastery(topicResults, 'easy');
  const mediumM = calcDifficultyMastery(topicResults, 'medium');
  const hardM = calcDifficultyMastery(topicResults, 'hard');

  const progress =
    easyM * CONFIG.DIFFICULTY_WEIGHTS.easy +
    mediumM * CONFIG.DIFFICULTY_WEIGHTS.medium +
    hardM * CONFIG.DIFFICULTY_WEIGHTS.hard;

  return Math.round(progress * 100);
}

function getDifficultyBreakdown(topicResults) {
  return DIFFICULTIES.map((difficulty) => {
    const filtered = topicResults.filter(r => r.difficulty === difficulty);
    const N = filtered.length;
    const C = filtered.filter(r => r.isCorrect).length;
    const T = CONFIG.MIN_PER_DIFFICULTY[difficulty];
    const mastery = calcDifficultyMastery(topicResults, difficulty);
    return {
      difficulty,
      solved: N,
      correct: C,
      target: T,
      accuracy: N > 0 ? Math.round(C / N * 100) : 0,
      mastery: Math.round(mastery * 100),
      volumePercent: N > 0 ? Math.round(Math.min(1, N / T) * 100) : 0
    };
  });
}

function normalizeTopicWeights(topics) {
  if (!topics.length) return [];

  const allHaveWeight = topics.every(t => t.weight != null && t.weight > 0);
  if (allHaveWeight) {
    const sum = topics.reduce((s, t) => s + t.weight, 0);
    const divisor = sum > 0 ? sum : 100;
    return topics.map(t => ({
      ...t,
      normalizedWeight: t.weight / divisor
    }));
  }

  const equal = 1 / topics.length;
  return topics.map(t => ({
    ...t,
    normalizedWeight: equal
  }));
}

function calculatePredictedScore(topics, results) {
  const uniqueCount = new Set(results.map(r => r.questionId)).size;

  if (uniqueCount < CONFIG.MIN_TOTAL_TO_UNLOCK) {
    return {
      unlocked: false,
      solved: uniqueCount,
      needed: CONFIG.MIN_TOTAL_TO_UNLOCK - uniqueCount,
      minRequired: CONFIG.MIN_TOTAL_TO_UNLOCK,
      score: null,
      accuracy: results.length > 0
        ? Math.round(results.filter(r => r.isCorrect).length / results.length * 100)
        : 0,
      topics: [],
      strongTopics: [],
      weakTopics: []
    };
  }

  const normalizedTopics = normalizeTopicWeights(topics);
  let totalScore = 0;
  const topicDetails = [];

  for (const topic of normalizedTopics) {
    const topicResults = results.filter(r => r.topicId === topic.id);
    const progress = calcTopicProgress(topicResults);
    totalScore += progress * topic.normalizedWeight;

    topicDetails.push({
      topicId: topic.id,
      name: topic.name,
      icon: topic.icon || '📝',
      weight: topic.weight,
      normalizedWeight: Math.round(topic.normalizedWeight * 100),
      progress,
      solved: new Set(topicResults.map(r => r.questionId)).size,
      accuracy: topicResults.length > 0
        ? Math.round(topicResults.filter(r => r.isCorrect).length / topicResults.length * 100)
        : 0,
      difficulties: getDifficultyBreakdown(topicResults)
    });
  }

  const score = Math.round(Math.min(100, Math.max(0, totalScore)));
  const correct = results.filter(r => r.isCorrect).length;
  const accuracy = results.length > 0 ? Math.round(correct / results.length * 100) : 0;

  const sorted = [...topicDetails].sort((a, b) => b.progress - a.progress);
  const strongTopics = sorted.filter(t => t.progress >= 60).slice(0, 3);
  const weakTopics = [...topicDetails]
    .sort((a, b) => a.progress - b.progress)
    .filter(t => t.progress < 70)
    .slice(0, 3);

  return {
    unlocked: true,
    score,
    solved: uniqueCount,
    needed: 0,
    minRequired: CONFIG.MIN_TOTAL_TO_UNLOCK,
    accuracy,
    topics: topicDetails,
    strongTopics,
    weakTopics
  };
}

function getWeakTopicIds(prediction, limit = 3) {
  if (!prediction?.topics?.length) return [];
  return [...prediction.topics]
    .sort((a, b) => a.progress - b.progress)
    .slice(0, limit)
    .map(t => t.topicId);
}

module.exports = {
  CONFIG,
  calculatePredictedScore,
  getDifficultyBreakdown,
  getWeakTopicIds,
  calcTopicProgress
};
