# Currencies Module — Agent Guidelines

Use the currencies module for multi-currency support, exchange rates, and currency conversion.

## MUST Rules

1. **MUST store currency amounts with 4 decimal precision** — never truncate to 2 decimals internally
2. **MUST use date-based exchange rates** — always resolve rates for the transaction date, not "current" rate
3. **MUST record both transaction currency and base currency amounts** — dual recording is mandatory for reporting
4. **MUST calculate realized gains/losses** on payment: `(payment rate - invoice rate) × foreign amount`
5. **MUST NOT hard-delete exchange rate records** — rates are historical reference data

## Key Files

| File | When to modify |
|------|---------------|
| `data/entities.ts` | When changing currency or exchange rate entity schema |
| `data/validators.ts` | When updating validation rules for currency data |
| `api/` | When adding/modifying currency or exchange rate CRUD routes |

## DB Tables

- `currency` — currency master data
- `exchange_rate` — daily exchange rates per currency pair

## When Adding a New Currency

1. Add the currency record via the admin UI or `seedDefaults` hook
2. Ensure exchange rates exist for the currency pair at required dates
3. Verify all sales/pricing logic resolves the new currency correctly

## Multi-Currency Transaction Rules

When processing multi-currency transactions (e.g., sales invoice in EUR with USD base):

1. Retrieve the exchange rate for the transaction date
2. Generate the document in the transaction currency
3. Calculate the base currency equivalent: `foreign amount × rate`
4. Store both amounts on the document
5. On payment: calculate realized gain/loss from rate difference
6. Report in both transaction and base currencies

## Scheduling — Daily Rate Fetching

When a `CurrencyFetchConfig` is enabled with a `syncTime` and `timezone`, the module
upserts a row in `scheduled_jobs` (owned by `@open-mercato/scheduler`) that fires a
job onto the `currencies-fetch-rates` queue every day at that local time.

- **Wrapper service**: `lib/fetchScheduleService.ts` — `createFetchScheduleService(em, schedulerService?)`
  exposes `syncFromConfig(config)`, `removeForConfig(configId)`, and `reconcile(scope)`.
- **Decoupling**: scheduler is an OPTIONAL DI dependency. The wrapper imports nothing
  from `@open-mercato/scheduler`; it interacts with whatever object is registered as
  `schedulerService` and degrades to a no-op when none is registered.
- **Schedule id**: deterministic — `stableUuidFromString('currencies:fetch-rates:' + config.id)`.
  Re-running registration upserts the same row instead of duplicating.
- **Cron mapping**: `syncTimeToCron('HH:MM')` → `'M H * * *'` (daily at HH:MM in the
  config's timezone). The scheduler runs `calculateNextRun(cron, timezone)` itself.
- **Worker**: `workers/fetch-rates.worker.ts` consumes `currencies-fetch-rates` with
  payload `{ configId, tenantId, organizationId, provider }`. It bails when the config
  is missing or `isEnabled === false`, then calls `RateFetchingService.fetchRatesForDate`
  for the single provider and writes back `lastSync*` fields.
- **Reconciliation**: `setup.ts seedDefaults` calls `reconcile()` on bootstrap so
  pre-existing enabled configs get their schedules created when the scheduler module
  becomes available. The `mercato currencies reconcile-schedules --tenant <id> --org <id>`
  CLI provides a manual escape hatch.

### Contract

| Property | Value |
|----------|-------|
| Queue name | `currencies-fetch-rates` |
| Required feature | `currencies.fetch.manage` |
| Schedule scope | `organization` |
| Source module | `currencies` |
| Idempotency key | `stableUuidFromString('currencies:fetch-rates:' + configId)` |

## Database Constraints

- Index on `(account_id, period_id, posting_date)` for fast lookups
- Index on document numbers for search
- Index on `vendor_id` and `customer_id` for relationship queries
- Financial postings MUST be atomic — full transaction rollback on error
- Audit trail MUST be immutable — no deletion of posted transactions
