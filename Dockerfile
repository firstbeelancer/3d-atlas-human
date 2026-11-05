# --- сборка ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Адрес сайта для sitemap.xml и canonical; почта для «Напишите нам» (необязательно)
ARG SITE_URL=http://localhost
ARG VITE_CONTACT_EMAIL=
ENV SITE_URL=$SITE_URL VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL
RUN npm run build

# --- раздача ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/health || exit 1
