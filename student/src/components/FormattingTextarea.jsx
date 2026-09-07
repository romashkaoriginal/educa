import React, { useLayoutEffect, useRef, useState } from 'react';
import './FormattingTextarea.css';

const FORMATS = [
  { key: 'bold', label: 'Жирный', icon: 'B', open: '**', close: '**' },
  { key: 'italic', label: 'Курсив', icon: 'I', open: '*', close: '*' },
  { key: 'underline', label: 'Подчёркнутый', icon: 'U', open: '++', close: '++' },
];

function selectionHasFormat(value, start, end, format) {
  return start >= format.open.length
    && value.slice(start - format.open.length, start) === format.open
    && value.slice(end, end + format.close.length) === format.close;
}

export default function FormattingTextarea({ value, onChange, className = '', ...props }) {
  const textareaRef = useRef(null);
  const pendingSelection = useRef(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  useLayoutEffect(() => {
    if (!pendingSelection.current || !textareaRef.current) return;
    const { start, end } = pendingSelection.current;
    pendingSelection.current = null;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(start, end);
    setSelection({ start, end });
  }, [value]);

  const rememberSelection = () => {
    const element = textareaRef.current;
    if (!element) return;
    setSelection({ start: element.selectionStart, end: element.selectionEnd });
  };

  const toggleFormat = (format) => {
    const { start, end } = selection;
    if (start === end) return;

    const selected = value.slice(start, end);
    const isActive = selectionHasFormat(value, start, end, format);
    let nextValue;
    let nextSelection;

    if (isActive) {
      nextValue = value.slice(0, start - format.open.length)
        + selected
        + value.slice(end + format.close.length);
      nextSelection = { start: start - format.open.length, end: end - format.open.length };
    } else {
      nextValue = value.slice(0, start)
        + format.open
        + selected
        + format.close
        + value.slice(end);
      nextSelection = { start: start + format.open.length, end: end + format.open.length };
    }

    pendingSelection.current = nextSelection;
    onChange(nextValue);
  };

  return (
    <div className={`formatting-textarea ${className}`.trim()}>
      <div className="formatting-textarea__toolbar" role="toolbar" aria-label="Форматирование текста">
        {FORMATS.map((format) => {
          const isActive = selection.start !== selection.end
            && selectionHasFormat(value, selection.start, selection.end, format);
          return (
            <button
              key={format.key}
              type="button"
              className={`formatting-textarea__button formatting-textarea__button--${format.key}`}
              aria-label={format.label}
              aria-pressed={isActive}
              title={`${format.label}: выделите текст и нажмите`}
              disabled={selection.start === selection.end}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggleFormat(format)}
            >
              {format.icon}
            </button>
          );
        })}
        <span className="formatting-textarea__hint">Сначала выделите текст</span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onSelect={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        {...props}
      />
    </div>
  );
}
