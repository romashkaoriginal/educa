import React from 'react';

function getNextScoreMilestone(score) {
  if (score >= 100) return null;
  return Math.floor(score / 10) * 10 + 10;
}

function estimateTasksToMilestone(currentScore, targetScore) {
  return Math.max(1, Math.ceil((targetScore - currentScore) / 2));
}

function getScoreMilestoneHint(predictedScore) {
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

function getPredictedEncouragement(predictedScore) {
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

function PredictedScoreCard({ predictedScore, subjectName }) {
  if (!predictedScore) return null;

  const scoreDelta = predictedScore.delta;
  const scoreMilestoneHint = getScoreMilestoneHint(predictedScore);
  const predictedEncouragement = getPredictedEncouragement(predictedScore);
  const unlockPercent = predictedScore.minRequired
    ? Math.min(100, Math.round(((predictedScore.solved || 0) / predictedScore.minRequired) * 100))
    : 0;
  const scoreRingClass = !predictedScore.unlocked
    ? 'locked'
    : predictedScore.score >= 70
      ? 'score-high'
      : predictedScore.score >= 40
        ? 'score-mid'
        : 'score-low';

  return (
    <div className="dash-card predicted-score-card">
      <div className="predicted-score-header">
        <span className="predicted-label">
          {subjectName ? `Твои баллы на ЦТ/ЦЭ · ${subjectName}` : 'Твои баллы на ЦТ/ЦЭ'}
        </span>
        {predictedScore.unlocked && scoreDelta != null && scoreDelta !== 0 && (
          <span className={`score-delta ${scoreDelta > 0 ? 'up' : 'down'}`}>
            {scoreDelta > 0 ? '+' : ''}{scoreDelta}
          </span>
        )}
        {!predictedScore.unlocked && (
          <span className="predicted-unlock-count">
            {predictedScore.solved || 0}/{predictedScore.minRequired || 50}
          </span>
        )}
      </div>

      <div className="predicted-score-ring-wrap">
        <div
          className={`predicted-score-ring ${scoreRingClass}`}
          style={{
            '--score-pct': predictedScore.unlocked
              ? `${predictedScore.score}%`
              : `${unlockPercent}%`
          }}
        >
          {predictedScore.unlocked ? (
            <span className="predicted-score-ring-inner">
              <span className="predicted-score-ring-value">{predictedScore.score}</span>
              <span className="predicted-score-ring-max">/100</span>
            </span>
          ) : (
            <span className="predicted-score-ring-inner locked">
              <span className="predicted-score-ring-value">{unlockPercent}%</span>
            </span>
          )}
        </div>
      </div>

      {predictedScore.unlocked ? (
        <>
          <div className="predicted-meta">
            Точность {predictedScore.accuracy}%
          </div>
          {scoreMilestoneHint && (
            <p className="predicted-action-hint">{scoreMilestoneHint.text}</p>
          )}
          <p className="predicted-hint predicted-encouragement">{predictedEncouragement}</p>
        </>
      ) : (
        <>
          <p className="predicted-locked-title">Балл пока недоступен</p>
          <p className="predicted-hint predicted-encouragement">{predictedEncouragement}</p>
          <p className="predicted-locked-hint">
            Реши ещё {predictedScore.needed ?? 50} заданий
          </p>
        </>
      )}
    </div>
  );
}

export default PredictedScoreCard;
