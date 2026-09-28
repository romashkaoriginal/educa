// Keep the link to the source column when empty options are omitted.
function excelChoiceOptions(row, letters = ['a', 'b', 'c', 'd']) {
  const options = [];
  const indexes = Object.create(null);
  for (const letter of letters) {
    const text = String(row[letter] ?? '').trim();
    if (!text) continue;
    indexes[letter] = options.length;
    options.push(text);
  }
  return { options, indexes };
}

module.exports = { excelChoiceOptions };
