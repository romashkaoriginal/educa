// Сервис интеграции с AmoCRM
// Когда появятся доступы — заполни переменные окружения:
//   AMOCRM_SUBDOMAIN   — поддомен (например mycompany для mycompany.amocrm.ru)
//   AMOCRM_TOKEN       — long-lived access token из настроек интеграции
// Пока токена нет — sendToAmoCRM вернёт ошибку, заявка останется в БД со статусом error/pending

async function sendToAmoCRM(application) {
  const subdomain = process.env.AMOCRM_SUBDOMAIN;
  const token = process.env.AMOCRM_TOKEN;

  if (!subdomain || !token) {
    return { ok: false, error: 'AmoCRM не настроен (нет AMOCRM_SUBDOMAIN/AMOCRM_TOKEN)' };
  }

  try {
    const baseUrl = `https://${subdomain}.amocrm.ru/api/v4`;

    // 1. Создаём контакт
    const contactRes = await fetch(`${baseUrl}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        name: application.fullName,
        custom_fields_values: [{
          field_code: 'PHONE',
          values: [{ value: application.phone, enum_code: 'WORK' }]
        }]
      }])
    });

    if (!contactRes.ok) {
      const errText = await contactRes.text();
      return { ok: false, error: `Ошибка создания контакта: ${contactRes.status} ${errText}` };
    }

    const contactData = await contactRes.json();
    const contactId = contactData._embedded?.contacts?.[0]?.id;

    // 2. Создаём сделку (lead) с привязкой контакта
    const noteText = [
      `Заявка из Telegram-бота`,
      `Предмет: ${application.subjectName || '—'}`,
      `Результат теста: ${application.testCorrect}/${application.testTotal} (${application.testPercent}%)`,
      application.telegramUsername ? `Telegram: @${application.telegramUsername}` : '',
    ].filter(Boolean).join('\n');

    const leadRes = await fetch(`${baseUrl}/leads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        name: `Заявка: ${application.fullName}`,
        _embedded: contactId ? { contacts: [{ id: contactId }] } : undefined
      }])
    });

    if (!leadRes.ok) {
      const errText = await leadRes.text();
      return { ok: false, error: `Ошибка создания сделки: ${leadRes.status} ${errText}` };
    }

    const leadData = await leadRes.json();
    const leadId = leadData._embedded?.leads?.[0]?.id;

    // 3. Добавляем примечание к сделке с результатами теста
    if (leadId) {
      await fetch(`${baseUrl}/leads/${leadId}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          note_type: 'common',
          params: { text: noteText }
        }])
      }).catch(() => {}); // примечание не критично
    }

    return { ok: true, leadId: String(leadId) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { sendToAmoCRM };