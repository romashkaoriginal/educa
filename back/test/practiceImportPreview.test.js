const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ExcelJS = require('exceljs');

const controllerPath = require.resolve('../src/controllers/practiceController');
const originalLoad = Module._load;

function loadController({ findTopic, bulkCreate }) {
  Module._load = function mockPracticeDependencies(request, parent, isMain) {
    if (parent?.filename !== controllerPath) {
      return originalLoad.call(this, request, parent, isMain);
    }

    if (request === '../models') {
      return {
        PracticeTopic: { findByPk: findTopic },
        PracticeQuestion: { bulkCreate },
      };
    }
    if (request === 'sequelize') return { Op: {} };
    if (request === '../config/database') return {};
    if (request === '../services/practiceImages') return {};
    if (request === '../services/predictedScore') return {};
    if (request === '../services/homeworkScore') return {};
    if (request === '../services/practiceDashboard') return {};
    if (request === '../services/practiceStatsAggregate') return {};
    if (request === '../services/streamPresentation') return {};

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[controllerPath];
  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

async function workbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.addRow(['question', 'a', 'b', 'c', 'd', 'correct']);
  sheet.addRow(['2 + 2', '3', '4', '5', '6', 'b']);
  sheet.addRow(['', '3', '4', '5', '6', 'b']);
  return workbook.xlsx.writeBuffer();
}

test.afterEach(() => {
  Module._load = originalLoad;
  delete require.cache[controllerPath];
});

test('предпросмотр Excel-импорта сообщает число готовых вопросов и не записывает их', async () => {
  let created = false;
  const controller = loadController({
    findTopic: async () => ({ id: 42 }),
    bulkCreate: async () => { created = true; },
  });
  let payload = null;

  await controller.importQuestionsFromExcel(
    {
      params: { topicId: '42' },
      query: { preview: 'true' },
      file: { buffer: await workbookBuffer() },
    },
    { json: (body) => { payload = body; } },
  );

  assert.deepEqual(payload, {
    ready: 1,
    skipped: 1,
    errors: [{ row: 3, reason: 'пустой вопрос' }],
  });
  assert.equal(created, false);
});
