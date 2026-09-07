import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './MathText.css';

const DELIMITERS = [
  { open: '$$', close: '$$', display: true },
  { open: '\\[', close: '\\]', display: true },
  { open: '\\(', close: '\\)', display: false },
  { open: '$', close: '$', display: false },
];

const KATEX_OPTIONS = {
  throwOnError: true,
  trust: false,
  strict: 'ignore',
  output: 'htmlAndMathml',
  maxExpand: 1000,
  maxSize: 20,
};

function isEscaped(text, index) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function findClosingDelimiter(text, from, close) {
  let index = text.indexOf(close, from);
  while (index !== -1) {
    if (!isEscaped(text, index)) return index;
    index = text.indexOf(close, index + close.length);
  }
  return -1;
}

export function parseMathText(value) {
  const text = value == null ? '' : String(value);
  const tokens = [];
  let plainStart = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const delimiter = DELIMITERS.find(({ open }) =>
      text.startsWith(open, cursor) && !isEscaped(text, cursor)
    );
    if (!delimiter) {
      cursor += 1;
      continue;
    }

    const contentStart = cursor + delimiter.open.length;
    const closingIndex = findClosingDelimiter(text, contentStart, delimiter.close);
    if (closingIndex === -1 || closingIndex === contentStart) {
      cursor += delimiter.open.length;
      continue;
    }

    const mathContent = text.slice(contentStart, closingIndex);
    // A space before the closing single dollar is usually currency/plain text,
    // not a formula (for example: "$5 и $10").
    if (delimiter.open === '$' && mathContent.trim() !== mathContent) {
      cursor += delimiter.open.length;
      continue;
    }

    if (cursor > plainStart) {
      tokens.push({ type: 'text', value: text.slice(plainStart, cursor).replace(/\\\$/g, '$') });
    }
    tokens.push({
      type: 'math',
      value: mathContent,
      raw: text.slice(cursor, closingIndex + delimiter.close.length),
      display: delimiter.display,
    });
    cursor = closingIndex + delimiter.close.length;
    plainStart = cursor;
  }

  if (plainStart < text.length) {
    tokens.push({ type: 'text', value: text.slice(plainStart).replace(/\\\$/g, '$') });
  }
  return tokens.length > 0 ? tokens : [{ type: 'text', value: text.replace(/\\\$/g, '$') }];
}

export function truncateMathText(value, maxLength = 80) {
  const text = value == null ? '' : String(value);
  if (text.length <= maxLength) return text;

  let result = '';
  for (const token of parseMathText(text)) {
    const segment = token.type === 'math' ? token.raw : token.value;
    const remaining = maxLength - result.length;
    if (segment.length <= remaining) {
      result += segment;
      continue;
    }
    if (token.type === 'math' && result.length === 0) result = segment;
    if (token.type === 'text' && remaining > 1) result += segment.slice(0, remaining - 1).trimEnd();
    break;
  }
  return `${result.trimEnd()}…`;
}

function MathToken({ token }) {
  try {
    const html = katex.renderToString(token.value, {
      ...KATEX_OPTIONS,
      displayMode: token.display,
    });
    return (
      <span
        className={token.display ? 'math-text__display' : 'math-text__inline'}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <span className="math-text__invalid" title="Формула записана с ошибкой">
        {token.raw}
      </span>
    );
  }
}

const FORMAT_MARKERS = [
  { marker: '**', tag: 'strong', className: 'math-text__bold' },
  { marker: '++', tag: 'u', className: 'math-text__underline' },
  { marker: '*', tag: 'em', className: 'math-text__italic' },
];

function countMarkers(tokens) {
  return FORMAT_MARKERS.reduce((counts, { marker }) => {
    counts[marker] = tokens
      .filter((token) => token.type === 'text')
      .reduce((total, token) => total + token.value.split(marker).length - 1, 0);
    return counts;
  }, {});
}

function wrapFormatted(content, active, key) {
  const wrapped = FORMAT_MARKERS.reduce((child, { marker, tag: Tag, className }) => (
    active[marker] ? <Tag className={className}>{child}</Tag> : child
  ), content);
  return <React.Fragment key={key}>{wrapped}</React.Fragment>;
}

function renderFormattedTokens(tokens) {
  const remaining = countMarkers(tokens);
  const active = Object.fromEntries(FORMAT_MARKERS.map(({ marker }) => [marker, false]));
  const content = [];
  let key = 0;

  tokens.forEach((token) => {
    if (token.type === 'math') {
      content.push(wrapFormatted(<MathToken token={token} />, active, key++));
      return;
    }

    let cursor = 0;
    while (cursor < token.value.length) {
      const match = FORMAT_MARKERS
        .map((format) => ({ ...format, index: token.value.indexOf(format.marker, cursor) }))
        .filter(({ index }) => index !== -1)
        .sort((a, b) => a.index - b.index || b.marker.length - a.marker.length)[0];

      if (!match) {
        content.push(wrapFormatted(token.value.slice(cursor), active, key++));
        break;
      }
      if (match.index > cursor) {
        content.push(wrapFormatted(token.value.slice(cursor, match.index), active, key++));
      }

      remaining[match.marker] -= 1;
      if (active[match.marker] || remaining[match.marker] > 0) {
        active[match.marker] = !active[match.marker];
      } else {
        content.push(wrapFormatted(match.marker, active, key++));
      }
      cursor = match.index + match.marker.length;
    }
  });

  return content;
}

function MathText({ children, text, as: Element = React.Fragment, className, ...props }) {
  const value = text ?? children ?? '';
  const tokens = parseMathText(value);
  const content = renderFormattedTokens(tokens);

  if (Element === React.Fragment) return <>{content}</>;
  return <Element className={className} {...props}>{content}</Element>;
}

export function LatexHelp({ className = '' }) {
  return (
    <details className={`latex-help ${className}`.trim()}>
      <summary>Формулы LaTeX</summary>
      <div className="latex-help__body">
        <p>Формула в строке: <code>{'$\\frac{a}{b}$'}</code></p>
        <MathText as="div" className="latex-help__preview" text={'Пример: $\\frac{a}{b} + x^2$'} />
        <p>Отдельная формула: <code>{'$$\\sqrt{x^2+y^2}$$'}</code></p>
        <span>Работает в вопросах, вариантах и объяснениях. Обычный текст вводится как раньше.</span>
      </div>
    </details>
  );
}

export default React.memo(MathText);
