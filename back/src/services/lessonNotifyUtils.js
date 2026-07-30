function buildLessonWebAppUrl(appUrl, lessonId) {
  if (!appUrl) return null;
  try {
    const url = new URL(appUrl);
    url.searchParams.set('lessonId', String(lessonId));
    return url.toString();
  } catch {
    return appUrl;
  }
}

function isBotBlockedError(error) {
  const description = String(error?.response?.body?.description || error?.message || '').toLowerCase();
  return Number(error?.response?.statusCode || error?.code) === 403
    && /(blocked by the user|user is deactivated|bot was blocked)/i.test(description);
}

module.exports = { buildLessonWebAppUrl, isBotBlockedError };
