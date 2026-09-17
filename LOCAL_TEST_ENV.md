# Локальное тестовое окружение

Изолированный Postgres + backend на этой машине, отдельный от прод/dev БД и
от test-VPS (`87.232.67.145`). Нужен, чтобы проверять нагрузку и логику
(например живую викторину) на актуальном коде без риска для реальных данных
и без Docker.

## Что это

- Отдельный кластер Postgres в `.local-test-env/pgdata`, слушает `127.0.0.1:54329`
  (не пересекается с системным Postgres на 5432/5433), auth=trust — без пароля,
  только для локальной разработки.
- `back/.env.localtest` — конфиг backend для этого окружения (порт 5057,
  `EXTERNAL_DELIVERY_ENABLED=false` — бот не лезет в реальный Telegram API).
- `back/scripts/seedLocalTestEnv.js` — засеивает предмет, учителя, N учеников,
  живое занятие и викторину с вопросами.
- `back/scripts/quizLoadTest.js` — нагрузочная проверка викторины поверх сида.

Ничего из этого не трогает `docker-compose.yml`, прод (`93.125.82.173`) или
test-VPS (`87.232.67.145`) — скрипты явно отказываются работать, если
`DATABASE_URL`/`LOAD_TEST_URL` похожи на них.

## Разовая настройка (если кластер ещё не создан)

```powershell
& "C:\Program Files\PostgreSQL\17\bin\initdb.exe" -D ".local-test-env\pgdata" -U educa_test --auth=trust -E UTF8
# в .local-test-env\pgdata\postgresql.conf выставить: port = 54329
```

## Обычный цикл проверки

```powershell
cd C:\Users\trank\project

# 1. Поднять изолированный Postgres
.\local-test-env.ps1 start

# 2. Засеять тестовые данные (создаёт БД educa_local_test при первом запуске)
.\local-test-env.ps1 seed -Students 50 -Questions 10
# скрипт печатает готовые $env:LOAD_TEST_* строки — скопировать их

# 3. В одном окне — backend на тестовой БД
.\local-test-env.ps1 serve

# 4. В другом окне — нагрузочный прогон (переменные из шага 2)
cd back
$env:LOAD_TEST_URL = "http://localhost:5057"
$env:LOAD_TEST_BOT_TOKEN = "local-test-bot-token-not-real"
$env:LOAD_TEST_LESSON_ID = "1"
$env:LOAD_TEST_QUIZ_ID = "1"
$env:LOAD_TEST_TEACHER_ID = "900000001"
$env:LOAD_TEST_STUDENT_IDS = "910000001,910000002,...(из шага 2)"
node scripts/quizLoadTest.js --students 50 --questions 10

# 5. Когда закончил — погасить
.\local-test-env.ps1 stop
```

`seed` можно перезапускать сколько угодно раз — использует `findOrCreate` и
идемпотентен по `telegramId`/названию предмета; повторный запуск просто
переиспользует те же учеников/учителя и создаёт новое живое занятие с новой
викториной (старое живое занятие того же предмета автоматически завершается).

## Проверка вручную в браузере

Backend слушает `http://localhost:5057`, но фронтенд собран на другой
`API_URL`. Для визуальной проверки быстрее поднять фронтенд через
`mcp__Claude_Browser__preview_start` с `REACT_APP_BACKEND_URL=http://localhost:5057`
и подписать initData тем же `BOT_TOKEN` (`local-test-bot-token-not-real`) —
либо просто гонять `quizLoadTest.js`, который делает то же самое по HTTP/сокетам.
