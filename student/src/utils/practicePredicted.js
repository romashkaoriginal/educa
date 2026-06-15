export function getNextScoreMilestone(score) {
  if (score >= 100) return null;
  return Math.floor(score / 10) * 10 + 10;
}

export function estimateTasksToMilestone(currentScore, targetScore) {
  return Math.max(1, Math.ceil((targetScore - currentScore) / 2));
}

export function getScoreMilestoneHint(predictedScore) {
  if (!predictedScore?.unlocked) return null;
  const score = predictedScore.score ?? 0;
  const target = getNextScoreMilestone(score);
  if (target == null) return null;
  const tasks = estimateTasksToMilestone(score, target);

  const allTopics = predictedScore.topics || [];
  const hasWeak = allTopics.some(t => t.solved > 0 && t.progress < 70);
  const hasNew = allTopics.some(t => t.solved === 0);

  let focusText = 'в разных подразделах';
  if (hasWeak && hasNew) {
    focusText = 'в слабых темах и новых подразделах';
  } else if (hasWeak) {
    focusText = 'в слабых темах';
  } else if (hasNew) {
    focusText = 'в новых подразделах';
  }

  return {
    target,
    tasks,
    text: `До ${target}+ — ещё ~${tasks} заданий ${focusText}`,
  };
}

export function getPredictedEncouragement(predictedScore) {
  if (!predictedScore) {
    return 'Начни с любой темы — каждое задание приближает к цели 💪';
  }

  if (!predictedScore.unlocked) {
    const solved = predictedScore.solved || 0;
    const required = predictedScore.minRequired || 50;
    const pct = required > 0 ? (solved / required) * 100 : 0;
    if (solved === 0) return 'Первые задания — самые важные. Начни с любой темы!';
    if (pct < 25) return 'Отличное начало! Каждое решённое задание приближает к баллу на ЦТ/ЦЭ ✨';
    if (pct < 50) return 'Уже четверть пути — продолжай в том же темпе!';
    if (pct < 75) return 'Скоро откроется балл на ЦТ/ЦЭ — осталось совсем немного!';
    return 'Финишная прямая до первого балла на ЦТ/ЦЭ! 🎯';
  }

  const score = predictedScore.score ?? 0;
  if (score < 10) return 'Самое начало пути — каждое задание добавляет баллы! 📈';
  if (score < 20) return 'Первые очки уже есть — отличный темп!';
  if (score < 30) return 'База формируется. Слабые темы — лучший способ быстро вырасти!';
  if (score < 40) return 'Хороший прогресс! Ещё немного практики — и будет новая десятка 💪';
  if (score < 50) return 'Ты на верном пути. Регулярность сейчас важнее всего!';
  if (score < 60) return 'Уже середина пути — отличная работа, не сбавляй темп!';
  if (score < 70) return 'Скоро уверенные 70+ — держи ритм! 🔥';
  if (score < 80) return 'Крепкий уровень! Закрепляй сильные темы и подтягивай остальное 👍';
  if (score < 90) return 'Отличный результат — ты в числе сильных учеников! ⭐';
  if (score < 100) return 'Почти максимум — осталось совсем чуть-чуть до вершины! 🏆';
  return 'Блестящий результат! Держи форму! 🎉';
}
