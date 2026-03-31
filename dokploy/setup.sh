#!/usr/bin/env bash
#
# Dokploy Project Setup Script
# Creates a full Open Mercato project with all services on a remote server.
#
# Usage:
#   ./dokploy/setup.sh                                      # interactive prompts
#   ./dokploy/setup.sh --config dokploy/envs/production.env # from config file
#
# Config file format: standard .env (KEY=VALUE), see dokploy/envs/production.env.example
#
set -euo pipefail

# ─── Colors ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; }
info()  { echo -e "${CYAN}→${NC} $1"; }
header(){ echo -e "\n${BOLD}═══ $1 ═══${NC}\n"; }

# ─── API helpers ─────────────────────────────────────────
api_post() {
  local endpoint="$1" data="$2"
  curl -sf -X POST "${DOKPLOY_URL}/api/${endpoint}" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$data"
}

api_get() {
  local endpoint="$1"
  curl -sf "${DOKPLOY_URL}/api/${endpoint}" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H "accept: application/json"
}

jq_or_python() {
  if command -v jq &>/dev/null; then
    jq -r "$1"
  else
    python3 -c "import sys,json; d=json.load(sys.stdin); print($2)"
  fi
}

extract_id() {
  local field="$1"
  jq_or_python ".$field" "d['$field']"
}

# ─── Parse arguments ─────────────────────────────────────
CONFIG_FILE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --config) CONFIG_FILE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--config <env-file>]"
      echo "  --config <file>  Load configuration from .env file"
      echo "  --help           Show this help"
      exit 0 ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Load config ─────────────────────────────────────────
if [[ -n "$CONFIG_FILE" ]]; then
  if [[ ! -f "$CONFIG_FILE" ]]; then
    err "Config file not found: $CONFIG_FILE"
    exit 1
  fi
  info "Loading config from $CONFIG_FILE"
  set -a
  source "$CONFIG_FILE"
  set +a
fi

# ─── Required variables (prompt if missing) ──────────────
prompt_var() {
  local var_name="$1" prompt="$2" default="${3:-}"
  if [[ -z "${!var_name:-}" ]]; then
    if [[ -n "$default" ]]; then
      read -rp "$(echo -e "${CYAN}?${NC}") $prompt [$default]: " val
      eval "$var_name=\"${val:-$default}\""
    else
      read -rp "$(echo -e "${CYAN}?${NC}") $prompt: " val
      eval "$var_name=\"$val\""
    fi
  fi
}

prompt_secret() {
  local var_name="$1" prompt="$2" default="${3:-}"
  if [[ -z "${!var_name:-}" ]]; then
    if [[ -n "$default" ]]; then
      eval "$var_name=\"$default\""
    else
      read -srp "$(echo -e "${CYAN}?${NC}") $prompt: " val
      echo
      eval "$var_name=\"$val\""
    fi
  fi
}

generate_secret() {
  openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | xxd -p | tr -d '\n' | head -c "$(($1 * 2))"
}

generate_password() {
  openssl rand -base64 24 2>/dev/null | tr -d '/+=' | head -c "$1"
}

header "Dokploy Project Setup"

# Connection
prompt_var   DOKPLOY_URL     "Dokploy URL"           "https://dokploy.freighttech.org"
prompt_var   DOKPLOY_API_KEY "Dokploy API key"

# Validate connection
info "Validating connection..."
if ! api_get "project.all" >/dev/null 2>&1; then
  err "Cannot connect to Dokploy at $DOKPLOY_URL. Check URL and API key."
  exit 1
fi
log "Connected to Dokploy"

# Project settings
prompt_var PROJECT_NAME        "Project name"              "fto-backstage"
prompt_var PROJECT_DESCRIPTION "Project description"       "Invoicing & KSeF backstage services"
prompt_var APP_DOMAIN          "Application domain"        "backstage.freighttech.org"

# Server selection
header "Server Selection"
info "Available servers:"
SERVERS_JSON=$(api_get "server.all")
echo "$SERVERS_JSON" | python3 -c "
import sys, json
for i, s in enumerate(json.load(sys.stdin)):
    print(f'  [{i+1}] {s[\"name\"]} ({s[\"ipAddress\"]})')
"
if [[ -z "${SERVER_ID:-}" ]]; then
  read -rp "$(echo -e "${CYAN}?${NC}") Select server number: " server_num
  SERVER_ID=$(echo "$SERVERS_JSON" | python3 -c "
import sys, json
servers = json.load(sys.stdin)
print(servers[int('$server_num')-1]['serverId'])
")
fi
SERVER_NAME=$(echo "$SERVERS_JSON" | python3 -c "
import sys, json
for s in json.load(sys.stdin):
    if s['serverId'] == '$SERVER_ID':
        print(s['name']); break
")
log "Selected server: $SERVER_NAME ($SERVER_ID)"

# ─── Generate secrets if not provided ────────────────────
header "Credentials"

: "${POSTGRES_PASSWORD:=$(generate_password 32)}"
: "${N8N_POSTGRES_PASSWORD:=$(generate_password 32)}"
: "${REDIS_PASSWORD:=$(generate_password 24)}"
: "${JWT_SECRET:=$(generate_secret 32)}"
: "${MEILISEARCH_API_KEY:=$(generate_password 24)}"
: "${ENCRYPTION_FALLBACK_KEY:=$(generate_secret 16)}"
: "${N8N_ENCRYPTION_KEY:=$(generate_secret 32)}"
: "${N8N_BASIC_AUTH_USER:=admin}"
: "${N8N_BASIC_AUTH_PASSWORD:=$(generate_password 20)}"
: "${SUPERADMIN_EMAIL:=admin@freighttech.org}"
: "${SUPERADMIN_PASSWORD:=$(generate_password 24)}"
: "${MCP_API_KEY:=omk_$(generate_secret 8).$(generate_secret 24)}"

# Optional API keys (from env or empty)
: "${OPENAI_API_KEY:=}"
: "${ANTHROPIC_API_KEY:=}"
: "${RESEND_API_KEY:=}"
: "${MISTRAL_API_KEY:=}"
: "${GOOGLE_PLACES_API_KEY:=}"
: "${NEW_RELIC_APP_NAME:=}"
: "${NEW_RELIC_LICENSE_KEY:=}"
: "${ADMIN_EMAIL:=admin@example.com}"
: "${EMAIL_FROM:=}"

log "Credentials ready (generated where missing)"

# ─── GitHub source ───────────────────────────────────────
: "${GITHUB_ID:=}"
: "${GITHUB_OWNER:=FreightTech}"
: "${GITHUB_REPO:=open-mercato}"
: "${GITHUB_BRANCH:=freighttechdevel}"

# Auto-detect GitHub integration ID
if [[ -z "$GITHUB_ID" ]]; then
  GITHUB_JSON=$(api_get "admin.github.getGithubApp" 2>/dev/null || echo "[]")
  GH_COUNT=$(echo "$GITHUB_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 1)" 2>/dev/null || echo "0")
  if [[ "$GH_COUNT" != "0" ]]; then
    GITHUB_ID=$(echo "$GITHUB_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if isinstance(d, list):
    print(d[0].get('githubId',''))
elif isinstance(d, dict):
    print(d.get('githubId',''))
" 2>/dev/null || echo "")
    if [[ -n "$GITHUB_ID" ]]; then
      log "Auto-detected GitHub integration: $GITHUB_ID"
    fi
  fi
  # Fallback: look at existing apps for the githubId
  if [[ -z "$GITHUB_ID" ]]; then
    GITHUB_ID=$(api_get "project.all" | python3 -c "
import sys, json
for p in json.load(sys.stdin):
    for env in p.get('environments', []):
        for app in env.get('applications', []):
            gid = app.get('githubId')
            if gid:
                print(gid)
                sys.exit(0)
print('')
" 2>/dev/null || echo "")
    if [[ -n "$GITHUB_ID" ]]; then
      log "Found GitHub integration from existing app: $GITHUB_ID"
    else
      warn "No GitHub integration found. Git source must be configured manually in Dokploy UI."
    fi
  fi
fi

# ─── Backup configuration ────────────────────────────────
: "${ENABLE_BACKUPS:=true}"
: "${BACKUP_SCHEDULE_PG_MAIN:=0 2 * * *}"
: "${BACKUP_SCHEDULE_PG_N8N:=0 3 * * *}"
: "${BACKUP_RETENTION:=7}"
: "${BACKUP_PREFIX:=}"
: "${S3_DESTINATION_ID:=}"

# ─── Service toggles ────────────────────────────────────
: "${ENABLE_FMS_N8N:=true}"
: "${ENABLE_INF_N8N:=false}"
: "${ENABLE_N8N_RUNNER:=false}"
: "${ENABLE_OPENCODE:=false}"
: "${ENABLE_OTEL:=false}"

# ─── Image versions ─────────────────────────────────────
: "${POSTGRES_IMAGE:=pgvector/pgvector:pg17-trixie}"
: "${N8N_POSTGRES_IMAGE:=postgres:16-alpine}"
: "${REDIS_IMAGE:=redis:7-alpine}"
: "${MEILISEARCH_IMAGE:=getmeili/meilisearch:v1.11}"
: "${NATS_IMAGE:=nats:2.10-alpine}"
: "${N8N_IMAGE:=n8nio/n8n:latest}"

# ═══════════════════════════════════════════════════════════
header "Creating Project"
# ═══════════════════════════════════════════════════════════

CREATE_RESULT=$(api_post "project.create" \
  "{\"name\": \"$PROJECT_NAME\", \"description\": \"$PROJECT_DESCRIPTION\"}")
PROJECT_ID=$(echo "$CREATE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['project']['projectId'])")
ENV_ID=$(echo "$CREATE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['environment']['environmentId'])")
log "Project: $PROJECT_NAME ($PROJECT_ID)"
log "Environment: production ($ENV_ID)"

# ═══════════════════════════════════════════════════════════
header "Creating Databases"
# ═══════════════════════════════════════════════════════════

# PostgreSQL (main)
PG_MAIN_ID=$(api_post "postgres.create" "{
  \"name\": \"PostgreSQL\",
  \"description\": \"Primary application database (pgvector)\",
  \"environmentId\": \"$ENV_ID\",
  \"serverId\": \"$SERVER_ID\",
  \"databaseName\": \"open-mercato\",
  \"databaseUser\": \"postgres\",
  \"databasePassword\": \"$POSTGRES_PASSWORD\",
  \"dockerImage\": \"$POSTGRES_IMAGE\"
}" | extract_id "postgresId")
PG_MAIN_HOST=$(api_get "postgres.one?postgresId=$PG_MAIN_ID" | extract_id "appName")
log "PostgreSQL: $PG_MAIN_HOST ($PG_MAIN_ID)"

# PostgreSQL (n8n)
PG_N8N_ID=$(api_post "postgres.create" "{
  \"name\": \"OM n8n PostgreSQL\",
  \"description\": \"Dedicated database for n8n workflow instances\",
  \"environmentId\": \"$ENV_ID\",
  \"serverId\": \"$SERVER_ID\",
  \"databaseName\": \"n8n\",
  \"databaseUser\": \"n8n\",
  \"databasePassword\": \"$N8N_POSTGRES_PASSWORD\",
  \"dockerImage\": \"$N8N_POSTGRES_IMAGE\"
}" | extract_id "postgresId")
PG_N8N_HOST=$(api_get "postgres.one?postgresId=$PG_N8N_ID" | extract_id "appName")
log "OM n8n PostgreSQL: $PG_N8N_HOST ($PG_N8N_ID)"

# Redis
REDIS_ID=$(api_post "redis.create" "{
  \"name\": \"fms-redis\",
  \"description\": \"Application cache, queues, and events\",
  \"environmentId\": \"$ENV_ID\",
  \"serverId\": \"$SERVER_ID\",
  \"dockerImage\": \"$REDIS_IMAGE\",
  \"databasePassword\": \"$REDIS_PASSWORD\"
}" | extract_id "redisId")
REDIS_HOST=$(api_get "redis.one?redisId=$REDIS_ID" | extract_id "appName")
log "Redis: $REDIS_HOST ($REDIS_ID)"

# ═══════════════════════════════════════════════════════════
header "Creating Application"
# ═══════════════════════════════════════════════════════════

APP_ID=$(api_post "application.create" "{
  \"name\": \"app\",
  \"description\": \"Open Mercato - Main application\",
  \"environmentId\": \"$ENV_ID\",
  \"serverId\": \"$SERVER_ID\"
}" | extract_id "applicationId")
log "Application: app ($APP_ID)"

# Set build type to Dockerfile
api_post "application.saveBuildType" "{
  \"applicationId\": \"$APP_ID\",
  \"buildType\": \"dockerfile\",
  \"dockerfile\": \"./Dockerfile\",
  \"dockerContextPath\": \".\",
  \"dockerBuildStage\": \"\",
  \"herokuVersion\": \"24\",
  \"railpackVersion\": \"\",
  \"buildPath\": \"/\"
}" >/dev/null
log "Build type: Dockerfile"

# Configure GitHub source
if [[ -n "${GITHUB_ID:-}" ]]; then
  api_post "application.saveGithubProvider" "{
    \"applicationId\": \"$APP_ID\",
    \"githubId\": \"$GITHUB_ID\",
    \"repository\": \"$GITHUB_REPO\",
    \"branch\": \"$GITHUB_BRANCH\",
    \"owner\": \"$GITHUB_OWNER\",
    \"buildPath\": \"/\"
  }" >/dev/null 2>&1 || true
  log "GitHub source: $GITHUB_OWNER/$GITHUB_REPO@$GITHUB_BRANCH"
fi

# Set domain
api_post "domain.create" "{
  \"applicationId\": \"$APP_ID\",
  \"host\": \"$APP_DOMAIN\",
  \"https\": true,
  \"certificateType\": \"letsencrypt\"
}" >/dev/null 2>&1 && log "Domain: $APP_DOMAIN (HTTPS/Let's Encrypt)" || warn "Domain creation skipped (may need manual setup)"

# ═══════════════════════════════════════════════════════════
header "Creating Compose Services"
# ═══════════════════════════════════════════════════════════

create_compose() {
  local name="$1" desc="$2" compose_yaml="$3"
  local id
  id=$(api_post "compose.create" "{
    \"name\": \"$name\",
    \"description\": \"$desc\",
    \"environmentId\": \"$ENV_ID\",
    \"serverId\": \"$SERVER_ID\",
    \"composeType\": \"docker-compose\"
  }" | extract_id "composeId")

  # Update with compose file content
  local update_payload
  update_payload=$(python3 -c "
import json, sys
compose_content = sys.stdin.read()
print(json.dumps({'composeId': '$id', 'composeFile': compose_content, 'sourceType': 'raw'}))
" <<< "$compose_yaml")
  api_post "compose.update" "$update_payload" >/dev/null
  local app_name
  app_name=$(api_get "compose.one?composeId=$id" | extract_id "appName")
  log "$name ($id) → $app_name" >&2
  echo "$id:$app_name"
}

# Meilisearch
MEILI_RESULT=$(create_compose "meilisearch" "Full-text search engine" "$(cat <<YAML
version: '3.8'
services:
  meilisearch:
    image: ${MEILISEARCH_IMAGE}
    restart: unless-stopped
    environment:
      MEILI_ENV: production
      MEILI_MASTER_KEY: "${MEILISEARCH_API_KEY}"
      MEILI_NO_ANALYTICS: "true"
    volumes:
      - meili-data:/meili_data
    networks:
      - dokploy-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7700/health"]
      interval: 10s
      timeout: 5s
      retries: 5
volumes:
  meili-data:
networks:
  dokploy-network:
    external: true
YAML
)")
MEILI_ID="${MEILI_RESULT%%:*}"
MEILI_HOST="${MEILI_RESULT#*:}-meilisearch"

# NATS
NATS_RESULT=$(create_compose "NATS" "Message broker with JetStream" "$(cat <<YAML
version: '3.8'
services:
  nats:
    image: ${NATS_IMAGE}
    restart: unless-stopped
    command: -js -sd /data -m 8222 --name mercato-nats
    volumes:
      - nats-data:/data
    networks:
      - dokploy-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8222/healthz"]
      interval: 10s
      timeout: 5s
      retries: 5
volumes:
  nats-data:
networks:
  dokploy-network:
    external: true
YAML
)")
NATS_ID="${NATS_RESULT%%:*}"
NATS_HOST="${NATS_RESULT#*:}-nats"

# fms-n8n (conditional)
if [[ "$ENABLE_FMS_N8N" == "true" ]]; then
  FMS_N8N_RESULT=$(create_compose "fms-n8n" "FMS workflow automation" "$(cat <<YAML
version: '3.8'
services:
  fms-n8n:
    image: ${N8N_IMAGE}
    restart: unless-stopped
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: "${PG_N8N_HOST}"
      DB_POSTGRESDB_PORT: "5432"
      DB_POSTGRESDB_DATABASE: "n8n"
      DB_POSTGRESDB_USER: "n8n"
      DB_POSTGRESDB_PASSWORD: "${N8N_POSTGRES_PASSWORD}"
      N8N_ENCRYPTION_KEY: "${N8N_ENCRYPTION_KEY}"
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: "${N8N_BASIC_AUTH_USER}"
      N8N_BASIC_AUTH_PASSWORD: "${N8N_BASIC_AUTH_PASSWORD}"
      WEBHOOK_URL: "https://${APP_DOMAIN}/"
    networks:
      - dokploy-network
networks:
  dokploy-network:
    external: true
YAML
)")
  FMS_N8N_ID="${FMS_N8N_RESULT%%:*}"
fi

# inf-n8n (conditional)
if [[ "$ENABLE_INF_N8N" == "true" ]]; then
  : "${INF_N8N_DOMAIN:=n8n-inf.$APP_DOMAIN}"
  INF_N8N_RESULT=$(create_compose "inf-n8n" "Dedicated n8n for INF Shipping" "$(cat <<YAML
version: '3.8'
services:
  inf-n8n:
    image: ${N8N_IMAGE}
    restart: unless-stopped
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: "${PG_N8N_HOST}"
      DB_POSTGRESDB_PORT: "5432"
      DB_POSTGRESDB_DATABASE: "n8n"
      DB_POSTGRESDB_USER: "n8n"
      DB_POSTGRESDB_PASSWORD: "${N8N_POSTGRES_PASSWORD}"
      N8N_ENCRYPTION_KEY: "${N8N_ENCRYPTION_KEY}"
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: "${N8N_BASIC_AUTH_USER}"
      N8N_BASIC_AUTH_PASSWORD: "${N8N_BASIC_AUTH_PASSWORD}"
      WEBHOOK_URL: "https://${INF_N8N_DOMAIN}/"
    networks:
      - dokploy-network
networks:
  dokploy-network:
    external: true
YAML
)")
  INF_N8N_ID="${INF_N8N_RESULT%%:*}"
fi

# n8n runner (conditional)
if [[ "$ENABLE_N8N_RUNNER" == "true" ]]; then
  N8N_RUNNER_RESULT=$(create_compose "n8n runner" "n8n task runner" "$(cat <<YAML
version: '3.8'
services:
  n8n-runner:
    image: ${N8N_IMAGE}
    restart: unless-stopped
    command: worker
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: "${PG_N8N_HOST}"
      DB_POSTGRESDB_PORT: "5432"
      DB_POSTGRESDB_DATABASE: "n8n"
      DB_POSTGRESDB_USER: "n8n"
      DB_POSTGRESDB_PASSWORD: "${N8N_POSTGRES_PASSWORD}"
      N8N_ENCRYPTION_KEY: "${N8N_ENCRYPTION_KEY}"
    networks:
      - dokploy-network
networks:
  dokploy-network:
    external: true
YAML
)")
  N8N_RUNNER_ID="${N8N_RUNNER_RESULT%%:*}"
fi

# OTEL collector (conditional)
if [[ "$ENABLE_OTEL" == "true" ]]; then
  OTEL_RESULT=$(create_compose "OTEL collector" "OpenTelemetry Collector" "$(cat <<YAML
version: '3.8'
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    restart: unless-stopped
    environment:
      NEW_RELIC_LICENSE_KEY: "${NEW_RELIC_LICENSE_KEY}"
    networks:
      - dokploy-network
networks:
  dokploy-network:
    external: true
YAML
)")
  OTEL_ID="${OTEL_RESULT%%:*}"
fi

# ═══════════════════════════════════════════════════════════
header "Configuring App Environment"
# ═══════════════════════════════════════════════════════════

APP_ENV="NODE_ENV=production
PORT=3000
APP_URL=https://${APP_DOMAIN}
DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@${PG_MAIN_HOST}:5432/open-mercato
JWT_SECRET=${JWT_SECRET}
SSO_FORCE_ROLE_ON_LOGIN=employee
CACHE_STRATEGY=redis
CACHE_REDIS_URL=redis://default:${REDIS_PASSWORD}@${REDIS_HOST}:6379
REDIS_URL=redis://default:${REDIS_PASSWORD}@${REDIS_HOST}:6379
QUEUE_STRATEGY=async
ENABLE_CRUD_API_CACHE=true
MEILISEARCH_HOST=http://${MEILI_HOST}:7700
MEILISEARCH_API_KEY=${MEILISEARCH_API_KEY}
NATS_URL=nats://${NATS_HOST}:4222
TENANT_DATA_ENCRYPTION=true
TENANT_DATA_ENCRYPTION_DEBUG=false
TENANT_DATA_ENCRYPTION_KEY=${TENANT_DATA_ENCRYPTION_KEY:-}
TENANT_DATA_ENCRYPTION_FALLBACK_KEY=${ENCRYPTION_FALLBACK_KEY}
SEARCH_EXCLUDE_ENCRYPTED_FIELDS=true
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_ACQUIRE_TIMEOUT=60000
DEMO_MODE=false
SELF_SERVICE_ONBOARDING_ENABLED=false
UPGRADE_ACTIONS_ENABLED=true
NEXT_PUBLIC_UPGRADE_ACTIONS_ENABLED=true
SCHEDULE_AUTO_REINDEX=true
RESEND_API_KEY=${RESEND_API_KEY}
EMAIL_FROM=${EMAIL_FROM}
ADMIN_EMAIL=${ADMIN_EMAIL}
OPENAI_API_KEY=${OPENAI_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
MISTRAL_API_KEY=${MISTRAL_API_KEY}
GOOGLE_PLACES_API_KEY=${GOOGLE_PLACES_API_KEY}
NEW_RELIC_APP_NAME=${NEW_RELIC_APP_NAME}
NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
OM_INIT_SUPERADMIN_EMAIL=${SUPERADMIN_EMAIL}
OM_INIT_SUPERADMIN_PASSWORD=${SUPERADMIN_PASSWORD}
MCP_SERVER_API_KEY=${MCP_API_KEY}"

ENV_PAYLOAD=$(python3 -c "
import json, sys
env_content = sys.stdin.read()
print(json.dumps({
    'applicationId': '$APP_ID',
    'env': env_content,
    'buildArgs': '',
    'buildSecrets': '',
    'createEnvFile': True
}))
" <<< "$APP_ENV")
api_post "application.saveEnvironment" "$ENV_PAYLOAD" >/dev/null
log "App environment variables set (${MEILI_HOST}, ${NATS_HOST})"

# ═══════════════════════════════════════════════════════════
header "Configuring Backups"
# ═══════════════════════════════════════════════════════════

if [[ "$ENABLE_BACKUPS" == "true" ]]; then
  # Find S3 destination
  if [[ -z "$S3_DESTINATION_ID" ]]; then
    DESTINATIONS_JSON=$(api_get "destination.all")
    DEST_COUNT=$(echo "$DESTINATIONS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

    if [[ "$DEST_COUNT" == "0" ]]; then
      warn "No S3 destinations configured. Skipping backups."
      warn "Add an S3 destination in Dokploy Settings > S3 Destinations"
      ENABLE_BACKUPS=false
    elif [[ "$DEST_COUNT" == "1" ]]; then
      S3_DESTINATION_ID=$(echo "$DESTINATIONS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['destinationId'])")
      S3_DEST_NAME=$(echo "$DESTINATIONS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['name'])")
      log "Using S3 destination: $S3_DEST_NAME ($S3_DESTINATION_ID)"
    else
      info "Available S3 destinations:"
      echo "$DESTINATIONS_JSON" | python3 -c "
import sys, json
for i, d in enumerate(json.load(sys.stdin)):
    print(f'  [{i+1}] {d[\"name\"]} (bucket: {d[\"bucket\"]})')
"
      read -rp "$(echo -e "${CYAN}?${NC}") Select destination number: " dest_num
      S3_DESTINATION_ID=$(echo "$DESTINATIONS_JSON" | python3 -c "
import sys, json
dests = json.load(sys.stdin)
print(dests[int('$dest_num')-1]['destinationId'])
")
      S3_DEST_NAME=$(echo "$DESTINATIONS_JSON" | python3 -c "
import sys, json
dests = json.load(sys.stdin)
print(dests[int('$dest_num')-1]['name'])
")
      log "Using S3 destination: $S3_DEST_NAME ($S3_DESTINATION_ID)"
    fi
  fi

  : "${BACKUP_PREFIX:=/${PROJECT_NAME}}"

  if [[ "$ENABLE_BACKUPS" == "true" ]]; then
    # Backup main PostgreSQL
    api_post "backup.create" "{
      \"postgresId\": \"$PG_MAIN_ID\",
      \"schedule\": \"$BACKUP_SCHEDULE_PG_MAIN\",
      \"enabled\": true,
      \"database\": \"open-mercato\",
      \"prefix\": \"${BACKUP_PREFIX}/postgres-main\",
      \"destinationId\": \"$S3_DESTINATION_ID\",
      \"keepLatestCount\": $BACKUP_RETENTION,
      \"backupType\": \"database\",
      \"databaseType\": \"postgres\"
    }" >/dev/null
    log "Backup: PostgreSQL main (daily ${BACKUP_SCHEDULE_PG_MAIN}, keep $BACKUP_RETENTION)"

    # Backup n8n PostgreSQL
    api_post "backup.create" "{
      \"postgresId\": \"$PG_N8N_ID\",
      \"schedule\": \"$BACKUP_SCHEDULE_PG_N8N\",
      \"enabled\": true,
      \"database\": \"n8n\",
      \"prefix\": \"${BACKUP_PREFIX}/postgres-n8n\",
      \"destinationId\": \"$S3_DESTINATION_ID\",
      \"keepLatestCount\": $BACKUP_RETENTION,
      \"backupType\": \"database\",
      \"databaseType\": \"postgres\"
    }" >/dev/null
    log "Backup: PostgreSQL n8n (daily ${BACKUP_SCHEDULE_PG_N8N}, keep $BACKUP_RETENTION)"
  fi
else
  info "Backups disabled"
fi

# ═══════════════════════════════════════════════════════════
header "Deploying Services"
# ═══════════════════════════════════════════════════════════

: "${AUTO_DEPLOY:=true}"

if [[ "$AUTO_DEPLOY" == "true" ]]; then
  # Deploy databases first (they need to be up before the app)
  info "Starting databases..."
  api_post "postgres.deploy" "{\"postgresId\": \"$PG_MAIN_ID\"}" >/dev/null 2>&1 || true
  log "PostgreSQL main: deploying"
  api_post "postgres.deploy" "{\"postgresId\": \"$PG_N8N_ID\"}" >/dev/null 2>&1 || true
  log "PostgreSQL n8n: deploying"
  api_post "redis.deploy" "{\"redisId\": \"$REDIS_ID\"}" >/dev/null 2>&1 || true
  log "Redis: deploying"

  # Deploy compose services
  info "Deploying compose services..."
  api_post "compose.deploy" "{\"composeId\": \"$MEILI_ID\"}" >/dev/null 2>&1 || true
  log "meilisearch: deploying"
  api_post "compose.deploy" "{\"composeId\": \"$NATS_ID\"}" >/dev/null 2>&1 || true
  log "NATS: deploying"
  [[ "$ENABLE_FMS_N8N" == "true" ]] && {
    api_post "compose.deploy" "{\"composeId\": \"$FMS_N8N_ID\"}" >/dev/null 2>&1 || true
    log "fms-n8n: deploying"
  }
  [[ "$ENABLE_INF_N8N" == "true" ]] && {
    api_post "compose.deploy" "{\"composeId\": \"$INF_N8N_ID\"}" >/dev/null 2>&1 || true
    log "inf-n8n: deploying"
  }
  [[ "$ENABLE_N8N_RUNNER" == "true" ]] && {
    api_post "compose.deploy" "{\"composeId\": \"$N8N_RUNNER_ID\"}" >/dev/null 2>&1 || true
    log "n8n runner: deploying"
  }
  [[ "$ENABLE_OTEL" == "true" ]] && {
    api_post "compose.deploy" "{\"composeId\": \"$OTEL_ID\"}" >/dev/null 2>&1 || true
    log "OTEL collector: deploying"
  }

  # Wait for databases to be ready before deploying the app
  info "Waiting 15s for databases to start..."
  sleep 15

  # Deploy the main application
  info "Deploying application (this takes several minutes)..."
  api_post "application.deploy" "{\"applicationId\": \"$APP_ID\"}" >/dev/null 2>&1 || true
  log "app: build & deploy triggered"
else
  info "Auto-deploy disabled. Deploy services manually in Dokploy UI."
fi

# ═══════════════════════════════════════════════════════════
header "Setup Complete!"
# ═══════════════════════════════════════════════════════════

echo -e "${BOLD}Project:${NC}     $PROJECT_NAME"
echo -e "${BOLD}Server:${NC}      $SERVER_NAME"
echo -e "${BOLD}Environment:${NC} production"
echo -e "${BOLD}Domain:${NC}      https://$APP_DOMAIN"
echo ""
echo -e "${BOLD}Services created:${NC}"
echo "  • app (application)"
echo "  • PostgreSQL (pgvector)"
echo "  • OM n8n PostgreSQL"
echo "  • fms-redis"
echo "  • meilisearch (compose)"
echo "  • NATS (compose)"
[[ "$ENABLE_FMS_N8N"    == "true" ]] && echo "  • fms-n8n (compose)"
[[ "$ENABLE_INF_N8N"    == "true" ]] && echo "  • inf-n8n (compose)"
[[ "$ENABLE_N8N_RUNNER" == "true" ]] && echo "  • n8n runner (compose)"
[[ "$ENABLE_OTEL"       == "true" ]] && echo "  • OTEL collector (compose)"

echo ""
echo -e "${BOLD}Credentials (save these!):${NC}"
echo "  PostgreSQL:     postgres / $POSTGRES_PASSWORD"
echo "  n8n PostgreSQL: n8n / $N8N_POSTGRES_PASSWORD"
echo "  Redis:          default / $REDIS_PASSWORD"
echo "  JWT Secret:     $JWT_SECRET"
echo "  Meilisearch:    $MEILISEARCH_API_KEY"
echo "  Superadmin:     $SUPERADMIN_EMAIL / $SUPERADMIN_PASSWORD"
echo "  n8n Auth:       $N8N_BASIC_AUTH_USER / $N8N_BASIC_AUTH_PASSWORD"
echo "  MCP API Key:    $MCP_API_KEY"

if [[ "$ENABLE_BACKUPS" == "true" ]]; then
  echo ""
  echo -e "${BOLD}Backups:${NC}"
  echo "  • PostgreSQL main → S3 (${BACKUP_SCHEDULE_PG_MAIN}, keep $BACKUP_RETENTION)"
  echo "  • PostgreSQL n8n  → S3 (${BACKUP_SCHEDULE_PG_N8N}, keep $BACKUP_RETENTION)"
fi

if [[ "$AUTO_DEPLOY" == "true" ]]; then
  echo ""
  echo -e "${BOLD}Deploy status:${NC}"
  echo "  All services triggered for deployment."
  echo "  App build takes 10-20 minutes. Monitor in Dokploy UI."
  echo "  URL: $DOKPLOY_URL"
else
  echo ""
  echo -e "${BOLD}Next steps:${NC}"
  echo "  1. Deploy databases (PostgreSQL, Redis) in Dokploy UI"
  echo "  2. Deploy compose services (meilisearch, NATS, etc.)"
  echo "  3. Deploy the app"
fi
