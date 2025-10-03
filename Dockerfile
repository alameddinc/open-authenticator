# Multi-stage build for Next.js application

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Copy static files to standalone directory
RUN cp -r .next/static .next/standalone/.next/static && \
    mkdir -p .next/standalone/public && \
    cp -r public/. .next/standalone/public/ && \
    ls -la .next/standalone/public/ && \
    mkdir -p .next/standalone/scripts && \
    cp scripts/*.sh .next/standalone/scripts/ && \
    mkdir -p .next/standalone/lib/db && \
    cp lib/db/schema.sql .next/standalone/lib/db/schema.sql

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install cron, sqlite, and wget for Railway deployment
RUN apk add --no-cache wget dcron sqlite

# Create data directories with proper permissions
RUN mkdir -p /app/.next/standalone/data && \
    chmod -R 777 /app/.next/standalone/data

# Copy necessary files from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Make scripts executable
RUN chmod +x /app/scripts/*.sh 2>/dev/null || chmod +x /app/.next/standalone/scripts/*.sh

# Note: Running as root for Railway volume permissions
# In production with proper infrastructure, use USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV AUDIT_RETENTION_DAYS=30

# Use entrypoint script to set up cron and start app
CMD ["/app/scripts/entrypoint.sh"]
