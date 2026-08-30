const { Op } = require('sequelize');

const PRESET_DURATIONS = {
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};
const MAX_RANGE_MS = PRESET_DURATIONS['30d'];

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseErrorLogQuery(query = {}, now = new Date()) {
  const preset = Object.hasOwn(PRESET_DURATIONS, query.preset) ? query.preset : (query.preset === 'custom' ? 'custom' : '24h');
  let from;
  let to = now;

  if (preset === 'custom') {
    from = parseDate(query.from);
    to = parseDate(query.to) || now;
    if (!from) throw new RangeError('Укажите начало произвольного периода');
    if (from >= to) throw new RangeError('Начало периода должно быть раньше окончания');
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new RangeError('Максимальный период просмотра — 30 дней');
    }
  } else {
    from = new Date(now.getTime() - PRESET_DURATIONS[preset]);
  }

  const limit = Math.min(100, Math.max(10, Number.parseInt(query.limit, 10) || 50));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const search = String(query.search || '').trim().slice(0, 120);
  const where = { lastSeenAt: { [Op.between]: [from, to] } };

  for (const key of ['source', 'area', 'userRole', 'severity']) {
    const queryKey = key === 'userRole' ? 'role' : key;
    const value = String(query[queryKey] || '').trim();
    if (value && /^[a-z0-9_-]{1,64}$/i.test(value)) where[key] = value;
  }

  if (search) {
    const pattern = `%${search}%`;
    where[Op.or] = ['message', 'code', 'userName', 'entityName', 'path']
      .map((field) => ({ [field]: { [Op.iLike]: pattern } }));
  }

  return {
    preset,
    from,
    to,
    limit,
    page,
    offset: (page - 1) * limit,
    search,
    where
  };
}

module.exports = { MAX_RANGE_MS, PRESET_DURATIONS, parseErrorLogQuery };
