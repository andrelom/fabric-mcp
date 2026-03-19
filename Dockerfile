# Stage 1: Builder
FROM node:22-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src/ src/
RUN pnpm run build

# Stage 2a: Lightweight runtime (no Chromium — uses native fetch + JSDOM)
FROM node:22-bookworm-slim AS runtime-lite

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist/ dist/

VOLUME ["/data/cache"]

ENV NODE_ENV=production \
    CACHE_DIR=/data/cache \
    MCP_PORT=3000 \
    USE_PLAYWRIGHT=false

EXPOSE 3000

CMD ["node", "dist/server/index.js"]

# Stage 2b: Full runtime with Playwright + Chromium
FROM node:22-bookworm-slim AS runtime

# Install Chromium system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm exec playwright install chromium

COPY --from=builder /app/dist/ dist/

VOLUME ["/data/cache"]

ENV NODE_ENV=production \
    CACHE_DIR=/data/cache \
    MCP_PORT=3000 \
    USE_PLAYWRIGHT=true

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
