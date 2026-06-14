const axios = require('axios');

const baseWebAppUrl = process.env.WEB_APP_URL;
let cachedUrl = baseWebAppUrl;
let cachedAt = 0;
const TTL_MS = 60 * 1000;

async function refreshWebAppUrl(force = false) {
  if (!baseWebAppUrl || !baseWebAppUrl.startsWith('https://')) {
    return null;
  }

  const now = Date.now();
  if (!force && cachedUrl && now - cachedAt < TTL_MS) {
    return cachedUrl;
  }

  const base = baseWebAppUrl.split('?')[0];

  try {
    const { data } = await axios.get(`${base}/version.json`, {
      params: { t: now },
      timeout: 8000,
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });

    if (data?.v) {
      cachedUrl = `${base}?v=${encodeURIComponent(data.v)}`;
      cachedAt = now;
      return cachedUrl;
    }
  } catch (error) {
    console.warn('WebApp version.json fetch failed:', error.message);
  }

  cachedUrl = baseWebAppUrl;
  cachedAt = now;
  return cachedUrl;
}

function getWebAppUrlSync() {
  return cachedUrl || baseWebAppUrl;
}

module.exports = { refreshWebAppUrl, getWebAppUrlSync };
