import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import MathText, { parseMathText } from './MathText';

test('обычный текст остаётся обычным текстом', () => {
  const { container } = render(<p><MathText text="Обычный вопрос без формулы" /></p>);
  expect(screen.getByText('Обычный вопрос без формулы')).toBeInTheDocument();
  expect(container.querySelector('.katex')).toBeNull();
});

test('рендерит строчную и отдельную формулу', () => {
  const { container } = render(
    <MathText as="div" text={'Дробь $\\frac{1}{2}$\n$$x^2 + y^2$$'} />
  );
  expect(container.querySelector('.math-text__inline .katex')).toBeInTheDocument();
  expect(container.querySelector('.math-text__display .katex-display')).toBeInTheDocument();
});

test('не разрешает LaTeX создавать ссылки или внешний HTML', () => {
  const { container } = render(
    <MathText as="div" text={'$\\href{javascript:alert(1)}{нажми}$'} />
  );
  expect(container.querySelector('a')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
});

test('незакрытый разделитель не ломает обычный текст', () => {
  expect(parseMathText('Цена $100 и обычный текст')).toEqual([
    { type: 'text', value: 'Цена $100 и обычный текст' },
  ]);
});

test('текст с ценами не принимается за формулу', () => {
  const { container } = render(<MathText as="div" text="Цена $5 и $10 за комплект" />);
  expect(container).toHaveTextContent('Цена $5 и $10 за комплект');
  expect(container.querySelector('.katex')).toBeNull();
});

test('рендерит жирный, курсивный и подчёркнутый текст', () => {
  const { container } = render(
    <MathText as="div" text="**Жирный** *курсив* ++подчёркнутый++" />
  );
  expect(container.querySelector('strong')).toHaveTextContent('Жирный');
  expect(container.querySelector('strong')).toHaveClass('math-text__bold');
  expect(container.querySelector('em')).toHaveTextContent('курсив');
  expect(container.querySelector('u')).toHaveTextContent('подчёркнутый');
});

test('форматирует LaTeX целиком, не разбирая символы внутри формулы', () => {
  const { container } = render(<MathText as="div" text={'**$x^* + y^2$**'} />);
  expect(container.querySelector('strong .katex')).toBeInTheDocument();
});

test('не скрывает одиночные маркеры форматирования', () => {
  const { container } = render(<MathText as="div" text="2 * 3 и C++" />);
  expect(container).toHaveTextContent('2 * 3 и C++');
});
