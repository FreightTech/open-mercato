FROM node:22-alpine AS builder

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

# Install all dependencies (including devDependencies for build)
# Note: Using plain install because peer dependency warnings cause lockfile changes
RUN yarn install

# Copy other necessary files
COPY newrelic.js ./
COPY jest.config.cjs jest.setup.ts jest.dom.setup.ts ./
COPY eslint.config.mjs ./


# Build the app
RUN yarn build

FROM node:22-alpine AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# canvas requires: cairo, pango, jpeg, giflib, librsvg, pixman
# newrelic native modules require: linux-headers
RUN apk add --no-cache python3 make g++ ca-certificates openssl docker-cli \
    cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev \
    linux-headers
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

COPY docker/preview/preview-entrypoint.sh /app/docker/preview/preview-entrypoint.sh
RUN chmod +x /app/docker/preview/preview-entrypoint.sh

CMD ["/bin/sh", "/app/docker/preview/preview-entrypoint.sh"]
