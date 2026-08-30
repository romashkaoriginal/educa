const ExcelJS = require('exceljs');
const JSZip = require('jszip');

// Some XLSX exporters put the SpreadsheetML namespace in the `x:` prefix
// (for example `<x:workbook>`). The files are valid ZIP archives and open in
// Excel, but ExcelJS only recognises unprefixed SpreadsheetML element names.
async function normaliseSpreadsheetMlPrefixes(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const workbookEntry = zip.file('xl/workbook.xml');
    if (!workbookEntry) return null;

    const workbookXml = await workbookEntry.async('string');
    if (!/<x:workbook(?:\s|>)/.test(workbookXml)) return null;

    const xmlEntries = Object.keys(zip.files)
      .filter((entryName) => entryName.startsWith('xl/') && entryName.endsWith('.xml'));

    await Promise.all(xmlEntries.map(async (entryName) => {
      const entry = zip.file(entryName);
      if (!entry) return;
      const xml = await entry.async('string');
      zip.file(entryName, xml.replace(/(<\/?)(?:x:)/g, '$1'));
    }));

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (_) {
    // Let ExcelJS report its original parsing error for non-XLSX files or
    // files whose structure cannot be normalised safely.
    return null;
  }
}

async function loadExcelWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
    return workbook;
  } catch (error) {
    const normalisedBuffer = await normaliseSpreadsheetMlPrefixes(buffer);
    if (!normalisedBuffer) throw error;

    const normalisedWorkbook = new ExcelJS.Workbook();
    await normalisedWorkbook.xlsx.load(normalisedBuffer);
    return normalisedWorkbook;
  }
}

function normaliseExcelHeader(value) {
  const header = String(value ?? '').trim().toLowerCase();
  const aliases = { а: 'a', с: 'c' };
  return aliases[header] || header;
}

module.exports = { loadExcelWorkbook, normaliseExcelHeader };
