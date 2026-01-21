# Currency Scheduling Feature

## Overview

The currency module now includes automatic scheduling for exchange rate fetching. Exchange rates can be fetched daily at a configured time in a specific timezone.

## Architecture

### Components

1. **Scheduler Worker** (`workers/scheduler.worker.ts`)
   - Runs every minute (self-enqueuing pattern)
   - Checks all enabled `CurrencyFetchConfig` records
   - Matches current time (in config's timezone) against `syncTime`
   - Enqueues sync jobs for matches
   - Prevents duplicate syncs within 1 hour window

2. **Currency Sync Worker** (`workers/currency-sync.worker.ts`)
   - Processes sync jobs from the `currency-sync` queue
   - Fetches rates using `RateFetchingService`
   - Updates `CurrencyFetchConfig` with status, count, and errors
   - Retries up to 3 times on failure (BullMQ default)

3. **DI Registration** (`di.ts`)
   - Registers `currencySchedulerQueue` and `currencySyncQueue`
   - Note: Scheduler bootstrap moved to `packages/core/src/bootstrap.ts`

### Database Schema

```sql
-- New column added to currency_fetch_configs
ALTER TABLE currency_fetch_configs 
ADD COLUMN timezone TEXT NULL DEFAULT 'UTC';
```

## Configuration

### Environment Variables

```bash
# Queue strategy (local for dev, async for production)
QUEUE_STRATEGY=local|async

# Redis URL (required for async strategy)
REDIS_URL=redis://localhost:6379

# Skip auto-start of currency scheduler (optional)
SKIP_CURRENCY_SCHEDULER=true
```

### Per-Config Settings

Each `CurrencyFetchConfig` has:

- **`isEnabled`**: Must be `true` for scheduling
- **`syncTime`**: Time in HH:MM format (e.g., "09:00")
- **`timezone`**: IANA timezone identifier (e.g., "Europe/Warsaw", "America/New_York")

## Usage

### Admin UI

1. Navigate to **Currencies → Currency Rate Fetching**
2. Toggle a provider to **Enabled**
3. Set **Daily Sync Time** (e.g., 09:00)
4. Select **Timezone** from dropdown
5. The scheduler will automatically sync at the configured time

### CLI Commands

```bash
# Check scheduler status
yarn mercato currencies list-providers --tenant <id> --org <id>

# Manually trigger fetch
yarn mercato currencies fetch-rates --tenant <id> --org <id>

# Run worker in production
yarn mercato queue worker currency-sync --concurrency=2
```

### Testing the Scheduler

```bash
# Start the scheduler (auto-started by default)
# Check logs for:
# [currencies] ✅ Currency scheduler started

# Enable a config with current time
# Watch for:
# [currency-scheduler] Tick N at <timestamp>
# [currency-scheduler] ✅ Enqueued sync for <provider>
# [currency-sync] Starting sync for <provider>
# [currency-sync] ✅ <provider>: N rate(s) fetched
```

## How It Works

### Bootstrap Flow

```
1. Application starts
2. packages/core/src/bootstrap.ts runs once
3. Checks if SKIP_CURRENCY_SCHEDULER=true
4. Resolves currencySchedulerQueue from DI container
5. Checks if scheduler job already exists (dedupe)
6. Enqueues first scheduler job (tick: 0)
7. Scheduler worker picks it up and starts running
```

### Scheduler Flow

```
1. Scheduler wakes up every minute
2. Query CurrencyFetchConfig WHERE isEnabled=true AND syncTime IS NOT NULL
3. For each config:
   a. Convert current UTC time to config's timezone
   b. Format as HH:MM
   c. Compare to config.syncTime
   d. If match AND lastSyncAt > 1 hour ago:
      - Enqueue sync job
4. Re-enqueue scheduler for 1 minute later
```

### Sync Flow

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

## Timezone Handling

The scheduler uses `Intl.DateTimeFormat` to convert UTC time to the target timezone:

```typescript
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Warsaw',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
```

This ensures accurate time matching across daylight saving time transitions.

## Preventing Duplicate Syncs

The scheduler checks `lastSyncAt` before enqueuing:

```typescript
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
if (config.lastSyncAt && config.lastSyncAt > oneHourAgo) {
  // Skip - already synced recently
}
```

This handles:
- Multiple scheduler instances (multi-server deployments)
- Clock skew between servers
- Manual "Fetch Now" button in UI

## Error Handling

### Scheduler Errors

- **Invalid timezone**: Falls back to UTC, logs warning
- **Queue enqueue failure**: Logs error, continues with other configs
- **Bootstrap failure**: Logs warning, scheduler doesn't start

### Sync Worker Errors

- **Config not found/disabled**: Skips job, no retry
- **Provider fetch failure**: Updates config with error, retries 3x
- **All retries exhausted**: Marks config with 'error' status

## Monitoring

### Check Scheduler Status

```sql
-- View all configs and their last sync
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
yarn mercato queue status currency-scheduler
yarn mercato queue status currency-sync
```

### Application Logs

Look for:
- `[currencies] ✅ Currency scheduler started`
- `[currency-scheduler] Tick N at <timestamp>`
- `[currency-scheduler] ✅ Enqueued sync for <provider>`
- `[currency-sync] ✅ <provider>: N rate(s) fetched`
- `[currency-sync] ❌ <provider> failed: <error>`

## Production Deployment

### Using Local Strategy (Development)

The scheduler runs in-process with file-based queues:

```bash
# In .env
QUEUE_STRATEGY=local

# Start app - scheduler auto-starts
yarn dev
```

### Using Async Strategy (Production)

The scheduler and workers run as separate processes:

```bash
# In .env
QUEUE_STRATEGY=async
REDIS_URL=redis://localhost:6379

# Terminal 1: Start web server
yarn start

# Terminal 2: Start scheduler worker
yarn mercato queue worker currency-scheduler

# Terminal 3: Start sync worker (2x concurrency)
yarn mercato queue worker currency-sync --concurrency=2
```

### Disabling Auto-Start

```bash
# In .env
SKIP_CURRENCY_SCHEDULER=true

# Manually start scheduler via CLI
yarn mercato currencies start-scheduler
```

## Troubleshooting

### Scheduler not running

1. Check logs for bootstrap message
2. Verify `SKIP_CURRENCY_SCHEDULER` is not set to `true`
3. Check queue status: `yarn mercato queue status currency-scheduler`
4. Manually enqueue: See CLI commands section

### Syncs not triggering

1. Verify `isEnabled=true` in database
2. Check `syncTime` matches current time in configured `timezone`
3. Verify `lastSyncAt` is older than 1 hour
4. Check scheduler logs for errors

### Worker crashes

1. Check Redis connection (async strategy)
2. Verify database connectivity
3. Check provider API availability
4. Review error logs for stack traces

## Future Enhancements

- [ ] Admin UI for scheduler status/control
- [ ] Configurable sync window (e.g., "every hour", "every 6 hours")
- [ ] Retry configuration per provider
- [ ] Notification on persistent failures
- [ ] Multi-day backfill on missed syncs
- [ ] Distributed locking for scheduler (Redis-based)
