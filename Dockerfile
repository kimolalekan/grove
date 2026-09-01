# ---------- Builder stage ----------
FROM node:24-alpine AS builder
RUN npm install -g pnpm@11
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Build the client (Vite) and server (esbuild) bundles
COPY . .
RUN pnpm build

# ---------- Runtime stage ----------
FROM node:24-alpine AS runner
ENV NODE_ENV=production
RUN npm install -g pnpm@11
WORKDIR /app

# Production dependencies only (the server bundle is built with --packages=external)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Bundled server + client assets
COPY --from=builder /app/dist ./dist

EXPOSE 3211

USER node

CMD ["node", "dist/index.js"]
