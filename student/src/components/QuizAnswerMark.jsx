import React from 'react';

export default function QuizAnswerMark({ index, showLetter = true }) {
  const shapes = [
    <path key="triangle" d="M24 7 42 39H6L24 7Z" />,
    <path key="diamond" d="m24 5 19 19-19 19L5 24 24 5Z" />,
    <circle key="circle" cx="24" cy="24" r="17" />,
    <rect key="square" x="8" y="8" width="32" height="32" rx="3" />,
  ];

  return <span className="quiz-answer-mark" aria-hidden="true">
    <svg viewBox="0 0 48 48" focusable="false">{shapes[index % shapes.length]}</svg>
    {showLetter && <b>{String.fromCharCode(65 + index)}</b>}
  </span>;
}
