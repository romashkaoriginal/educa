// Генерация 5 Excel-файлов с темами практики по главе
// «Тригонометрические уравнения и формулы» (учебник «Алгебра, 10», §§7–12).
// Формат строго под importQuestionsFromExcel: question,a,b,c,d,correct,difficulty,explanation.
// Каждый вопрос проверяется лимитом строк (≤8) — файл не сохранится, если есть превышение.

const path = require('path');
const ExcelJS = require('exceljs');
const { checkQuestionLines, MAX_TOTAL_LINES } = require('../src/utils/questionLines');

const OUT_DIR = path.resolve(__dirname, '..', '..'); // корень проекта

// difficulty: easy | medium | hard. correct: a|b|c|d
// Темы по 15-20 вопросов с разным объёмом текста и сложностью.

const themes = [
  {
    file: 'trig-01-arcfunctions.xlsx',
    title: 'Арксинус, арккосинус, арктангенс (§7)',
    rows: [
      // q, a, b, c, d, correct, difficulty, explanation
      ['arcsin(1/2) = ?', 'π/6', 'π/3', 'π/4', 'π/2', 'a', 'easy', 'sin(π/6)=1/2, π/6 ∈ [−π/2; π/2]'],
      ['arcsin(√2/2) = ?', 'π/3', 'π/4', 'π/6', 'π/2', 'b', 'easy', 'sin(π/4)=√2/2'],
      ['arcsin(1) = ?', '0', 'π/2', 'π', 'π/4', 'b', 'easy', 'sin(π/2)=1'],
      ['arcsin(0) = ?', '0', 'π', 'π/2', '2π', 'a', 'easy', 'sin0=0'],
      ['arccos(1/2) = ?', 'π/6', 'π/3', 'π/4', '2π/3', 'b', 'easy', 'cos(π/3)=1/2'],
      ['arccos(√3/2) = ?', 'π/6', 'π/4', 'π/3', 'π/2', 'a', 'easy', 'cos(π/6)=√3/2'],
      ['arccos(0) = ?', '0', 'π', 'π/2', 'π/4', 'c', 'easy', 'cos(π/2)=0'],
      ['arccos(1) = ?', '0', 'π/2', 'π', 'π/4', 'a', 'easy', 'cos0=1'],
      ['arctg(1) = ?', 'π/6', 'π/4', 'π/3', 'π/2', 'b', 'easy', 'tg(π/4)=1'],
      ['arctg(√3) = ?', 'π/6', 'π/4', 'π/3', 'π/2', 'c', 'medium', 'tg(π/3)=√3'],
      ['arctg(0) = ?', '0', 'π/4', 'π/2', 'π', 'a', 'easy', 'tg0=0'],
      ['Вычислите arcsin(−1/2).', 'π/6', '−π/6', '5π/6', '−π/3', 'b', 'medium', 'arcsin(−a)=−arcsin a, arcsin(1/2)=π/6'],
      ['Вычислите arccos(−1/2).', 'π/3', '2π/3', '−π/3', '5π/6', 'b', 'medium', 'arccos(−a)=π−arccos a = π−π/3'],
      ['Вычислите arctg(−1).', 'π/4', '−π/4', '3π/4', '−3π/4', 'b', 'medium', 'arctg(−a)=−arctg a = −π/4'],
      ['Имеет ли смысл выражение arcsin(3)?', 'да, =3', 'да, =π', 'нет, 3 не в [−1;1]', 'да, =π/2', 'c', 'medium', 'Область определения arcsin — отрезок [−1; 1]'],
      ['Найдите sin(arcsin(0,4)).', '0', '0,4', '−0,4', 'не существует', 'b', 'medium', 'sin(arcsin a)=a при a ∈ [−1; 1]'],
      ['Найдите cos(arccos(−0,7)).', '0,7', '−0,7', '0', 'нет смысла', 'b', 'medium', 'cos(arccos a)=a при a ∈ [−1; 1]'],
      ['Вычислите arccos(−1) + arcsin(−1).', '0', 'π/2', 'π/2', '−π/2', 'b', 'hard', 'arccos(−1)=π, arcsin(−1)=−π/2; π−π/2=π/2'],
      ['Чему равно arctg(√3) + arcctg(√3)?', 'π/6', 'π/3', 'π/2', 'π', 'c', 'hard', 'arctg(√3)=π/3, arcctg(√3)=π/6; сумма π/2'],
      ['Какому промежутку принадлежит arccos a?', '(−π/2; π/2)', '[0; π]', '[−π/2; π/2]', '(0; π)', 'b', 'hard', 'По определению arccos a ∈ [0; π]'],
    ],
  },
  {
    file: 'trig-02-simple-equations.xlsx',
    title: 'Простейшие тригонометрические уравнения (§8)',
    rows: [
      ['Сколько корней у уравнения sin x = 2?', 'один', 'два', 'бесконечно', 'нет корней', 'd', 'easy', 'Множество значений синуса [−1;1], 2 вне его'],
      ['Решите sin x = 0.', 'x=πn', 'x=π/2+πn', 'x=2πn', 'x=π+2πn', 'a', 'easy', 'sin x=0 при x=πn, n∈Z'],
      ['Решите cos x = 0.', 'x=πn', 'x=π/2+πn', 'x=2πn', 'x=π/2+2πn', 'b', 'easy', 'cos x=0 при x=π/2+πn, n∈Z'],
      ['Решите sin x = 1.', 'x=πn', 'x=π/2+2πn', 'x=−π/2+2πn', 'x=2πn', 'b', 'easy', 'sin x=1 при x=π/2+2πn'],
      ['Решите cos x = 1.', 'x=2πn', 'x=πn', 'x=π+2πn', 'x=π/2+πn', 'a', 'easy', 'cos x=1 при x=2πn'],
      ['Решите cos x = −1.', 'x=2πn', 'x=πn', 'x=π+2πn', 'x=−π/2+2πn', 'c', 'easy', 'cos x=−1 при x=π+2πn'],
      ['Решите sin x = −1.', 'x=π/2+2πn', 'x=−π/2+2πn', 'x=πn', 'x=π+2πn', 'b', 'easy', 'sin x=−1 при x=−π/2+2πn'],
      ['Решите tg x = 0.', 'x=πn', 'x=π/2+πn', 'x=2πn', 'x=π/4+πn', 'a', 'easy', 'tg x=0 при x=πn'],
      ['Имеет ли корни cos x = 1,5?', 'один', 'два', 'нет корней', 'бесконечно', 'c', 'easy', '|1,5|>1, корней нет'],
      ['Формула корней sin x = a (|a|<1).', 'x=arcsin a+2πn', 'x=±arcsin a+πn', 'x=(−1)ⁿ arcsin a+πn', 'x=±arcsin a+2πn', 'c', 'medium', 'Корни синуса: (−1)ⁿ·arcsin a+πn'],
      ['Формула корней cos x = a (|a|<1).', 'x=(−1)ⁿ arccos a+πn', 'x=±arccos a+2πn', 'x=arccos a+πn', 'x=±arccos a+πn', 'b', 'medium', 'Корни косинуса: ±arccos a+2πn'],
      ['Формула корней tg x = a.', 'x=arctg a+2πn', 'x=±arctg a+πn', 'x=arctg a+πn', 'x=(−1)ⁿ arctg a+πn', 'c', 'medium', 'Корни тангенса: arctg a+πn'],
      ['Решите sin x = 1/2.', 'x=π/6+2πn', 'x=(−1)ⁿ·π/6+πn', 'x=±π/6+2πn', 'x=π/6+πn', 'b', 'medium', 'a=1/2: x=(−1)ⁿ·arcsin(1/2)+πn'],
      ['Решите cos x = 1/2.', 'x=±π/3+2πn', 'x=π/3+πn', 'x=(−1)ⁿ·π/3+πn', 'x=±π/6+2πn', 'a', 'medium', 'a=1/2: x=±arccos(1/2)+2πn=±π/3+2πn'],
      ['Решите tg x = 1.', 'x=π/4+2πn', 'x=±π/4+πn', 'x=π/4+πn', 'x=(−1)ⁿ·π/4+πn', 'c', 'medium', 'a=1: x=arctg1+πn=π/4+πn'],
      ['Решите cos x = −√2/2.', 'x=±π/4+2πn', 'x=±3π/4+2πn', 'x=3π/4+πn', 'x=±π/4+πn', 'b', 'hard', 'arccos(−√2/2)=3π/4, корни ±3π/4+2πn'],
      ['Решите sin x = −√3/2.', 'x=(−1)ⁿ·π/3+πn', 'x=(−1)ⁿ·(−π/3)+πn', 'x=±π/3+2πn', 'x=−π/3+2πn', 'b', 'hard', 'arcsin(−√3/2)=−π/3; (−1)ⁿ·(−π/3)+πn'],
      ['Решите 2cos²x − cos x − 1 = 0.', 'cos x=1 или −1/2', 'cos x=1/2', 'cos x=−1', 'нет корней', 'a', 'hard', 'Замена t=cos x: 2t²−t−1=0, t=1 или t=−1/2'],
    ],
  },
  {
    file: 'trig-03-reduction.xlsx',
    title: 'Формулы приведения (§9)',
    rows: [
      ['Чему равно sin(π/2 − α)?', 'cos α', 'sin α', '−cos α', '−sin α', 'a', 'easy', 'sin(π/2−α)=cos α'],
      ['Чему равно cos(π/2 − α)?', 'cos α', 'sin α', '−sin α', '−cos α', 'b', 'easy', 'cos(π/2−α)=sin α'],
      ['Чему равно sin(π − α)?', 'sin α', '−sin α', 'cos α', '−cos α', 'a', 'easy', 'sin(π−α)=sin α'],
      ['Чему равно cos(π − α)?', 'cos α', '−cos α', 'sin α', '−sin α', 'b', 'easy', 'cos(π−α)=−cos α'],
      ['Чему равно sin(π + α)?', 'sin α', '−sin α', 'cos α', '−cos α', 'b', 'easy', 'sin(π+α)=−sin α'],
      ['Чему равно cos(π + α)?', 'cos α', '−cos α', '−sin α', 'sin α', 'b', 'easy', 'cos(π+α)=−cos α'],
      ['Чему равно tg(π + α)?', 'tg α', '−tg α', 'ctg α', '−ctg α', 'a', 'easy', 'tg(π+α)=tg α (период π)'],
      ['Чему равно cos(2π − α)?', 'cos α', '−cos α', 'sin α', '−sin α', 'a', 'easy', 'cos(2π−α)=cos α'],
      ['Чему равно sin(2π − α)?', 'sin α', '−sin α', 'cos α', '−cos α', 'b', 'easy', 'sin(2π−α)=−sin α'],
      ['Чему равно tg(π/2 − α)?', 'tg α', 'ctg α', '−ctg α', '−tg α', 'b', 'medium', 'tg(π/2−α)=ctg α'],
      ['Меняется ли название функции при аргументе π ± α?', 'да', 'нет', 'только у тангенса', 'зависит', 'b', 'medium', 'При π±α и 2π±α название не меняется'],
      ['Меняется ли название функции при π/2 ± α?', 'нет', 'да', 'только у синуса', 'зависит', 'b', 'medium', 'При π/2±α и 3π/2±α название меняется'],
      ['Вычислите sin 120°.', '1/2', '√3/2', '−√3/2', '√2/2', 'b', 'medium', 'sin120°=sin(180°−60°)=sin60°=√3/2'],
      ['Вычислите cos 240°.', '1/2', '−1/2', '√3/2', '−√3/2', 'b', 'medium', 'cos240°=cos(180°+60°)=−cos60°=−1/2'],
      ['Вычислите tg 330°.', '√3/3', '−√3/3', '√3', '−√3', 'b', 'medium', 'tg330°=tg(360°−30°)=−tg30°=−√3/3'],
      ['Приведите sin(3π/2 + α) к функции α.', 'cos α', '−cos α', 'sin α', '−sin α', 'b', 'hard', '3π/2+α — IV четверть, синус<0, имя меняется: −cos α'],
      ['Приведите cos(3π/2 − α) к функции α.', 'sin α', '−sin α', 'cos α', '−cos α', 'b', 'hard', 'III четверть, косинус<0, имя меняется: −sin α'],
      ['Упростите sin(π/2−α)+cos(π−α).', '2cos α', '0', '2sin α', 'cos α−sin α', 'b', 'hard', 'cos α + (−cos α) = 0'],
    ],
  },
  {
    file: 'trig-04-addition-double.xlsx',
    title: 'Формулы сложения и двойного аргумента (§10–11)',
    rows: [
      ['Формула sin(α+β).', 'sinα cosβ+cosα sinβ', 'sinα cosβ−cosα sinβ', 'cosα cosβ−sinα sinβ', 'cosα cosβ+sinα sinβ', 'a', 'medium', 'Синус суммы: sinα cosβ+cosα sinβ'],
      ['Формула sin(α−β).', 'sinα cosβ+cosα sinβ', 'sinα cosβ−cosα sinβ', 'cosα cosβ−sinα sinβ', 'cosα cosβ+sinα sinβ', 'b', 'medium', 'Синус разности: sinα cosβ−cosα sinβ'],
      ['Формула cos(α+β).', 'cosα cosβ+sinα sinβ', 'cosα cosβ−sinα sinβ', 'sinα cosβ+cosα sinβ', 'sinα sinβ−cosα cosβ', 'b', 'medium', 'Косинус суммы: cosα cosβ−sinα sinβ'],
      ['Формула cos(α−β).', 'cosα cosβ+sinα sinβ', 'cosα cosβ−sinα sinβ', 'sinα cosβ−cosα sinβ', 'sinα sinβ−cosα cosβ', 'a', 'medium', 'Косинус разности: cosα cosβ+sinα sinβ'],
      ['Формула sin 2α.', '2sinα cosα', 'sin²α−cos²α', 'cos²α−sin²α', '2cosα', 'a', 'easy', 'sin2α=2sinα cosα'],
      ['Формула cos 2α.', '2cosα', 'cos²α−sin²α', '2sinα cosα', 'sin²α−cos²α', 'b', 'easy', 'cos2α=cos²α−sin²α'],
      ['Формула tg 2α.', '2tgα', '2tgα/(1−tg²α)', 'tgα/(1+tg²α)', '(1−tg²α)/2tgα', 'b', 'medium', 'tg2α=2tgα/(1−tg²α)'],
      ['Вычислите sin 75°.', '(√6−√2)/4', '(√6+√2)/4', '√2/2', '√3/2', 'b', 'medium', 'sin75°=sin(45°+30°)=(√6+√2)/4'],
      ['Вычислите cos 15°.', '(√6−√2)/4', '(√6+√2)/4', '√2/2', '1/2', 'b', 'medium', 'cos15°=cos(45°−30°)=(√6+√2)/4'],
      ['Упростите sin α cos α.', 'sin 2α', '(1/2)sin 2α', 'cos 2α', '2sin 2α', 'b', 'medium', '2sinα cosα=sin2α ⇒ sinα cosα=(1/2)sin2α'],
      ['Упростите cos²α − sin²α.', 'sin 2α', 'cos 2α', '1', '2cos α', 'b', 'easy', 'cos²α−sin²α=cos2α'],
      ['Упростите 2sin α cos α − sin 2α.', '0', 'sin 2α', '2sin 2α', 'cos 2α', 'a', 'medium', '2sinα cosα=sin2α, разность 0'],
      ['Найдите sin 2α, если sin α=0,6, cos α=0,8.', '0,48', '0,96', '0,6', '1,2', 'b', 'medium', 'sin2α=2·0,6·0,8=0,96'],
      ['Упростите 1 − 2sin²α.', 'cos 2α', 'sin 2α', '2cos²α', '−cos 2α', 'a', 'medium', 'cos2α=1−2sin²α'],
      ['Упростите 2cos²α − 1.', 'sin 2α', 'cos 2α', '−cos 2α', '2sin²α', 'b', 'medium', 'cos2α=2cos²α−1'],
      ['Вычислите 2sin15° cos15°.', '1/4', '1/2', '√3/2', '√2/2', 'b', 'medium', '2sin15°cos15°=sin30°=1/2'],
      ['Вычислите cos²15° − sin²15°.', '1/2', '√3/2', '√2/2', '1', 'b', 'hard', 'cos²15°−sin²15°=cos30°=√3/2'],
      ['Вычислите tg 2α, если tg α = 2.', '4/3', '−4/3', '4', '−4', 'b', 'hard', 'tg2α=2·2/(1−4)=4/(−3)=−4/3'],
    ],
  },
  {
    file: 'trig-05-sum-to-product.xlsx',
    title: 'Преобразование суммы и разности в произведение (§12)',
    rows: [
      ['Формула sin x + sin y.', '2 sin((x+y)/2) cos((x−y)/2)', '2 cos((x+y)/2) cos((x−y)/2)', '2 sin((x−y)/2) cos((x+y)/2)', '−2 sin((x+y)/2) sin((x−y)/2)', 'a', 'medium', 'Сумма синусов в произведение'],
      ['Формула sin x − sin y.', '2 sin((x+y)/2) cos((x−y)/2)', '2 sin((x−y)/2) cos((x+y)/2)', '2 cos((x+y)/2) cos((x−y)/2)', '−2 sin((x+y)/2) sin((x−y)/2)', 'b', 'medium', 'Разность синусов'],
      ['Формула cos x + cos y.', '2 cos((x+y)/2) cos((x−y)/2)', '2 sin((x+y)/2) cos((x−y)/2)', '−2 sin((x+y)/2) sin((x−y)/2)', '2 cos((x−y)/2) sin((x+y)/2)', 'a', 'medium', 'Сумма косинусов'],
      ['Формула cos x − cos y.', '2 cos((x+y)/2) cos((x−y)/2)', '−2 sin((x+y)/2) sin((x−y)/2)', '2 sin((x+y)/2) cos((x−y)/2)', '2 sin((x−y)/2) sin((x+y)/2)', 'b', 'medium', 'Разность косинусов (со знаком минус)'],
      ['Преобразуйте cos5α + cos3α.', '2 cos4α cos α', '2 sin4α cos α', '2 cos4α sin α', '−2 sin4α sin α', 'a', 'medium', '(5+3)/2=4, (5−3)/2=1 ⇒ 2cos4α cosα'],
      ['Преобразуйте sin4α − sin10α.', '2 sin3α cos7α', '−2 sin3α cos7α', '2 cos7α sin3α', '2 sin7α cos3α', 'b', 'hard', '(4−10)/2=−3α ⇒ 2sin(−3α)cos7α=−2sin3α cos7α'],
      ['Преобразуйте sin7x + sin3x.', '2 sin5x cos2x', '2 cos5x cos2x', '2 sin2x cos5x', '−2 sin5x sin2x', 'a', 'medium', '(7+3)/2=5x, (7−3)/2=2x'],
      ['Преобразуйте cos7x − cos3x.', '2 cos5x cos2x', '−2 sin5x sin2x', '2 sin5x cos2x', '−2 sin2x sin5x', 'b', 'medium', 'Разность косинусов: −2 sin5x sin2x'],
      ['Вычислите sin15° + sin105°.', '√2/2', '√6/2', '√3/2', '1', 'b', 'hard', '2sin60°cos45°=2·(√3/2)·(√2/2)=√6/2'],
      ['Вычислите cos75° + cos15°.', '√6/2', '√2/2', '√3/2', '1', 'a', 'hard', '2cos45°cos30°=2·(√2/2)·(√3/2)=√6/2'],
      ['Сократите (sin α+sin β)/(cos α+cos β).', 'tg((α+β)/2)', 'ctg((α+β)/2)', 'tg((α−β)/2)', '1', 'a', 'hard', 'Отношение даёт tg((α+β)/2)'],
      ['Решите sin x + sin 5x = 0 (вид корней).', 'x=πn/3 и x=π/4+πk/2', 'x=πn', 'x=π/2+πn', 'нет корней', 'a', 'hard', '2sin3x cos2x=0 ⇒ sin3x=0 или cos2x=0'],
      ['Преобразуйте sin α + sin 3α.', '2 sin2α cos α', '2 cos2α cos α', '2 sin2α sin α', '−2 sin2α cos α', 'a', 'medium', '(α+3α)/2=2α, (α−3α)/2=−α ⇒ 2sin2α cosα'],
      ['Преобразуйте cos α − cos 4α.', '−2 sin2,5α sin1,5α', '2 sin2,5α sin1,5α', '2 cos2,5α cos1,5α', '−2 cos2,5α sin1,5α', 'b', 'hard', '−2 sin((α+4α)/2) sin((α−4α)/2)=2sin2,5α sin1,5α'],
      ['Чему равно cos x + cos y при x=y?', '2cos x', '0', '2sin x', 'cos 2x', 'a', 'easy', 'При x=y: 2cos x·cos0=2cos x'],
      ['Чему равно sin x − sin y при x=y?', '2sin x', '0', '1', '2cos x', 'b', 'easy', 'При x=y разность 0'],
    ],
  },
];

(async () => {
  let totalRows = 0;
  let anyError = false;

  for (const theme of themes) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Questions');
    ws.addRow(['question', 'a', 'b', 'c', 'd', 'correct', 'difficulty', 'explanation']);

    theme.rows.forEach((r, i) => {
      const [q, a, b, c, d, correct, diff, expl] = r;
      const lc = checkQuestionLines(q, [a, b, c, d]);
      const tag = lc.ok ? 'OK ' : 'OVER';
      if (!lc.ok) {
        anyError = true;
        console.log(`  [${tag}] ${theme.file} строка ${i + 2}: ${lc.lines}/${MAX_TOTAL_LINES} — "${q}"`);
      }
      ws.addRow([q, a, b, c, d, correct, diff, expl]);
    });

    const outPath = path.join(OUT_DIR, theme.file);
    await wb.xlsx.writeFile(outPath);
    totalRows += theme.rows.length;
    console.log(`Создан ${theme.file} (${theme.rows.length} вопросов) — «${theme.title}»`);
  }

  console.log(`\nИтого: ${themes.length} тем, ${totalRows} вопросов.`);
  console.log(anyError ? 'ВНИМАНИЕ: есть вопросы сверх лимита (см. выше).' : 'Все вопросы в пределах лимита 8 строк.');
})();
