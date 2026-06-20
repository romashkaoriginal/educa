// Сервис интеграции с AmoCRM.
// Заявки попадают в «Неразобранное» нужной воронки (как лиды с формы) через
// API /leads/unsorted/forms — туда же, куда заявки с сайта.
//
// Переменные окружения:
//   AMOCRM_SUBDOMAIN   — поддомен (mailkubikctby для mailkubikctby.amocrm.ru)
//   AMOCRM_TOKEN       — long-lived access token из настроек интеграции
//   AMOCRM_PIPELINE_ID — id воронки, куда класть заявку (необязательно; иначе основная)
// Без токена sendToAmoCRM вернёт ошибку, заявка останется в БД со статусом error/pending

function buildNoteText(application) {
  const selectedSubjects = Array.isArray(application.selectedSubjects) ? application.selectedSubjects : [];
  return [
    `Заявка: ${application.source || 'Telegram'}`,
    application.context ? `Контекст: ${application.context}` : '',
    application.userStatus ? `Статус пользователя: ${application.userStatus}` : '',
    selectedSubjects.length ? `Выбранные предметы (${selectedSubjects.length}): ${selectedSubjects.join(', ')}` : '',
    application.subjectName ? `Предмет теста: ${application.subjectName}` : '',
    (application.testTotal > 0) ? `Результат теста: ${application.testCorrect}/${application.testTotal} (${application.testPercent}%)` : '',
    application.telegramId ? `Telegram ID: ${application.telegramId}` : '',
    application.telegramUsername ? `Telegram: @${application.telegramUsername}` : '',
    `Дата заявки: ${new Date(application.createdAt || Date.now()).toLocaleString('ru-RU')}`,
  ].filter(Boolean).join('\n');
}

async function sendToAmoCRM(application) {
  const subdomain = process.env.AMOCRM_SUBDOMAIN;
  const token = process.env.AMOCRM_TOKEN;
  const pipelineId = process.env.AMOCRM_PIPELINE_ID ? Number(process.env.AMOCRM_PIPELINE_ID) : null;

  if (!subdomain || !token) {
    return { ok: false, error: 'AmoCRM не настроен (нет AMOCRM_SUBDOMAIN/AMOCRM_TOKEN)' };
  }

  try {
    const baseUrl = `https://${subdomain}.amocrm.ru/api/v4`;
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const now = Math.floor(Date.now() / 1000);

    // Создаём лид+контакт в «Неразобранном» (как заявка с формы).
    const unsortedBody = [{
      source_name: application.source || 'TG Mini App',
      source_uid: `kubik-${application.telegramId || 'app'}-${Date.now()}`,
      ...(pipelineId ? { pipeline_id: pipelineId } : {}),
      created_at: now,
      metadata: {
        category: 'forms',
        form_id: 'kubik_app',
        form_name: application.source || 'Заявка KUBIK',
        form_page: 'https://kubik-ct.online',
        form_sent_at: now,
        ip: '0.0.0.0',
        referer: application.telegramUsername
          ? `https://t.me/${application.telegramUsername}`
          : 'https://t.me/educa1488_bot'
      },
      _embedded: {
        leads: [{ name: `Заявка: ${application.fullName}` }],
        contacts: [{
          name: application.fullName,
          custom_fields_values: [{
            field_code: 'PHONE',
            values: [{ value: application.phone, enum_code: 'WORK' }]
          }]
        }]
      }
    }];

    const res = await fetch(`${baseUrl}/leads/unsorted/forms`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(unsortedBody)
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Ошибка создания заявки: ${res.status} ${errText}` };
    }

    const data = await res.json();
    const unsorted = data._embedded?.unsorted?.[0];
    const leadId = unsorted?._embedded?.leads?.[0]?.id;

    // Примечание к сделке (детали заявки). Не критично — ошибку глотаем.
    if (leadId) {
      await fetch(`${baseUrl}/leads/${leadId}/notes`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify([{
          note_type: 'common',
          params: { text: buildNoteText(application) }
        }])
      }).catch(() => {});
    }

    return { ok: true, leadId: leadId ? String(leadId) : (unsorted?.uid || 'unsorted') };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { sendToAmoCRM };
