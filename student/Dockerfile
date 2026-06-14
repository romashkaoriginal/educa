FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY public ./public
COPY src ./src

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Версия билда — Telegram iOS кэширует Mini App по URL, ?v= сбрасывает кэш
RUN BUILD_V=$(date +%s) && echo "{\"v\":\"${BUILD_V}\"}" > public/version.json

RUN DISABLE_ESLINT_PLUGIN=true npm run build

FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
