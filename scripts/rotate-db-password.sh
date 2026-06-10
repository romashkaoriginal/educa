#!/bin/bash
set -eu

NEW_PASSWORD="${1:?Usage: bash rotate-db-password.sh NEW_PASSWORD}"

cd /opt/educa

# Убрать Supabase — DATABASE_URL задаёт docker-compose.yml
sed -i '/^DATABASE_URL=/d' /opt/educa/back/.env.production
sed -i '/^DATABASE_SSL=/d' /opt/educa/back/.env.production

# Корневой .env
cat > /opt/educa/.env << EOF
POSTGRES_USER=educa
POSTGRES_PASSWORD=${NEW_PASSWORD}
POSTGRES_DB=educa

REACT_APP_BACKEND_URL=https://kubik-ct.online
EOF

# Сменить пароль в Postgres (локальное подключение внутри контейнера)
docker exec educa-postgres-1 psql -U educa -d educa \
  -c "ALTER USER educa WITH PASSWORD '${NEW_PASSWORD}';"

docker compose up -d --build
docker compose ps
docker compose logs backend --tail 8

echo "Done."
