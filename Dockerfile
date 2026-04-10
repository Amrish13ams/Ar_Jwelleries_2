# Dockerfile

# Base image for installing dependencies
FROM node:20-alpine AS base
WORKDIR /app

# Install libc6-compat for compatibility and vips-dev for sharp (a Next.js dependency)
RUN apk add --no-cache libc6-compat vips-dev

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# --- Dependencies Stage ---
FROM base AS deps
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# --- Builder Stage ---
FROM deps AS builder
WORKDIR /app

# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN npm run build

# --- Runner Stage ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# You must have `output: 'standalone'` in your next.config.js for this to work
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]