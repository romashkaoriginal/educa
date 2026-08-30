const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { loadExcelWorkbook, normaliseExcelHeader } = require('../src/utils/loadExcelWorkbook');

async function makeWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.addRow(['question', 'a', 'b', 'c', 'd', 'correct']);
  sheet.addRow(['2 + 2', '3', '4', '5', '6', 'b']);
  return workbook.xlsx.writeBuffer();
}

async function addSpreadsheetMlPrefix(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const workbookEntry = zip.file('xl/workbook.xml');
  const workbookXml = await workbookEntry.async('string');
  zip.file(
    'xl/workbook.xml',
    workbookXml.replace(/<(\/?)(workbook)(?=[\s>])/g, '<$1x:$2'),
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

test('loads a standard XLSX workbook unchanged', async () => {
  const workbook = await loadExcelWorkbook(await makeWorkbookBuffer());
  assert.equal(workbook.getWorksheet('Questions').getCell('B2').value, '3');
});

test('loads an XLSX workbook whose SpreadsheetML uses the x: namespace prefix', async () => {
  const prefixedBuffer = await addSpreadsheetMlPrefix(await makeWorkbookBuffer());
  const workbook = await loadExcelWorkbook(prefixedBuffer);
  const sheet = workbook.getWorksheet('Questions');

  assert.equal(sheet.getCell('A2').value, '2 + 2');
  assert.equal(sheet.getCell('F2').value, 'b');
});

test('normalises visually identical Cyrillic option headers', () => {
  assert.equal(normaliseExcelHeader('а'), 'a');
  assert.equal(normaliseExcelHeader('с'), 'c');
  assert.equal(normaliseExcelHeader('difficulty'), 'difficulty');
});
