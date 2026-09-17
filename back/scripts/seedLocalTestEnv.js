#!/usr/bin/env node
/**
 * Засеивает изолированную локальную тестовую БД (см. back/.env.localtest и
 * .local-test-env/) данными для проверки живой викторины: предмет, учитель,
 * N учеников с доступом к предмету, идущее занятие, викторина с вопросами.
 *
 * НЕ трогает прод и dev — работает только с DATABASE_URL из окружения, в
 * которое запущен процесс. Запускать так:
 *
 *   cd back
 *   node -r dotenv/config scripts/seedLocalTestEnv.js dotenv_config_path=.env.localtest
 *
 * или проще — через npm-скрипт test:seed (см. package.json).
 *
 * Печатает переменные окружения для scripts/quizLoadTest.js в конце.
 */
require('dotenv').config({ path: process.env.ENV_FILE || '.env.localtest' });

const crypto = require('crypto');

// Явная защита: этот скрипт пишет тестовые данные и НЕ должен уметь коснуться
// прод/dev базы, даже если .env.localtest случайно не подхватился.
const dbUrl = process.env.DATABASE_URL || '';
if (!/localhost|127\.0\.0\.1/.test(dbUrl) || /kubik-ct\.online|93\.125\.82\.173|87\.232\.67\.145/.test(dbUrl)) {
  console.error('DATABASE_URL не похож на локальную тестовую БД. Останавливаюсь.');
  console.error('DATABASE_URL =', dbUrl);
  process.exit(1);
}

const {
  sequelize, User, Subject, UserSubject, TeacherSubject, Lesson, LessonQuiz, LessonQuizQuestion
} = require('../src/models');

const STUDENT_COUNT = Number(process.argv[2] || 50);
const QUESTION_COUNT = Number(process.argv[3] || 10);

function telegramIdFor(seedTag, index) {
  // Диапазон, который не пересечётся с реальными telegram id и с прошлыми
  // прогонами seed — каждый тег (teacher/student) в своей полосе.
  const base = seedTag === 'teacher' ? 900000000 : 910000000;
  return base + index;
}

async function upsertUser({ telegramId, firstName, lastName = null, role }) {
  const [user] = await User.findOrCreate({
    where: { telegramId },
    defaults: { telegramId, firstName, lastName, role, isActive: true }
  });
  if (user.role !== role || user.firstName !== firstName) {
    await user.update({ role, firstName, lastName, isActive: true });
  }
  return user;
}

async function main() {
  await sequelize.authenticate();
  console.log('Подключение к тестовой БД установлено:', dbUrl);

  const [subject] = await Subject.findOrCreate({
    where: { name: 'Локальный тест: Математика' },
    defaults: { name: 'Локальный тест: Математика', icon: '🧪' }
  });

  const teacher = await upsertUser({
    telegramId: telegramIdFor('teacher', 1),
    firstName: 'Тест-Учитель',
    role: 'teacher'
  });
  await TeacherSubject.findOrCreate({ where: { teacherId: teacher.id, subjectId: subject.id } });

  const students = [];
  for (let i = 1; i <= STUDENT_COUNT; i += 1) {
    const student = await upsertUser({
      telegramId: telegramIdFor('student', i),
      firstName: `Ученик${i}`,
      role: 'student'
    });
    await UserSubject.findOrCreate({
      where: { userId: student.id, subjectId: subject.id },
      defaults: { userId: student.id, subjectId: subject.id, isActive: true }
    });
    students.push(student);
  }

  // Предыдущее незакрытое занятие того же предмета мешало бы (сервер не даёт
  // запустить вторую викторину поверх активной) — гасим перед созданием.
  await Lesson.update(
    { status: 'finished', finishedAt: new Date() },
    { where: { subjectId: subject.id, status: 'live' } }
  );

  const lesson = await Lesson.create({
    subjectId: subject.id,
    teacherId: teacher.id,
    topic: 'Нагрузочный прогон викторины',
    scheduledAt: new Date(),
    status: 'live',
    fromSchedule: false,
    startedAt: new Date(),
    sessionEndsAt: new Date(Date.now() + 4 * 60 * 60 * 1000)
  });

  const quiz = await LessonQuiz.create({
    lessonId: lesson.id,
    title: 'Нагрузочная викторина',
    mode: 'single_step',
    status: 'draft',
    createdBy: teacher.id
  });

  const questions = [];
  for (let i = 0; i < QUESTION_COUNT; i += 1) {
    questions.push(await LessonQuizQuestion.create({
      lessonQuizId: quiz.id,
      questionText: `Тестовый вопрос ${i + 1}: сколько будет 2 + 2?`,
      options: ['3', '4', '5', '6'],
      correctAnswer: [1],
      timeLimit: 20,
      order: i
    }));
  }

  console.log('\n—— Готово ——');
  console.log(`Предмет:    ${subject.id} (${subject.name})`);
  console.log(`Учитель:    userId=${teacher.id} telegramId=${teacher.telegramId}`);
  console.log(`Учеников:   ${students.length}`);
  console.log(`Занятие:    id=${lesson.id} (live)`);
  console.log(`Викторина:  id=${quiz.id}, вопросов=${questions.length}`);

  console.log('\n—— Переменные для scripts/quizLoadTest.js ——');
  console.log(`$env:LOAD_TEST_URL = "http://localhost:${process.env.PORT || 5057}"`);
  console.log(`$env:LOAD_TEST_BOT_TOKEN = "${process.env.BOT_TOKEN}"`);
  console.log(`$env:LOAD_TEST_LESSON_ID = "${lesson.id}"`);
  console.log(`$env:LOAD_TEST_QUIZ_ID = "${quiz.id}"`);
  console.log(`$env:LOAD_TEST_TEACHER_ID = "${teacher.telegramId}"`);
  console.log(`$env:LOAD_TEST_STUDENT_IDS = "${students.map((s) => s.telegramId).join(',')}"`);

  await sequelize.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
