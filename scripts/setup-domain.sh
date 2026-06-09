#!/bin/bash
set -eu

if [ -z "${1:-}" ]; then
  echo "Использование: bash setup-domain.sh your-domain.by admin@email.com"
  exit 1
fi

DOMAIN="$1"
EMAIL="${2:-admin@${DOMAIN}}"

echo "==> Domain: $DOMAIN"

cd /opt/educa
docker compose down || true

apt update
apt install -y nginx certbot python3-certbot-nginx

sed "s/YOUR_DOMAIN/${DOMAIN}/g" /opt/educa/nginx/host-educa.conf > /etc/nginx/sites-available/educa
ln -sf /etc/nginx/sites-available/educa /etc/nginx/sites-enabled/educa
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl start nginx
systemctl reload nginx

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

ufw allow 443 || true

APP_URL="https://${DOMAIN}"

grep -q '^WEB_APP_URL=' /opt/educa/back/.env.production \
  && sed -i "s|^WEB_APP_URL=.*|WEB_APP_URL=${APP_URL}|" /opt/educa/back/.env.production \
  || echo "WEB_APP_URL=${APP_URL}" >> /opt/educa/back/.env.production

grep -q '^API_URL=' /opt/educa/back/.env.production \
  && sed -i "s|^API_URL=.*|API_URL=${APP_URL}/api|" /opt/educa/back/.env.production \
  || echo "API_URL=${APP_URL}/api" >> /opt/educa/back/.env.production

grep -q '^ALLOWED_ORIGINS=' /opt/educa/back/.env.production \
  && sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=${APP_URL},https://web.telegram.org|" /opt/educa/back/.env.production \
  || echo "ALLOWED_ORIGINS=${APP_URL},https://web.telegram.org" >> /opt/educa/back/.env.production

echo "REACT_APP_BACKEND_URL=${APP_URL}" > /opt/educa/.env

cd /opt/educa
docker compose up -d --build

echo ""
echo "Готово: ${APP_URL}"
echo "BotFather -> /setdomain -> ${DOMAIN}"
echo "BotFather -> /setmenubutton -> Web App -> ${APP_URL}"
