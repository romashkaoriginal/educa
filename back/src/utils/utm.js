function flatToQuery(raw) {
  if (!raw.includes('__') && !/^utm_[a-z]+-/.test(raw)) return null;
  const pairs = raw.split('__').map((pair) => {
    const dash = pair.indexOf('-');
    if (dash === -1) return null;
    const key = pair.slice(0, dash);
    const value = pair.slice(dash + 1);
    if (!/^utm_[a-z]+$/.test(key)) return null;
    return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }).filter(Boolean);
  return pairs.length ? pairs.join('&') : null;
}

function parseUtm(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const trimmed = raw.trim().replace(/^\?/, '');
    const normalized = flatToQuery(trimmed) || trimmed.replace(/\s/g, '&');
    if (!normalized) return null;
    const params = new URLSearchParams(normalized);
    const source = params.get('utm_source');
    const medium = params.get('utm_medium');
    const campaign = params.get('utm_campaign');
    const content = params.get('utm_content');
    const term = params.get('utm_term');
    if (!source && !medium && !campaign) return null;
    return {
      utmSource: source,
      utmMedium: medium,
      utmCampaign: campaign,
      utmContent: content,
      utmTerm: term,
      utmRaw: normalized,
    };
  } catch {
    return null;
  }
}

function utmToFields(utm) {
  if (!utm?.utmSource) return {};
  return {
    utmSource: utm.utmSource,
    utmMedium: utm.utmMedium || null,
    utmCampaign: utm.utmCampaign || null,
    utmContent: utm.utmContent || null,
    utmTerm: utm.utmTerm || null,
    utmRaw: utm.utmRaw || null,
  };
}

module.exports = { parseUtm, utmToFields };
