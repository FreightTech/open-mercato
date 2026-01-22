FROM node:24-bookworm-slim AS builder

ARG NODE_OPTIONS="--max-old-space-size=4096"
ENV NODE_OPTIONS=$NODE_OPTIONS

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Install system deps required by optional native modules
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 build-essential ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

# Install JS dependencies using Corepack/Yarn with caching
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.json turbo.json ./
COPY scripts ./scripts
RUN corepack enable \
    && yarn install --immutable

# Copy the rest of the workspace
COPY . .

# Generate required files (entity IDs, DI, etc.) and build
RUN yarn build

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

WORKDIR /app

RUN corepack enable

# Copy built artifacts and workspace
COPY --from=builder /app /app

# Drop root privileges
RUN useradd --create-home --uid 1001 omuser \
    && chown -R omuser:omuser /app

USER omuser

EXPOSE 3000

CMD ["yarn", "start"]
