FROM node:20-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:webapp

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PHOTOFIND_HOST=0.0.0.0 \
    PHOTOFIND_PORT=3000 \
    PHOTOFIND_STATIC_DIR=/app/webapp-dist \
    PHOTOFIND_CONFIG_DIR=/config \
    PHOTOFIND_CACHE_DIR=/cache \
    PHOTOFIND_PHOTOS_DIR=/photos \
    PHOTOFIND_INBOX_DIR=/inbox \
    PHOTOFIND_EXPORTS_DIR=/exports
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/webapp-dist ./webapp-dist
COPY --from=build /app/out-server ./out-server
RUN mkdir -p /config /cache /photos /inbox /exports && chown -R 1000:1000 /config /cache /photos /inbox /exports
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER 1000
CMD ["node", "out-server/index.js"]
