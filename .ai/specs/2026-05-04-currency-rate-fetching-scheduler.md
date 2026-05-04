# Currency Rate Fetching Scheduler

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Created** | 2026-05-04 |
| **Builds on** | `packages/core/src/modules/currencies` (CRUD + RateFetchingService), `packages/scheduler` (ScheduledJob + BullMQ propagation), `packages/core/src/modules/data_sync/lib/sync-schedule-service.ts` (canonical optional-scheduler pattern) |
| **Related** | Issue #407 (Scheduler package, Phase 3 follow-up), Issue #318 item #7 (background fetching) |

## TLDR

**Key Points:**
- Toggling **Currency Rate Fetching** for a provider (NBP / Raiffeisen) currently flips `CurrencyFetchConfig.isEnabled` and `syncTime` but never registers a recurring job — daily fetches simply never run on `main` (v0.5.0). "Fetch Now" still works because it calls `RateFetchingService.fetchRatesForDate` synchronously.
- This spec adds a thin domain wrapper (`fetchScheduleService`) that translates `CurrencyFetchConfig` → `ScheduleRegistration` and persists a `scheduled_jobs` row whenever the config is created/updated/deleted. `ScheduledJobSubscriber` already propagates that row to BullMQ when `QUEUE_STRATEGY=async`.
- A new worker `currencies-fetch-rates` consumes the daily kick and calls `RateFetchingService.fetchRatesForDate` for the single provider on the payload.
- `CurrencyFetchConfig` gains a `timezone` column (default `'UTC'`) so each tenant can pin "09:00" to its locale (e.g. NBP rates publish around 11:45 Europe/Warsaw).

**Scope:**
- Schema: add `currency_fetch_configs.timezone text default 'UTC'`.
- Validators: add optional `timezone` to create/update schemas; refine `syncTime` to be required when `isEnabled === true`.
- New library: `currencies/lib/fetchScheduleService.ts` exposing `syncFromConfig`, `removeForConfig`, `reconcile`. `SchedulerServiceLike` declared inline; never imports from `@open-mercato/scheduler`.
- New worker: `currencies/workers/fetch-rates.worker.ts` (queue: `currencies-fetch-rates`, concurrency 2). Idempotent: bails when config missing or disabled.
- DI: register `currencyFetchScheduleService`; resolve `schedulerService` only when `container.hasRegistration('schedulerService')`.
- Commands: pass `fetchScheduleService` into create/update/delete; call `syncFromConfig` after `persistAndFlush`, `removeForConfig` before `removeAndFlush`.
- API route: resolve `currencyFetchScheduleService` from the container and inject into commands.
- Setup: `seedDefaults` calls `reconcile()` on bootstrap so existing enabled configs get scheduled jobs created when the scheduler module first becomes available.
- UI: add an IANA timezone `<select>` next to the existing time input. Default to `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- CLI: `mercato currencies reconcile-schedules --tenant <id> --org <id>` as the manual escape hatch.
- Tests: `TC-CUR-005-fetch-config-schedule.spec.ts` — toggle enabled → assert `scheduled_jobs` row with expected cron/timezone/queue; toggle disabled → row gone or disabled; delete config → row gone.
- Docs: scheduling section in `currencies/AGENTS.md`; subsection with sequence diagram in `apps/docs/docs/framework/modules/currencies.mdx`.

**Deferred:**
- Tenant-level timezone setting in `directory`/`configs` (broader scope; revisit when more modules need it).
- A full `Custom` provider implementation (the schema already allows it).
- SSE notifications when a daily fetch completes (the existing flash UX is sufficient for v1).

**Concerns:**
- The cross-module touch from `currencies` to `scheduler` looks like a violation of "cross-module side effects via events, never direct function calls" (root `AGENTS.md`). It is not — the canonical upstream pattern (`data_sync`, `integrations`) is to declare scheduler as an *optional* DI dependency and degrade gracefully when absent. We mirror that exactly: no `import` from `@open-mercato/scheduler`, structural `SchedulerServiceLike` only, gated on `container.hasRegistration('schedulerService')`.
- The new queue name (`currencies-fetch-rates`) is intentionally distinct from the legacy `currency-sync` queue used by the v0.4.x worker. Since `main` ships no consumer, this is BC-neutral and avoids name collisions in any downstream that already wired its own.
- Reconciliation runs in `seedDefaults`, which is called during init/onboarding. For tenants that already exist when the scheduler module is enabled, the manual `reconcile-schedules` CLI is the documented path.

## Overview

In the FMS Tier-2 distribution, a customer reported that enabling Currency Rate Fetching produced no daily updates despite the toggle being on. Tracing the call path:

1. UI calls `PUT /api/currencies/fetch-configs` with `isEnabled=true, syncTime='09:00'`.
2. `updateFetchConfig` persists the row.
3. … nothing else. The function returns.

There is no scheduling step at all — `RateFetchingService` is invoked only by the synchronous "Fetch Now" route and by the `currencies` CLI. On `main`, the v0.4.10 `currency-sync.worker.ts` was deleted entirely. The result: `isEnabled=true` is a UI lie.

Issue #407 declared "Phase 3: Currency Integration" as a deliverable for the database-backed scheduler but it shipped without wiring `currencies`. Issue #318 closed without addressing item #7 ("As rates are fetched in background, do they really…?"). Every Tier-2/3 consumer of `@open-mercato/core` is affected.

## Problem Statement

**Symptom:** `CurrencyFetchConfig.isEnabled = true` does not produce daily fetches.

**Root cause:** The fetch-config write path never registers a `scheduled_jobs` row, so `ScheduledJobSubscriber` (which propagates rows into BullMQ) has nothing to propagate.

**Why upstream:** The bug exists in the upstream `@open-mercato/core` currencies module. Patching it in any one downstream means each Tier-2/3 ships its own fix. The natural place to fix it is the same place the `data_sync` module already implemented this pattern.

## Proposed Solution

A new domain wrapper `currencyFetchScheduleService` (in `currencies/lib/fetchScheduleService.ts`) is the only currencies-side touchpoint. It:

1. Receives a `CurrencyFetchConfig` row.
2. Builds a `ScheduleRegistration` payload — deterministic id, cron from `HH:MM`, timezone from the config, queue `currencies-fetch-rates`, payload `{ configId, tenantId, organizationId, provider }`, `requireFeature: 'currencies.fetch.manage'`, `sourceModule: 'currencies'`.
3. Calls `schedulerService.register(...)` (when enabled) or `schedulerService.unregister(scheduleId)` when disabled / deleted.
4. Is a no-op when `schedulerService` is not registered — currencies degrades gracefully.

The fetch-config commands (`create`, `update`, `delete`) accept this service via a `deps` parameter so the API route is the only place that resolves it from the DI container. Commands invoke it AFTER `persistAndFlush` (write order matters: scheduler reads must see the latest entity state).

A new `fetch-rates.worker.ts` consumes the queue. It is intentionally a thin wrapper around `RateFetchingService`:

```typescript
async function handle(job, ctx) {
  const em = ctx.resolve('em')
  const config = await em.findOne(CurrencyFetchConfig, { id, tenantId, organizationId })
  if (!config?.isEnabled) return
  const result = await fetchService.fetchRatesForDate(new Date(), { tenantId, organizationId }, { providers: [provider] })
  // update lastSync* and flush
}
```

The worker is idempotent: it re-reads the config on every run, bails when disabled, and uses `RateFetchingService`'s existing upsert-by-(date,source) semantics.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          packages/core/currencies                             │
│                                                                               │
│  ┌────────────────┐     ┌────────────────────────┐     ┌──────────────────┐ │
│  │ Admin UI       │────▶│ api/fetch-configs      │────▶│ commands/        │ │
│  │ (toggle, time, │     │ (resolves              │     │   fetch-configs  │ │
│  │  timezone)     │     │   currencyFetchSchedule│     │                  │ │
│  └────────────────┘     │   Service from DI)     │     │  ─persist        │ │
│                         └────────────────────────┘     │  ─syncFromConfig │ │
│                                                         │   ▼              │ │
│                                                         │   removeForConfig│ │
│                                                         └────────┬─────────┘ │
│                                                                  │           │
│                         ┌────────────────────────────────────────▼─┐         │
│                         │ lib/fetchScheduleService                  │         │
│                         │  (SchedulerServiceLike — no scheduler     │         │
│                         │   import; resolved via DI cradle)         │         │
│                         └────────────────────────┬──────────────────┘         │
└──────────────────────────────────────────────────┼─────────────────────────────┘
                                                   │ schedulerService.register/unregister
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       packages/scheduler                                       │
│  ┌─────────────────────┐     ┌────────────────────────────┐                   │
│  │ SchedulerService    │────▶│ ScheduledJob (DB)          │                   │
│  │  .register()        │     └────────────┬───────────────┘                   │
│  │  .unregister()      │                  │                                   │
│  └─────────────────────┘     ┌────────────▼───────────────┐                   │
│                              │ ScheduledJobSubscriber     │                   │
│                              │  → BullMQ when             │                   │
│                              │    QUEUE_STRATEGY=async    │                   │
│                              └────────────┬───────────────┘                   │
└───────────────────────────────────────────┼───────────────────────────────────┘
                                            │ daily kick: queue=currencies-fetch-rates
                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  packages/core/currencies/workers                             │
│                                                                               │
│   fetch-rates.worker.ts  ──▶  RateFetchingService.fetchRatesForDate          │
│                          ──▶  update CurrencyFetchConfig.lastSync*           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Data Models

### `CurrencyFetchConfig` — additive change

```diff
  @Property({ name: 'sync_time', type: 'text', nullable: true })
  syncTime?: string | null

+ @Property({ type: 'text', default: 'UTC' })
+ timezone: string = 'UTC'
```

Migration: emitted by `yarn db:generate`. Backfill is automatic via the column default.

### `currencyFetchConfigCreateSchema` / `…UpdateSchema` — additive

```diff
  syncTime: syncTimeSchema.optional(),
+ timezone: timezoneSchema.optional(), // IANA TZ; validated via Intl.DateTimeFormat
```

Plus a `.refine` on both schemas: `isEnabled === true` ⇒ `syncTime` must be set.

### `ScheduledJob` — no change

The scheduler entity is reused as-is. The currencies wrapper writes the following columns:

| Column | Value |
|--------|-------|
| `id` | `stableUuidFromString('currencies:fetch-rates:' + configId)` |
| `name` | `Currencies: fetch rates (<provider>)` |
| `scope_type` | `organization` |
| `schedule_type` | `cron` |
| `schedule_value` | `M H * * *` derived from `syncTime` |
| `timezone` | from `CurrencyFetchConfig.timezone` |
| `target_type` | `queue` |
| `target_queue` | `currencies-fetch-rates` |
| `target_payload` | `{ configId, tenantId, organizationId, provider }` |
| `require_feature` | `currencies.fetch.manage` |
| `source_module` | `currencies` |
| `is_enabled` | from `CurrencyFetchConfig.isEnabled` |

## API Contracts

### `POST /api/currencies/fetch-configs`

- Adds optional `timezone` field on the body.
- Response item gains a `timezone: string` field (always populated; defaults to `'UTC'`).

### `PUT /api/currencies/fetch-configs`

- Adds optional `timezone` field.
- Schema refine: when `isEnabled === true`, `syncTime` must not be `null`.

### `DELETE /api/currencies/fetch-configs?id=…`

- No body change. Side-effect: `scheduled_jobs` row removed.

### `GET /api/scheduler/jobs?sourceModule=currencies`

- Used by the integration test to introspect created schedules. Existing endpoint, no contract change.

## Risks & Impact Review

| Risk | Severity | Affected | Mitigation | Residual |
|------|----------|----------|------------|----------|
| Scheduler module not enabled in some apps | Medium | Apps that don't ship scheduler | Wrapper is no-op when DI registration is absent; "Fetch Now" still works | Daily fetches don't run; user opts in by enabling the scheduler module |
| Old `currency-sync` queue still wired in some downstream | Low | Tier-2/3 forks | New queue name is distinct; old worker (if still present) becomes dead code on its own queue | None — the two queues are independent |
| Wrong timezone breaks NBP fetch (rates publish ~11:45 Warsaw) | Low | Tenants on UTC default | UI defaults to browser TZ; admins can override per-config | Eventual misconfigured TZ produces no rates that day; logged in `lastSyncMessage` |
| `seedDefaults` reconciliation conflicts with concurrent admin edits | Low | First boot after upgrade | `register()` is idempotent (deterministic id) and operates per-config | None |
| Worker concurrency >2 hammers external APIs | Low | NBP, Raiffeisen | Concurrency capped at 2 in `metadata` | None |
| BullMQ unavailable during register | Low | Async deployments | `SchedulerService.register` swallows BullMQ errors, the DB row is the source of truth, periodic re-sync is in scheduler's roadmap | Manual `reconcile-schedules` CLI |

## Migration & Backward Compatibility

1. **Schema additive.** Only adds `currency_fetch_configs.timezone text default 'UTC'`. BC-safe per AGENTS.md "DB schema is additive-only".
2. **Validator additive.** `timezone` optional on both schemas; existing payloads without `timezone` continue to work.
3. **Queue name change.** `currencies-fetch-rates` is new; existing v0.4.x downstreams that still use `currency-sync` keep working — the two queues coexist.
4. **Reconciliation path.** `setup.ts seedDefaults` re-syncs schedules during init. For already-running tenants, the operator runs `mercato currencies reconcile-schedules --tenant <id> --org <id>`.
5. **Rollback.** Drop the `seedDefaults` block; `currencyFetchScheduleService` becomes a no-op when `schedulerService` is unavailable. Existing rows in `scheduled_jobs` can be left to drain or removed via `mercato scheduler unregister <id>`.

## Verification

Run from a clean checkout:

```bash
# 1. Static gates
yarn typecheck
yarn lint
yarn workspace @open-mercato/core test -- --testPathPattern='currencies'

# 2. Migration
yarn db:generate
yarn db:migrate

# 3. Integration (Playwright + ephemeral DB)
yarn test:integration:ephemeral --grep 'TC-CUR-005'

# 4. Manual smoke (QUEUE_STRATEGY=async, Redis up)
QUEUE_STRATEGY=async yarn dev
# Toggle "NBP" enabled with syncTime '09:00', timezone 'Europe/Warsaw' in admin UI.
# psql:
#   SELECT id, schedule_type, schedule_value, timezone, target_queue, is_enabled
#   FROM scheduled_jobs WHERE source_module='currencies';
# Expect 1 row: schedule_value='0 9 * * *', timezone='Europe/Warsaw',
#               target_queue='currencies-fetch-rates', is_enabled=true.
# redis-cli: KEYS bull:currencies-fetch-rates:* should show a repeat job.

# 5. BC check
yarn build
```

## Final Compliance Report

| Category | Check | Status |
|----------|-------|--------|
| Auto-discovery file conventions | Worker file follows `workers/*.ts` + `metadata.queue` contract | ✅ |
| Type definitions | New `CurrencyFetchScheduleService` is exported and used via DI | ✅ |
| Function signatures | Commands accept new optional `deps` parameter (additive) | ✅ |
| Import paths | No `@open-mercato/scheduler` import from `currencies` | ✅ |
| Event IDs | None added/changed | n/a |
| Widget injection spot IDs | None changed | n/a |
| API route URLs | New optional `timezone` field; response gains `timezone` (additive) | ✅ |
| Database schema | Only adds `timezone` column with default | ✅ |
| DI service names | New `currencyFetchScheduleService` (additive) | ✅ |
| ACL feature IDs | Reuses existing `currencies.fetch.manage` | ✅ |
| Notification type IDs | None added/changed | n/a |
| CLI commands | New `currencies reconcile-schedules` (additive) | ✅ |
| Generated file contracts | None changed; will be regenerated by `yarn generate` | ✅ |

## Changelog

- 2026-05-04 — Initial draft.
