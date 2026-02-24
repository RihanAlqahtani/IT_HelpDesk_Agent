# =============================================================================
# IT HelpDesk Agent - API Server Dockerfile
# Multi-stage build for production
# =============================================================================

# Stage 1: Install dependencies and build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./

# Copy workspace package.json files for install
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Install all dependencies (workspaces need root install)
RUN npm ci --ignore-scripts

# Copy shared package source and build it first
COPY packages/shared/ packages/shared/
RUN npm run build --workspace=@it-helpdesk/shared

# Copy API source and build
COPY apps/api/ apps/api/
# Copy root tsconfig that API extends
COPY tsconfig.json ./
RUN npm run build --workspace=@it-helpdesk/api

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files for production install
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy built shared package
COPY --from=builder /app/packages/shared/dist packages/shared/dist

# Copy built API
COPY --from=builder /app/apps/api/dist apps/api/dist

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 helpdesk
USER helpdesk

EXPOSE 3001

# Start from the API directory so relative paths work
WORKDIR /app/apps/api

CMD ["node", "dist/index.js"]
