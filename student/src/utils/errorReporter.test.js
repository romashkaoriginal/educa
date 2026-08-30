import { extractRequestContext, inferRequest, sanitizeContext } from './errorReporter';

describe('errorReporter', () => {
  test('не включает ответы и секреты в контекст отчёта', () => {
    const context = extractRequestContext(JSON.stringify({
      homeworkId: 17,
      title: 'Алгебра',
      answers: [{ questionId: 2, answer: '42' }],
      token: 'secret'
    }));

    expect(context).toEqual({ homeworkId: 17, title: 'Алгебра' });
    expect(sanitizeContext({ selectedAnswer: 2, subjectId: 4 })).toEqual({
      selectedAnswer: '[СКРЫТО]',
      subjectId: 4
    });
  });

  test('определяет место и действие по URL', () => {
    expect(inferRequest('https://kubik-ct.online/api/practice/answer?mode=exam', 'POST')).toEqual({
      area: 'practice',
      action: 'submit',
      path: '/api/practice/answer',
      method: 'POST'
    });
  });
});
