
FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json ./

RUN npm install \
    --omit=dev \
    --legacy-peer-deps \
    --no-audit \
    --no-fund \
    --fetch-retries=2

COPY index.html style.css app.js ./

COPY server.js engine.js gpu.js db.js ./

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["node", "server.js"]
