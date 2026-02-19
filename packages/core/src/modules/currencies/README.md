# Currency Module

## Overview

The currency module manages currencies and exchange rates for multi-currency support.

## Components

### Currency Sync Worker (`workers/currency-sync.worker.ts`)

Processes currency rate sync jobs from the `currency-sync` queue.

- Fetches rates using `RateFetchingService`
- Updates `CurrencyFetchConfig` with status, count, and errors
- Retries up to 3 times on failure (BullMQ default)

### DI Registration (`di.ts`)

- Registers `currencySyncQueue`
- Registers `rateFetchingService` and `exchangeRateService`

## Configuration

### Environment Variables

```bash
# Queue strategy (local for dev, async for production)
QUEUE_STRATEGY=local|async

# Redis URL (required for async strategy)
REDIS_URL=redis://localhost:6379
```

### Per-Config Settings

Each `CurrencyFetchConfig` has:

- **`isEnabled`**: Must be `true` for syncing
- **`syncTime`**: Time in HH:MM format (e.g., "09:00")
- **`timezone`**: IANA timezone identifier (e.g., "Europe/Warsaw", "America/New_York")

## Usage

### Admin UI

1. Navigate to **Currencies -> Currency Rate Fetching**
2. Toggle a provider to **Enabled**
3. Click **Fetch Now** to manually trigger rate fetching

### CLI Commands

```bash
# Check provider status
yarn mercato currencies list-providers --tenant <id> --org <id>

# Manually trigger fetch
yarn mercato currencies fetch-rates --tenant <id> --org <id>

# Run worker in production
yarn mercato queue worker currency-sync --concurrency=2
```

## Sync Flow

```
1. Sync worker receives job
2. Load CurrencyFetchConfig by ID
3. Check if still enabled
4. Initialize RateFetchingService with providers
5. Fetch rates for today
6. Update config:
   - lastSyncAt = now
   - lastSyncCount = rates fetched
   - lastSyncStatus = 'success' | 'partial' | 'error'
   - lastSyncMessage = success/error message
7. On failure: retry up to 3 times (BullMQ)
```

## Monitoring

### Check Config Status

```sql
SELECT 
  provider,
  is_enabled,
  sync_time,
  timezone,
  last_sync_at,
  last_sync_status,
  last_sync_count,
  last_sync_message
FROM currency_fetch_configs
ORDER BY provider;
```

### Check Queue Status

```bash
yarn mercato queue status currency-sync
```

### Application Logs

Look for:
- `[currency-sync] Starting sync for <provider>`
- `[currency-sync] <provider>: N rate(s) fetched`
- `[currency-sync] <provider> failed: <error>`

## Production Deployment

### Using Local Strategy (Development)

```bash
QUEUE_STRATEGY=local
yarn dev
```

### Using Async Strategy (Production)

```bash
# In .env
QUEUE_STRATEGY=async
REDIS_URL=redis://localhost:6379

# Terminal 1: Start web server
yarn start

# Terminal 2: Start sync worker
yarn mercato queue worker currency-sync --concurrency=2
```
