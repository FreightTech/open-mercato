# MCP Startup: Remove Dead API-Endpoint Indexing

- **Date**: 2026-05-09
- **Status**: Draft
- **Modules**: `ai-assistant` (root cause), `search` (defense-in-depth)
- **Scope**: Cleanup / performance regression
- **Related changelog**: `packages/ai-assistant/AGENTS.md` → "2026-02-22 — Code Mode Tools (search + execute)"

## TLDR

**Key Points**
- Every MCP HTTP / stdio / dev server boot calls `indexApiEndpoints(searchService)`, which `bulkIndex`-fans 597 OpenAPI operations through the vector strategy — but the resulting index has had no live consumer since the Code Mode rewrite (Feb 2026) deleted `find_api`.
- On Digital Ocean (large spec, OpenAI embedding round-trips), this trips the hardcoded 60 s `Promise.race` in `api-endpoint-index.ts:516` and leaves an uncancelled background storm of ~597 embedding + pgvector upsert calls per restart.
- Fix is two-layered: (1) stop calling the dead indexer at MCP startup; (2) make `SearchService.bulkIndex` safe for legitimate large-N callers by giving `VectorSearchStrategy` a real batched `bulkIndex` and dropping the wall-clock timeout.

**Scope**
- Remove `indexApiEndpoints` invocation + dead surrounding code from the three MCP boot paths.
- Delete the legacy MCP tools (`api-discovery-tools.ts`, `entity-graph-tools.ts`) and the `searchEndpoints` / `searchEndpointsFallback` helpers that exist only to back them.
- Implement provider-aware batched embedding in `VectorSearchStrategy.bulkIndex`.
- Replace the per-call `Promise.race(60_000)` pattern in `indexApiEndpoints` (kept only as a public helper for tests / CLI) with a configurable timeout sourced from env, no default ceiling.

**Concerns**
- Need to confirm no out-of-tree consumer relies on the public exports `searchEndpoints` / `endpointToIndexableRecord`. AGENTS.md already labels the legacy tools "kept but unused"; treat the helpers as INTERNAL and document removal in `BACKWARD_COMPATIBILITY.md`.
- Vector batch sizing differs across providers (OpenAI ≤ 2048 inputs/req; Cohere 96; Mistral 32; Ollama 1). Implementation must read provider limits from `EMBEDDING_PROVIDERS` rather than hardcoding.

## Overview

The MCP HTTP server and its stdio/dev variants run a startup task that walks `openapi.generated.json`, converts each operation to an `IndexableRecord`, and calls `searchService.bulkIndex(records)` so a hybrid (fulltext + vector) lookup tool can later locate endpoints by `operationId` or natural-language query.

That tool was `find_api` (and its companions `call_api` / `discover_schema`). The Code Mode rewrite of Feb 2026 (`packages/ai-assistant/AGENTS.md` changelog → "2026-02-22") removed those tools and replaced them with two meta-tools (`search`, `execute`) that read the OpenAPI document **from memory** through `getRawOpenApiSpec()` / `loadRichOpenApiSpec()`. Per the same changelog: *"Files kept but unused: `lib/api-discovery-tools.ts` … remain in the tree but are no longer imported."*

The startup index call survived the rewrite. Its output now writes to fulltext + tokens + vector indexes that the live request path never reads.

> **Reference**: This is the inverse of the standard search-indexing playbook in `packages/search/AGENTS.md` — that doc describes the auto-indexing pipeline for *entity* records, where the resulting index is queried by Cmd+K and module pages. There is no analogous live consumer for the `api_endpoint` entity type used here.

## Problem Statement

### Reported symptom

Operator deployment on Digital Ocean (large monorepo, OpenAPI spec ~597 operations) shows on every MCP HTTP startup:

```
[API Index] Starting bulk index of 597 endpoints...
~60s later: [API Index] Failed to index endpoints: Error: Bulk index timed out after 60000ms
```

### Root-cause trace

1. `http-server.ts:447` (and `mcp-server.ts:196`, `mcp-dev-server.ts:287`) calls `indexApiEndpoints(searchService)` after MCP boot.
2. `api-endpoint-index.ts:485-532` builds `IndexableRecord[]` from 597 operations and calls `searchService.bulkIndex(records)` inside a `Promise.race` against a hardcoded 60 s timeout.
3. `SearchService.bulkIndex` (`packages/search/src/service.ts:223-264`) fans the records to **every available strategy in parallel** via `Promise.allSettled` with no per-strategy budget.
4. Fulltext (Meilisearch bulk) and tokens (one batched SQL upsert) finish in milliseconds.
5. **Vector strategy has no `bulkIndex` method.** `service.ts:234` falls back to `Promise.all(records.map(record => strategy.index(record)))`. `VectorSearchStrategy.index()` (`vector.strategy.ts:107-135`) calls `embeddingService.createEmbedding(text)` then `vectorDriver.upsert(doc)` for each record.
6. Result: **597 simultaneous embedding HTTPS requests** to OpenAI (default provider) plus 597 individual pgvector upserts, every MCP restart. Provider rate limits + DO→OpenAI latency push this past 60 s.
7. The `Promise.race` timeout rejects, the catch block at line 526 logs and returns `records.length`, but **nothing cancels the in-flight `bulkIndex`**. The background storm continues for several minutes after MCP reports "ready", consuming embedding quota and pgvector connections.
8. `lastIndexChecksum` is set to the new value in the catch block, but the variable is process-local — every restart pays the full cost.

### Why no operator-side workaround exists today

Audited every documented configuration knob:

| Operator action | Effect on the storm? | Why not |
|---|---|---|
| Settings > Search → uncheck Vector | ❌ | `enabledStrategies` is read only at query time (`global-search-config.ts`), never by `bulkIndex`. |
| Settings > Embeddings → toggle "Auto-indexing" off | ❌ | `OM_DISABLE_VECTOR_SEARCH_AUTOINDEXING` (and its DB twin `auto_index_enabled`) is consulted only by event subscribers + the queue worker — `indexApiEndpoints` bypasses both. |
| Settings > Embeddings → switch provider to one with no env key | ❌ | DB-stored config is loaded only by request-side routes (`/api/search`, `/api/embeddings`); MCP startup uses the constructor default `openai`. |
| `OM_SEARCH_ENABLED=false` | ❌ | Gates token-search at the query_index layer (`shared/lib/search/config.ts:37`), not the search service or `bulkIndex`. |
| `VECTOR_EMBEDDING_TIMEOUT_MS=2000` | ⚠️ | Each request fails faster, but all 597 still fire. Trades timeout-at-60s for auth-failures-at-3s. |
| Unset `OPENAI_API_KEY` | ✅ | The only env-only fix — but forces the AI-assistant LLM onto Anthropic/Google. Loses semantic search globally. |
| Don't run `yarn mcp:serve` | ✅ | Disables OpenCode Code Mode + Command Palette entirely. |

There is no UI / env path that disables vector indexing on MCP startup while keeping `OPENAI_API_KEY` set for the assistant LLM and keeping fulltext/tokens search enabled. The package itself has to change.

## Proposed Solution

Three coordinated changes, in the order of decreasing leverage:

### Pillar 1 — Stop running dead indexing on the MCP boot path (root cause)

Drop the `indexApiEndpoints` call from all three MCP server entry points. Code Mode reads the OpenAPI document from memory through `getRawOpenApiSpec()` / `loadRichOpenApiSpec()` — those are kept and pre-cached at boot for the `search` Code Mode tool. The hybrid-search index over `api_endpoint` records is removed because it has no live consumer.

Concretely:

- `packages/ai-assistant/src/modules/ai_assistant/lib/http-server.ts:438-465` → remove the `indexApiEndpoints` call and its surrounding `try`/log; keep `indexToolsForSearch(searchService)` and entity-schema indexing (those *do* feed the Code Mode `search` tool).
- `packages/ai-assistant/src/modules/ai_assistant/lib/mcp-server.ts:187-203` → same treatment.
- `packages/ai-assistant/src/modules/ai_assistant/lib/mcp-dev-server.ts:280-295` → same treatment.

### Pillar 2 — Delete the legacy MCP tools and their helpers

Per `packages/ai-assistant/AGENTS.md`, `api-discovery-tools.ts` and `entity-graph-tools.ts` have been "kept but unused" since Feb 2026. The Code Mode rewrite is a year old and stable; carrying these files keeps a misleading import surface and is the only reason the index helpers below still exist.

- Delete `packages/ai-assistant/src/modules/ai_assistant/lib/api-discovery-tools.ts`.
- Delete `packages/ai-assistant/src/modules/ai_assistant/lib/entity-graph-tools.ts`.
- In `packages/ai-assistant/src/modules/ai_assistant/lib/api-endpoint-index.ts`:
  - Remove `indexApiEndpoints`, `searchEndpoints`, `searchEndpointsFallback`, `buildSearchableContent`, `lastIndexChecksum`, and the `Promise.race` block.
  - **Keep** `parseApiEndpoints`, `getApiEndpoints`, `getEndpointByOperationId`, `getRawOpenApiSpec`, `loadRichOpenApiSpec`, `setRawSpecCache`, `clearRawSpecCache`, `clearEndpointCache`, `simplifyRequestBodySchema` — Code Mode reads through these.
- In `packages/ai-assistant/src/modules/ai_assistant/lib/api-endpoint-index-config.ts`:
  - Remove `endpointToIndexableRecord` and `API_ENDPOINT_SEARCH_CONFIG` (search-only).
  - Keep `API_ENDPOINT_ENTITY_ID`, `GLOBAL_TENANT_ID`, `computeEndpointsChecksum` if they have other consumers; otherwise delete them too. Verify with `grep`.
- Update `packages/ai-assistant/AGENTS.md` to remove the "Legacy files kept but unused" line and note the deletion in the Changelog section.
- Update root `BACKWARD_COMPATIBILITY.md` if any of the removed exports are listed as STABLE/ADDITIVE-ONLY surfaces. Document the removal under Generated Files / Auto-discovery contracts as appropriate.

### Pillar 3 — Make `SearchService.bulkIndex` safe for any future large-N caller (defense-in-depth)

Even with the dead caller removed, the `searchService.bulkIndex` contract today silently degrades for vector loads. Any module that legitimately bulk-indexes (reindex jobs, large imports, future first-class endpoint search) would hit the same fan-out. Two changes:

**3a. Real `bulkIndex` on `VectorSearchStrategy`.**

- Add `async bulkIndex(records: IndexableRecord[]): Promise<void>` to `packages/search/src/strategies/vector.strategy.ts`.
- Group records by missing-text (skip) vs. text-bearing.
- Call `embeddingService.createEmbeddings(texts: string[]): Promise<number[][]>` — a new bulk method on `EmbeddingService` that uses the provider's native batch endpoint (OpenAI: array `input`; Mistral: array `inputs`; Cohere: `texts[]`; Google: `embedContent` × n with concurrency cap; Ollama: serial since the local engine accepts one input per call). Provider-specific batch size limits live in `EMBEDDING_PROVIDERS` (`packages/search/src/vector/types.ts`); add `maxBatchInputs?: number` to that table.
- Upsert via a new `vectorDriver.upsertMany(docs)` (pgvector: single `INSERT … ON CONFLICT` with `unnest`; chromadb / qdrant: native batch APIs they already expose).
- Honor `VECTOR_EMBEDDING_TIMEOUT_MS` per *batch*, not per record.

**3b. Drop the wall-clock `Promise.race` from anywhere it survives in shared code.**

- `Promise.race` against an absolute timeout is the wrong shape for bulk work. The legitimate concern (a hung embedding provider) is already handled inside `EmbeddingService.createEmbedding(s)` via `VECTOR_EMBEDDING_TIMEOUT_MS` and provider abort signals. Bulk callers should propagate provider failures up, not impose a second wall-clock budget on top.
- If a future caller wants a global cap, it must compute a count-proportional budget (e.g. `min(60_000, records.length * perRecordCeilingMs)`) and pass an `AbortSignal` through to `searchService.bulkIndex` so the in-flight work is *cancelled*, not orphaned. Add `bulkIndex(records, { signal? })` as an optional parameter and forward to strategies that respect it.

### Design Decisions

| Decision | Rationale |
|---|---|
| Remove rather than fix `indexApiEndpoints` | The index has no live consumer; Code Mode reads the spec from memory. "Fix the storm" would still leave the wasted I/O of 597 unread index writes per restart. |
| Delete `api-discovery-tools.ts` / `entity-graph-tools.ts` | They've been documented as "kept but unused" for ~3 months. Carrying them keeps a misleading import surface and is the sole reason the dead indexing helpers exist. |
| Make `bulkIndex` real on vector strategy | The current `Promise.all(records.map(strategy.index))` fallback is a bug class. Future callers (CRUD bulk reindex, integration-driven imports) would relive this incident. |
| New `signal?: AbortSignal` on `bulkIndex` instead of resurrecting `Promise.race` | A timeout that doesn't cancel its work is a foot-gun. If we ever bound bulk work by wall clock again, do it with cancellation. |

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Move `indexApiEndpoints` off the boot critical path into a background queue job | Still does pointless work on every restart (until a real consumer appears). The right move is to delete the work, not defer it. |
| Wire `OM_DISABLE_VECTOR_SEARCH_AUTOINDEXING` into `searchService.bulkIndex` | Papers over the underlying bug (no real `VectorSearchStrategy.bulkIndex`). Operators get a flag that disables a useful feature instead of a fixed primitive. |
| Add a new env var (`OM_SEARCH_SKIP_VECTOR`) that flips `skipVector: true` at registration | Same paper-over. Also conflates "I don't want vector here" with "the bulk path has a perf bug." |
| Just bump the timeout to 600 s | Doesn't fix the storm — every restart still issues 597 sequentially-bounded embedding requests. Quota burn unchanged; only the alarm in the log is silenced. |

## Architecture

### Before

```
┌────────────────────┐
│ MCP HTTP boot      │
│ (http-server.ts)   │
└─────────┬──────────┘
          │
          ▼
┌──────────────────────────┐
│ indexApiEndpoints()      │  ← always runs
│ Promise.race(60s)        │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ searchService.bulkIndex  │
│ ( 597 records )          │
└────┬────────┬────────────┘
     │        │
     ▼        ▼
fulltext   vector ─── Promise.all(597 × strategy.index) ───► 597 embedding HTTPS calls
tokens                                                      597 individual pgvector upserts
                                                            (continues *after* the 60s timeout)

Code Mode `search` tool ───► reads getRawOpenApiSpec() in-memory  (does not query the index)
```

### After

```
┌────────────────────┐
│ MCP HTTP boot      │
└─────────┬──────────┘
          │
          ▼
┌──────────────────────────┐
│ indexToolsForSearch()    │  ← unchanged, has live consumers
│ pre-cache OpenAPI spec   │  ← already present, kept
└──────────────────────────┘

(no indexApiEndpoints call)

Code Mode `search` tool ───► reads getRawOpenApiSpec() in-memory  (unchanged)

────────────────────────────────────────────────────────

(separately, hardening for future legitimate callers:)

searchService.bulkIndex(records, { signal? })
  │
  ├──► fulltext.bulkIndex     (Meilisearch bulk, unchanged)
  ├──► tokens.bulkIndex       (batched SQL upsert, unchanged)
  └──► vector.bulkIndex       (NEW)
         │
         ├──► chunk(records, EMBEDDING_PROVIDERS[providerId].maxBatchInputs)
         ├──► embeddingService.createEmbeddings(batch)     ← provider-native batch
         └──► vectorDriver.upsertMany(docs)                 ← single round-trip per batch
```

## Data Models

No new entities. No schema migrations. The `api_endpoint` "entity" was a search-index identifier only and is removed alongside the indexing call.

## API Contracts

No new HTTP endpoints. No changes to existing routes. No changes to OpenAPI spec generation.

The internal contract changes are:

| Surface | Change |
|---|---|
| `packages/ai-assistant/src/modules/ai_assistant/lib/api-endpoint-index.ts` exports | Remove: `indexApiEndpoints`, `searchEndpoints`, `searchEndpointsFallback`, `API_ENDPOINT_ENTITY` (the deprecated alias). Keep the rest. |
| `packages/ai-assistant/src/modules/ai_assistant/lib/api-endpoint-index-config.ts` exports | Remove: `endpointToIndexableRecord`, `API_ENDPOINT_SEARCH_CONFIG`. |
| `packages/search/src/types.ts` → `SearchStrategy` interface | `bulkIndex` becomes a required method on vector strategy (still optional in the interface for tokens/fulltext drivers that can rely on the service-level fallback). |
| `packages/search/src/service.ts` → `SearchService.bulkIndex` | New optional second arg: `{ signal?: AbortSignal }`. Old call signature still works. |
| `packages/search/src/vector/services/embedding.ts` → `EmbeddingService` | Add `createEmbeddings(texts: string[]): Promise<number[][]>`. The single-input `createEmbedding` stays. |
| `packages/search/src/vector/types.ts` → `VectorDriver` | Add optional `upsertMany(docs)`. Drivers without it fall back to per-doc `upsert`. |

All removals listed above touch FROZEN/STABLE surfaces only inside the AI-assistant module, which the module's own AGENTS.md already describes as legacy. Non-`ai-assistant` callers were grepped: none in monorepo.

## Internationalization (i18n)

N/A — no user-facing strings change.

## UI/UX

N/A — no UI changes. The Command Palette and the new typed-agent `<AiChat>` surfaces both keep working without modification because neither reads the removed index.

## Configuration

| Env var | Status |
|---|---|
| `VECTOR_EMBEDDING_TIMEOUT_MS` | Kept. Now applies per *batch* in vector `bulkIndex` instead of per record. |
| `OM_DISABLE_VECTOR_SEARCH_AUTOINDEXING` | Unchanged behavior (subscriber + worker gate). Update auto-indexing.ts inline comment to clarify it does not gate `searchService.bulkIndex`. |
| (proposed) `OM_SEARCH_VECTOR_BULK_BATCH_SIZE` | Optional override of the per-provider default. Not added by default — start with provider-table values; introduce only if a customer needs it. |

No new env vars required for the primary fix.

## Migration & Compatibility

- **Backward compatibility**: Public AI-assistant package exports `indexApiEndpoints`, `searchEndpoints`, `searchEndpointsFallback`, `API_ENDPOINT_ENTITY` are removed. The module's own AGENTS.md already labels the consumers ("Legacy files kept but unused"). Per the project's BACKWARD_COMPATIBILITY contract these are inside an internal lib path (`lib/`) and are not part of the third-party developer contract — but follow the deprecation protocol regardless: ship a `@deprecated` shim in the next minor that throws with a migration message pointing at `getRawOpenApiSpec()`, then remove in the minor after.
- **Existing search indexes**: After deploy, the Meilisearch / pgvector / Postgres rows under `entityId = 'api_endpoint'` and `tenantId = '__open_mercato_global__'` (`GLOBAL_TENANT_ID`) become orphaned. Add a one-shot cleanup CLI command (`yarn mercato ai_assistant prune-api-endpoint-index`) that calls `searchService.purge('api_endpoint', GLOBAL_TENANT_ID)` and exit. Mention in the spec changelog and in `packages/ai-assistant/AGENTS.md`.
- **Deploy**: Zero downtime, single-process change. No DB migration. Safe to roll back by reverting the commit.

## Implementation Plan

### Phase 1 — Stop the bleeding (root-cause fix, ship alone if needed)

1. Remove the `indexApiEndpoints` call site from `http-server.ts`, `mcp-server.ts`, `mcp-dev-server.ts`. Keep `indexToolsForSearch` and entity-schema indexing intact.
2. Add a deprecation shim in `api-endpoint-index.ts` for `indexApiEndpoints` / `searchEndpoints` / `searchEndpointsFallback` that logs a once-per-process `console.warn` and forwards to in-memory fallback (or returns 0 for the indexer). Mark `@deprecated`.
3. Update `packages/ai-assistant/AGENTS.md` Changelog and the "Legacy files kept but unused" callout to reflect the new state.
4. Add an integration test that boots the MCP HTTP server with a stubbed search service and asserts `searchService.bulkIndex` is **not** called for the `api_endpoint` entity type.

### Phase 2 — Cleanup (delete legacy)

1. Delete `lib/api-discovery-tools.ts` and `lib/entity-graph-tools.ts`.
2. Delete the deprecation shim from Phase 1, plus `searchEndpoints`, `searchEndpointsFallback`, `endpointToIndexableRecord`, `API_ENDPOINT_SEARCH_CONFIG`, and any helpers exclusive to them. Verify each deletion with a `grep` across `packages/`, `apps/`, and `.ai/skills/`.
3. Add `yarn mercato ai_assistant prune-api-endpoint-index` CLI command (one-shot purge across fulltext / vector / tokens for `api_endpoint` records).
4. Update `packages/ai-assistant/AGENTS.md` directory listing to remove the deleted files.

### Phase 3 — Defense-in-depth in the search package

1. Add `EmbeddingService.createEmbeddings(texts: string[]): Promise<number[][]>` with provider-native batching. Add `maxBatchInputs?: number` to `EMBEDDING_PROVIDERS` and use it. Per-batch timeout uses existing `VECTOR_EMBEDDING_TIMEOUT_MS`. Unit tests cover OpenAI / Mistral / Cohere / Google / Ollama paths with mocked clients.
2. Add `VectorDriver.upsertMany(docs)` to pgvector / chromadb / qdrant. Pgvector uses a single `INSERT … ON CONFLICT (entity_id, record_id, tenant_id) DO UPDATE` over `unnest(...)`. Chromadb / qdrant call their existing batch APIs.
3. Implement `VectorSearchStrategy.bulkIndex(records, { signal? })`. Skip records without text, dedupe by checksum (`computeChecksum`) against the driver's stored checksum to avoid re-embedding unchanged inputs.
4. Extend `SearchService.bulkIndex(records, options?: { signal?: AbortSignal })` to forward the signal. Existing call sites pass nothing; behavior unchanged for them.
5. Integration test: 1 000 record bulk index over a mocked OpenAI client completes in N/`maxBatchInputs` round-trips, and an `AbortSignal` aborts cleanly.

### File Manifest

| File | Action | Purpose |
|---|---|---|
| `packages/ai-assistant/src/modules/ai_assistant/lib/http-server.ts` | Modify | Remove `indexApiEndpoints` call (lines 446-450) and dead try/catch surrounding it. |
| `packages/ai-assistant/src/modules/ai_assistant/lib/mcp-server.ts` | Modify | Remove `indexApiEndpoints` call (lines 195-199). |
| `packages/ai-assistant/src/modules/ai_assistant/lib/mcp-dev-server.ts` | Modify | Remove `indexApiEndpoints` call (lines 286-290). |
| `packages/ai-assistant/src/modules/ai_assistant/lib/api-endpoint-index.ts` | Modify (Phase 1), then Trim (Phase 2) | Phase 1: deprecation shim. Phase 2: delete `indexApiEndpoints`, `searchEndpoints`, `searchEndpointsFallback`, `buildSearchableContent`, `lastIndexChecksum`, `API_ENDPOINT_ENTITY` alias. Keep all `getRawOpenApiSpec` / `parseApiEndpoints` / `simplifyRequestBodySchema` paths. |
| `packages/ai-assistant/src/modules/ai_assistant/lib/api-endpoint-index-config.ts` | Trim | Remove `endpointToIndexableRecord`, `API_ENDPOINT_SEARCH_CONFIG`. Re-grep `API_ENDPOINT_ENTITY_ID`, `GLOBAL_TENANT_ID`, `computeEndpointsChecksum` and remove if unused. |
| `packages/ai-assistant/src/modules/ai_assistant/lib/api-discovery-tools.ts` | Delete | Legacy `find_api`/`call_api` MCP tools, unused since Feb 2026. |
| `packages/ai-assistant/src/modules/ai_assistant/lib/entity-graph-tools.ts` | Delete | Legacy `discover_schema` MCP tool, unused since Feb 2026. |
| `packages/ai-assistant/src/modules/ai_assistant/cli.ts` | Modify | Add `prune-api-endpoint-index` subcommand (Phase 2). |
| `packages/ai-assistant/AGENTS.md` | Modify | Add changelog entry, remove "Legacy files kept but unused" callout, update directory listing. |
| `packages/search/src/strategies/vector.strategy.ts` | Modify | Add real `bulkIndex(records, { signal? })`. |
| `packages/search/src/vector/services/embedding.ts` | Modify | Add `createEmbeddings(texts)`. |
| `packages/search/src/vector/types.ts` | Modify | Add `maxBatchInputs?: number` to `EMBEDDING_PROVIDERS` entries; add optional `upsertMany` on `VectorDriver`. |
| `packages/search/src/vector/drivers/pgvector/index.ts` | Modify | Implement `upsertMany` via `unnest`-based bulk insert. |
| `packages/search/src/vector/drivers/chromadb/index.ts` | Modify | Implement `upsertMany` via batch API. |
| `packages/search/src/vector/drivers/qdrant/index.ts` | Modify | Implement `upsertMany` via batch API. |
| `packages/search/src/service.ts` | Modify | `bulkIndex(records, options?)` accepts `signal`, forwards to strategies. |
| `packages/search/src/types.ts` | Modify | `SearchStrategy.bulkIndex` signature updated to accept the optional options object. |
| `packages/search/src/__tests__/service.test.ts` | Modify | Add bulkIndex with signal + abort case. |
| `packages/search/src/__tests__/embedding.test.ts` | Modify | Add per-provider batch tests. |
| `packages/ai-assistant/src/modules/ai_assistant/__tests__/mcp-boot.test.ts` | Add | Asserts MCP boot does not index `api_endpoint`. |
| `BACKWARD_COMPATIBILITY.md` | Modify | Document the removed exports under "Categorized Removals — AI Assistant lib". |

### Testing Strategy

- **Unit**: per-provider batch in `EmbeddingService.createEmbeddings` with mocked SDK clients. `VectorSearchStrategy.bulkIndex` skips text-less records, dedupes by checksum, propagates AbortSignal.
- **Integration**: MCP HTTP boot with a stub `searchService` whose `bulkIndex` records calls — assert no `entityId === 'api_endpoint'` invocation. Code Mode `search` tool's `spec` global still has paths populated (Tier 1 → Tier 2 fallback).
- **Manual / DO repro**: deploy on a Digital Ocean droplet with the same OpenAPI surface (~597 ops). Confirm boot logs do not contain `[API Index] Starting bulk index of … endpoints`. Confirm OpenAI dashboard shows no embedding spike at deploy time. Confirm MCP `search` tool can still locate endpoints by operationId via JS filtering over `spec.paths`.

## Risks & Impact Review

### Data Integrity Failures

- **Risk**: A consumer outside the monorepo imports `indexApiEndpoints` / `searchEndpoints` and silently breaks after upgrade.
  - **Mitigation**: Phase 1 ships deprecation shims that warn-and-forward, not delete. Phase 2 deletes only after one minor version of warning. Document in `BACKWARD_COMPATIBILITY.md` and `RELEASE_NOTES.md`.
  - **Residual**: Low. The functions are inside `packages/ai-assistant/src/modules/ai_assistant/lib/` (an internal lib path) and the module's own AGENTS.md describes the consumers as legacy.

- **Risk**: Stale `api_endpoint` rows in fulltext / vector / tokens persist after upgrade and waste storage.
  - **Mitigation**: One-shot CLI `yarn mercato ai_assistant prune-api-endpoint-index` (Phase 2). Documented in upgrade notes.
  - **Residual**: Negligible. ~600 rows per tenant; cheap to leave or to purge.

### Cascading Failures & Side Effects

- **Risk**: A future spec resurrects "find endpoint by natural-language query" and assumes the index exists.
  - **Mitigation**: AGENTS.md changelog explicitly records the removal and the rationale (Code Mode reads spec from memory). New consumers must re-introduce indexing as part of their own scope.
  - **Residual**: Low. Discoverable via grep + changelog.

### Tenant & Data Isolation Risks

N/A — the removed code wrote to a synthetic global tenant (`GLOBAL_TENANT_ID = '__open_mercato_global__'`) that was never used per-tenant. No change to per-tenant isolation.

### Migration & Deployment Risks

- **Risk**: Deploy lands in a long-running deployment that has half-written `api_endpoint` rows (from the previous storm) and a new boot that doesn't write any. The orphaned rows linger until the prune CLI is run.
  - **Mitigation**: The rows are entityId-scoped, never referenced by any live query path post-Pillar-1, and don't affect operator workflows. CLI prune is best-effort cleanup, not a correctness requirement.
  - **Residual**: None operationally; cosmetic only.

### Operational Risks

- **Risk**: Phase 3 introduces a new `bulkIndex` with batched embeddings. A bug here would degrade legitimate search reindex jobs.
  - **Mitigation**: Phase 3 ships behind unit + integration tests with mocked providers. Roll out separately from Phase 1/2 so the urgent root-cause fix isn't blocked by Phase 3 stability.
  - **Residual**: Medium during Phase 3 rollout; mitigated by phased ship.

- **Risk**: The OpenCode Docker image references API discovery tool names in its `opencode.json` config and breaks once they're deleted.
  - **Mitigation**: `opencode.json` only references the MCP server URL + auth headers per `packages/ai-assistant/AGENTS.md`. Tool names are discovered at runtime via MCP `tools/list`. Verified.
  - **Residual**: None.

### Risk Register

| ID | Severity | Area | Scenario | Mitigation | Residual |
|---|---|---|---|---|---|
| R1 | Low | DX | Out-of-tree consumer of `indexApiEndpoints` breaks on upgrade | Phase 1 deprecation shim (1 minor warning) → Phase 2 delete | Low |
| R2 | Negligible | Storage | Orphaned `api_endpoint` rows in search backends | Phase 2 prune CLI | Negligible |
| R3 | Medium | Search reindex perf | Phase 3 `bulkIndex` regression on large-N reindex | Mocked-provider tests; ship separately from Phase 1/2 | Low post-rollout |
| R4 | Low | Discoverability | Future "find endpoint by NL query" feature assumes index exists | Spec changelog + AGENTS.md callout | Low |

## Final Compliance Report

| Rule | Status | Notes |
|---|---|---|
| Singular naming | ✅ N/A — no new entities. |
| FK IDs only across modules | ✅ N/A. |
| Organization ID on scoped entities | ✅ N/A — only synthetic global "tenant" was used; being removed. |
| Undoability for state changes | ✅ Removal is reversible by reverting the commit; orphan rows pruned by CLI. |
| Zod validation on inputs | ✅ N/A — no new API surfaces. |
| Encryption maps for sensitive data | ✅ N/A — no PII touched. |
| `makeCrudRoute` / `apiCall` / `useGuardedMutation` | ✅ N/A — no new routes/forms. |
| Design System tokens | ✅ N/A — no UI changes. |
| Backward compatibility | ⚠️ Documented in `BACKWARD_COMPATIBILITY.md`; deprecation shim in Phase 1 satisfies the protocol. |
| Module isolation | ✅ Changes stay inside `ai-assistant` (Pillars 1+2) and `search` (Pillar 3). No cross-module ORM. |

## Changelog

- **2026-05-09**: Initial spec drafted. Root cause traced to dead `indexApiEndpoints` call at MCP startup (live consumer deleted in the Code Mode rewrite, Feb 2026). Three-pillar fix: remove dead call site, delete legacy MCP tools, give `VectorSearchStrategy` a real batched `bulkIndex` for future legitimate callers.
