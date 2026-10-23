FROM node:22-bookworm-slim AS builder
WORKDIR /usr/src/app
COPY package*.json ./
# npm install updates the lockfile for the added AWS SDK dependency when building.
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY entrypoint.sh ./
COPY src/ ./src/
RUN chown -R node:node /usr/src/app && chmod +x /usr/src/app/entrypoint.sh
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./entrypoint.sh"]
