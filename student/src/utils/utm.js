const UTM_STORAGE_KEY = 'kubik_utm';

function flatToQuery(raw) {
  if (!raw.includes('__') && !/^utm_[a-z]+-/.test(raw)) return null;
  const pairs = String(raw).split('__').map((pair) => {
    const dash = pair.indexOf('-');
    if (dash === -1) return null;
    const key = pair.slice(0, dash);
    const value = pair.slice(dash + 1);
    if (!/^utm_[a-z]+$/.test(key)) return null;
    return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }).filter(Boolean);
  return pairs.length ? pairs.join('&') : null;
}

function parseUtmString(raw) {
  if (!raw) return null;
  try {
    const trimmed = String(raw).trim().replace(/^\?/, '');
    const normalized = flatToQuery(trimmed) || trimmed.replace(/\s/g, '&');
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

export function collectUtm() {
  const fromUrl = parseUtmString(window.location.search);
  if (fromUrl) return fromUrl;

  const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  return parseUtmString(startParam);
}

export function storeUtm(utm) {
  if (utm?.utmSource) {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
  }
}

export function getStoredUtm() {
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
