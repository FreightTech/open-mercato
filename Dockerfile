FROM node:22-alpine AS builder

ARG NODE_OPTIONS="--max-old-space-size=4096"
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=""
ARG NEXT_PUBLIC_VESSEL_API_URL=""

ENV NODE_OPTIONS=$NODE_OPTIONS \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_VESSEL_API_URL=$NEXT_PUBLIC_VESSEL_API_URL

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Install system deps required by optional native modules (Alpine uses apk)
# canvas requires: cairo, pango, jpeg, giflib, librsvg, pixman
# newrelic native modules require: linux-headers
RUN apk add --no-cache python3 make g++ ca-certificates openssl \
    cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev \
    linux-headers

# Enable Corepack for Yarn
RUN corepack enable

# Copy workspace configuration files
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all packages and apps (including package.json files for dependency installation)
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY scripts/ ./scripts/

# Make scripts executable (COPY doesn't preserve permissions)
RUN chmod +x scripts/*.sh

# Install all dependencies (including devDependencies for build)
# Note: Using plain install because peer dependency warnings cause lockfile changes
RUN yarn install

# Copy other necessary files
COPY newrelic.js ./
COPY jest.config.cjs jest.setup.ts jest.dom.setup.ts ./
COPY eslint.config.mjs ./


# Build the app
RUN yarn build

# Dev stage: install + build packages only, no production build; run dev server with watch
FROM node:22-alpine AS dev

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN apk add --no-cache python3 make g++ ca-certificates openssl
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY scripts/ ./scripts/
RUN yarn install

COPY newrelic.js ./
COPY jest.config.cjs jest.setup.ts jest.dom.setup.ts ./
COPY eslint.config.mjs ./

RUN yarn build:packages

COPY docker/scripts/dev-entrypoint.sh /app/docker/scripts/dev-entrypoint.sh
RUN chmod +x /app/docker/scripts/dev-entrypoint.sh

EXPOSE 3000
CMD ["/bin/sh", "/app/docker/scripts/dev-entrypoint.sh"]

# Production stage
FROM node:22-alpine AS runner

ARG CONTAINER_PORT=3000

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=${CONTAINER_PORT}

WORKDIR /app

# Install system dependencies for native modules (canvas requires cairo, pango, etc.)
# These are needed because yarn workspaces focus rebuilds native bindings
# newrelic native modules require: linux-headers
RUN apk add --no-cache python3 make g++ ca-certificates openssl \
    cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev \
    linux-headers

# Enable Corepack for Yarn
RUN corepack enable

# Copy workspace configuration for production install
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY --from=builder /app/.yarn ./.yarn

# Copy all packages and app metadata for dependency resolution
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/mercato/package.json ./apps/mercato/

# Install only production dependencies
RUN yarn workspaces focus @open-mercato/app --production

# Copy built Next.js application
COPY --from=builder /app/apps/mercato/.next ./apps/mercato/.next
COPY --from=builder /app/apps/mercato/public ./apps/mercato/public
COPY --from=builder /app/apps/mercato/next.config.ts ./apps/mercato/
COPY --from=builder /app/apps/mercato/components.json ./apps/mercato/
COPY --from=builder /app/apps/mercato/tsconfig.json ./apps/mercato/
COPY --from=builder /app/apps/mercato/postcss.config.mjs ./apps/mercato/

# Copy generated files and other runtime necessities
COPY --from=builder /app/apps/mercato/.mercato ./apps/mercato/.mercato
COPY --from=builder /app/apps/mercato/src ./apps/mercato/src
COPY --from=builder /app/apps/mercato/types ./apps/mercato/types

# Copy runtime configuration files
COPY --from=builder /app/newrelic.js ./

# Copy and setup entrypoint script
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Drop root privileges (Alpine uses adduser instead of useradd)
RUN adduser -D -u 1001 omuser \
 && chown -R omuser:omuser /app

USER omuser

# Expose ports: main app (3000) and MCP server (3001)
EXPOSE ${CONTAINER_PORT}
EXPOSE 3001

# Run the app via entrypoint script
WORKDIR /app/apps/mercato
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["yarn", "start"]