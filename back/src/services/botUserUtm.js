const { BotUser } = require('../models');
const { utmToFields } = require('../utils/utm');

async function saveBotUserUtm(telegramId, utm) {
  if (!telegramId || !utm?.utmSource) return false;
  try {
    const fields = { ...utmToFields(utm), utmFirstSeenAt: new Date() };
    const botUser = await BotUser.findOne({ where: { telegramId } });
    if (!botUser) {
      await BotUser.create({
        telegramId,
        firstName: 'Пользователь',
        firstInteractionAt: new Date(),
        lastInteractionAt: new Date(),
        ...fields,
      });
      return true;
    }
    await botUser.update(fields);
    return true;
  } catch (e) {
    console.error('saveBotUserUtm error:', e.message);
    return false;
  }
}

async function getBotUserUtmFields(telegramId) {
  if (!telegramId) return {};
  try {
    const botUser = await BotUser.findOne({
      where: { telegramId },
      attributes: ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'utmRaw'],
    });
    if (botUser?.utmSource) return utmToFields(botUser);
  } catch {}
  return {};
}

module.exports = { saveBotUserUtm, getBotUserUtmFields };
