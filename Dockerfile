
FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci \
    --omit=dev \
    --no-audit \
    --no-fund \
    --fetch-retries=2

COPY index.html style.css app.js ./

COPY server.js engine.js gpu.js db.js ./
COPY workflow.js source.js workflow-api.js ./

ENV NODE_ENV=production
ENV PORT=8000

USER node

EXPOSE 8000

CMD ["node", "server.js"]
