# Agents Guidelines

Leverage the module system and follow strict naming and coding conventions to keep the system consistent and safe to extend.

## Before Writing Code

1. Check the Task Router below — a single task may match multiple rows; read **all** relevant guides.
2. Check `.ai/specs/` and `.ai/specs/enterprise/` for existing specs on the module you're modifying
3. Enter plan mode for non-trivial tasks (3+ steps or architectural decisions)
4. Identify the reference module (customers) if building CRUD features

## Task Router — Where to Find Detailed Guidance

IMPORTANT: Before any research or coding, match the task to the root `AGENTS.md` Task Router table. A single task often maps to **multiple rows** — for example, "add a new module with search" requires both the Module Development and Search guides. Read **all** matching guides before starting. They contain the imports, patterns, and constraints you need. Only use Explore agents for topics not covered by any existing AGENTS.md.

| Task | Guide |
|------|-------|
| **Module Development** | |
| Creating a new module, scaffolding module files, auto-discovery paths | `packages/core/AGENTS.md` |
| Building CRUD API routes, adding OpenAPI specs, using `makeCrudRoute`, query engine integration | `packages/core/AGENTS.md` → API Routes |
| Adding `setup.ts` for tenant init, declaring role features, seeding defaults/examples | `packages/core/AGENTS.md` → Module Setup |
| Declaring typed events with `createModuleEvents`, emitting CRUD/lifecycle events, adding event subscribers | `packages/core/AGENTS.md` → Events |
| Adding in-app notifications, subscriber-based alerts, writing notification renderers | `packages/core/AGENTS.md` → Notifications |
| Adding reactive notification handlers (`notifications.handlers.ts`), `useNotificationEffect`, auto side-effects on notification arrival | `packages/core/AGENTS.md` → Notifications + `packages/ui/AGENTS.md` |
| Injecting UI widgets into other modules, defining spot IDs, cross-module UI extensions | `packages/core/AGENTS.md` → Widgets |
| Building headless injection widgets (menu items, columns, fields), using `InjectionPosition`, or `useInjectionDataWidgets` | `packages/core/AGENTS.md` → Widget Injection + `packages/ui/AGENTS.md` |
| Injecting menu items into main/settings/profile sidebars or topbar/profile dropdown (`useInjectedMenuItems`, `mergeMenuItems`) | `packages/ui/AGENTS.md` |
| Adding API route interceptors (`api/interceptors.ts`, before/after hooks, body/query rewrite contracts) | `packages/core/AGENTS.md` → API Interceptors |
| Adding DataTable extension widgets (columns/row actions/bulk actions/filters) | `packages/core/AGENTS.md` → Widget Injection + `packages/ui/AGENTS.md` → DataTable Guidelines |
| Adding CrudForm field injection widgets (`crud-form:<entityId>:fields`) | `packages/core/AGENTS.md` → Widget Injection + `packages/ui/AGENTS.md` → CrudForm Guidelines |
| Replacing or wrapping UI components via `widgets/components.ts` (`replace`/`wrapper`/`props`) | `packages/core/AGENTS.md` → Component Replacement + `packages/ui/AGENTS.md` |
| Adding custom fields/entities, using DSL helpers (`defineLink`, `cf.*`), declaring `ce.ts` | `packages/core/AGENTS.md` → Custom Fields |
| Adding entity extensions, cross-module data links, `data/extensions.ts` | `packages/core/AGENTS.md` → Extensions |
| Configuring RBAC features in `acl.ts`, declarative guards, permission checks | `packages/core/AGENTS.md` → Access Control |
| Fixing wildcard ACL handling in feature-gated runtime helpers (menu items, nav sections, notification handlers, mutation guards, command interceptors, AI tools) | `packages/core/AGENTS.md` → Access Control + `packages/shared/AGENTS.md` + `packages/ui/AGENTS.md` + `packages/core/src/modules/auth/AGENTS.md` (+ `packages/core/src/modules/customer_accounts/AGENTS.md` for portal/customer RBAC) |
| Using encrypted queries (`findWithDecryption`), encryption defaults, GDPR fields | `packages/core/AGENTS.md` → Encryption |
| Adding response enrichers to enrich other modules' API responses | `packages/core/AGENTS.md` → Response Enrichers |
| Filtering CRUD list APIs by multiple IDs (`?ids=uuid1,uuid2`), including interceptor-driven ID narrowing | `packages/core/AGENTS.md` → API Interceptors + `packages/shared/AGENTS.md` |
| Adding DOM Event Bridge (SSE-based real-time events to browser), `useAppEvent`, `useOperationProgress` | `packages/events/AGENTS.md` → DOM Event Bridge |
| Building customer portal pages, portal auth, portal nav injection, portal event bridge | `packages/ui/AGENTS.md` → Portal Extension |
| Adding new widget event handlers (`onFieldChange`, `onBeforeNavigate`, transformers) | `packages/ui/AGENTS.md` |
| **Specific Modules** | |
| Managing people/companies/deals/activities, **copying CRUD patterns for new modules** | `packages/core/src/modules/customers/AGENTS.md` |
| Building orders/quotes/invoices, pricing calculations, document flow (Quote→Order→Invoice), shipments/payments, channel scoping | `packages/core/src/modules/sales/AGENTS.md` |
| Managing products/categories/variants, pricing resolvers (`selectBestPrice`), offers, channel-scoped pricing, option schemas | `packages/core/src/modules/catalog/AGENTS.md` |
| Users/roles/RBAC implementation, authentication flow, session management, feature-based access control | `packages/core/src/modules/auth/AGENTS.md` |
| Customer identity, customer portal auth (login/signup/magic links), customer RBAC, sessions, CRM auto-linking, admin user management | `packages/core/src/modules/customer_accounts/AGENTS.md` |
| Multi-currency support, exchange rates, dual currency recording, realized gains/losses | `packages/core/src/modules/currencies/AGENTS.md` |
| Workflow automation, defining step-based workflows, executing instances, user tasks, async activities, event triggers, signals, compensation (saga pattern), visual editor | `packages/core/src/modules/workflows/AGENTS.md` |
| Integration Marketplace foundation (registry/bundles, credentials, state, health checks, logs, admin UI, integration manifests) | `packages/core/src/modules/integrations/AGENTS.md` |
| Data Sync hub (adapters, run lifecycle, workers, mapping APIs, scheduled sync, progress linkage, admin UI) | `packages/core/src/modules/data_sync/AGENTS.md` |
| Building outbound/inbound webhooks, Standard Webhooks signing, delivery queues, webhook admin UI, marketplace webhook settings | `packages/webhooks/AGENTS.md` + `packages/queue/AGENTS.md` + `packages/events/AGENTS.md` + `packages/core/src/modules/integrations/AGENTS.md` + `packages/ui/AGENTS.md` |
| KSeF invoicing (RodzajFaktury form sections, FA(3) XML blocks, per-type validators, submission flow) | `packages/ksef/AGENTS.md` + `packages/ksef/src/modules/ksef/docs/invoice-types.md` |
| Building a new integration provider module (adapter, health check, credentials, bundle wiring) | `packages/core/src/modules/integrations/AGENTS.md` + `packages/core/src/modules/data_sync/AGENTS.md` + `.ai/skills/integration-builder/SKILL.md` + `.ai/specs/implemented/SPEC-041-2026-02-24-universal-module-extension-system.md` + `.ai/specs/implemented/SPEC-045-2026-02-24-integration-marketplace.md` + `.ai/specs/implemented/SPEC-045c-payment-shipping-hubs.md` (+ `.ai/specs/implemented/SPEC-044-2026-02-24-payment-gateway-integrations.md` for payment providers) |
| Wiring progress UX for long-running sync operations (top bar polling, job lifecycle, future SSE bridge) | `packages/core/src/modules/data_sync/AGENTS.md` + `packages/events/AGENTS.md` |
| **Packages** | |
| Adding reusable utilities, encryption helpers, i18n translations (`useT`/`resolveTranslations`), boolean parsing, data engine types, request scoping | `packages/shared/AGENTS.md` |
| Building forms (`CrudForm`), data tables (`DataTable`), loading/error states, flash messages, `FormHeader`/`FormFooter`, dialog UX (`Cmd+Enter`/`Escape`) | `packages/ui/AGENTS.md` |
| Backend page components, `apiCall` usage, `RowActions` ids, `LoadingMessage`/`ErrorMessage` | `packages/ui/src/backend/AGENTS.md` |
| Writing integration tests for DynamicTable (selectors, edit flows, perspectives, pitfalls) | `/test-dynamic-table` skill |
| Configuring fulltext/vector/token search, writing `search.ts`, reindexing entities, debugging search, search CLI commands | `packages/search/AGENTS.md` |
| Adding MCP tools (`registerMcpTool`), modifying OpenCode config, debugging AI chat, session tokens, command palette, two-tier auth | `packages/ai-assistant/AGENTS.md` |
| Running generators (`yarn generate`), creating database migrations (`yarn db:generate`), scaffolding modules, build order | `packages/cli/AGENTS.md` |
| Event bus architecture, ephemeral vs persistent subscriptions, queue integration for events, event workers | `packages/events/AGENTS.md` |
| Adding cache to a module, tag-based invalidation, tenant-scoped caching, choosing strategy (memory/SQLite/Redis) | `packages/cache/AGENTS.md` |
| Adding background workers, configuring concurrency (I/O vs CPU-bound), idempotent job processing, queue strategies | `packages/queue/AGENTS.md` |
| Adding onboarding wizard steps, tenant setup hooks (`onTenantCreated`/`seedDefaults`), welcome/invitation emails | `packages/onboarding/AGENTS.md` |
| Adding static content pages (privacy policies, terms, legal pages) | `packages/content/AGENTS.md` |
| Testing standalone apps with Verdaccio, publishing packages, canary releases, template scaffolding | `packages/create-app/AGENTS.md` |
| **Testing** | |
| Integration testing, creating/running Playwright tests, converting markdown test cases to TypeScript, CI test pipeline | `.ai/qa/AGENTS.md` + `.ai/skills/integration-tests/SKILL.md` |
| **Spec Lifecycle** | |
| Analyzing a spec before implementation: BC impact, risk assessment, gap analysis, readiness report | `.ai/skills/pre-implement-spec/SKILL.md` |
| Implementing a spec (or specific phases) with coordinated agents, unit tests, docs, progress tracking | `.ai/skills/implement-spec/SKILL.md` |
| Writing new specs, updating existing specs after implementation, documenting architectural decisions, maintaining changelogs | `.ai/specs/AGENTS.md` |
| Reviewing code changes for architecture, security, conventions, and quality compliance | `.ai/skills/code-review/SKILL.md` |
| Migrating hardcoded colors/typography to semantic tokens, analyzing DS violations, scaffolding DS-compliant pages, reviewing DS compliance | `.ai/skills/ds-guardian/SKILL.md` |
| Reviewing a GitHub PR by number (checkout, code-review, submit review, apply label) | `.ai/skills/review-pr/SKILL.md` |
| Scanning open PRs for merge readiness, listing what can be merged now, triaging blockers | `.ai/skills/merge-buddy/SKILL.md` |
| Day-start review triage: reviewing all unreviewed PRs (newest first) in one session | `.ai/skills/review-prs/SKILL.md` |

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Workflow Orchestration

1.  **Spec-first**: Enter plan mode for non-trivial tasks (3+ steps or architectural decisions). Check `.ai/specs/` and `.ai/specs/enterprise/` before coding; create spec files using scope-appropriate naming (`{date}-{title}.md` for OSS and enterprise, with `date` as `YYYY-MM-DD` and `title` as kebab-case). Skip for small fixes.
    -   **Detailed Workflow**: Refer to the **`spec-writing` skill** for research, phasing, and architectural review standards (`.ai/skills/spec-writing/SKILL.md`).
    -   **Pre-implementation analysis**: Before implementing a complex spec, run the **`pre-implement-spec` skill** to audit backward compatibility, identify gaps, and produce a readiness report.
    -   **Implementation**: Use the **`implement-spec` skill** to execute spec phases with coordinated subagents, unit tests, progress tracking, and code-review compliance gates.
2.  **Subagent strategy**: Use subagents liberally to keep main context clean. Offload research and parallel analysis. One task per subagent.
3.  **Self-improvement**: After corrections, update `.ai/lessons.md` or relevant AGENTS.md. Write rules that prevent the same mistake.
4.  **Verification**: Run tests, check build, suggest user verification. Ask: "Would a staff engineer approve this?"
5.  **Elegance**: For non-trivial changes, pause and ask "is there a more elegant way?" Skip for simple fixes.
6.  **Autonomous bug fixing**: When given a bug report, just fix it. Point at logs/errors, then resolve. Zero hand-holding.

## PR Workflow

- Pipeline labels are mutually exclusive: `review`, `changes-requested`, `qa`, `qa-failed`, `merge-queue`, `blocked`, `do-not-merge`.
- Category labels are additive: `bug`, `feature`, `refactor`, `security`, `dependencies`, `enterprise`, `documentation`.
- Meta labels are additive: `needs-qa`, `skip-qa`, `in-progress`.
- A ready non-draft PR should carry `review` unless it is already in another pipeline state.
- `review-pr` MUST move approved PRs to `qa` when `needs-qa` is present and `skip-qa` is absent; otherwise it MUST move them to `merge-queue`.
- `review-pr` MUST move review failures to `changes-requested`.
- `needs-qa` is for UI changes, new features, sales or order flows, and other customer-facing behavior that needs manual exercise.
- `skip-qa` is for docs-only, dependency-only, CI-only, test-only, typo-only, or similarly low-risk non-customer-facing changes.
- Auto-skills that mutate PRs or issues MUST claim them first with all three signals: assignee, `in-progress` label, and a claim comment. They MUST release the `in-progress` label when finished, even on failure.
- When an auto-skill adds or changes a PR pipeline/meta label, it MUST also leave a short PR comment explaining why that label was applied.
- Use `gh` for manual QA transitions:

```bash
# QA pass
gh pr edit <number> --remove-label "qa" --add-label "merge-queue"

# QA fail
gh pr edit <number> --remove-label "qa" --add-label "qa-failed"

# Re-request QA after a fix
gh pr edit <number> --remove-label "qa-failed" --add-label "qa"
```

### Documentation and Specifications

- OSS specs live in `.ai/specs/`; commercial/enterprise specs live in `.ai/specs/enterprise/` — see `.ai/specs/AGENTS.md` for naming, structure, and changelog conventions.
- Always check for existing specs before modifying a module. Update specs when implementing significant changes.
- For every new feature, the spec MUST list integration coverage for all affected API paths and key UI paths.
- For every new feature, implement the integration tests defined in the spec as part of the same change — see `.ai/qa/AGENTS.md` for the workflow.
- Integration tests MUST be self-contained: create required fixtures in test setup (prefer API fixtures), clean up created records in teardown/finally, and remain stable without relying on seeded/demo data.

## Monorepo Structure

### Apps (`apps/`)

-   **mercato**: Main Next.js app. Put user-created modules in `apps/mercato/src/modules/`.
-   **docs**: Documentation site.

### Packages (`packages/`)

All packages use the `@open-mercato/<package>` naming convention:

| Package | Import | When to use |
|---------|--------|-------------|
| **shared** | `@open-mercato/shared` | When you need cross-cutting utilities, types, DSL helpers, i18n, data engine |
| **ui** | `@open-mercato/ui` | When building UI components, forms, data tables, backend pages |
| **core** | `@open-mercato/core` | When working on core business modules (auth, catalog, customers, sales) |
| **cli** | `@open-mercato/cli` | When adding CLI tooling or generator commands |
| **cache** | `@open-mercato/cache` | When adding caching — resolve via DI, never use raw Redis/SQLite |
| **queue** | `@open-mercato/queue` | When adding background jobs — use worker contract, never custom queues |
| **events** | `@open-mercato/events` | When adding event-driven side effects between modules |
| **search** | `@open-mercato/search` | When configuring search indexing (fulltext, vector, tokens) |
| **ai-assistant** | `@open-mercato/ai-assistant` | When working on AI assistant or MCP server tools |
| **content** | `@open-mercato/content` | When adding static content pages (privacy, terms, legal) |
| **onboarding** | `@open-mercato/onboarding` | When modifying setup wizards or tenant provisioning flows |
| **enterprise** | `@open-mercato/enterprise` | When working on commercial enterprise-only modules and overlays |

### Where to Put Code

- Put core platform features in `packages/<package>/src/modules/<module>/`
- Put every external integration provider in a dedicated npm workspace package under `packages/<provider-package>/` (for example `packages/gateway-stripe`, `packages/carrier-inpost`) — do not add provider modules inside `packages/core/src/modules/`
- Put shared utilities and types in `packages/shared/src/lib/` or `packages/shared/src/modules/`
- Put UI components in `packages/ui/src/`
- Put user/app-specific modules in `apps/mercato/src/modules/<module>/`
- MUST NOT add code directly in `apps/mercato/src/` — it's a boilerplate for user apps

### When You Need an Import

| Need | Import |
|------|--------|
| Command pattern (undo/redo) | `import { registerCommand } from '@open-mercato/shared/lib/commands'` |
| Server-side translations | `import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'` |
| Client-side translations | `import { useT } from '@open-mercato/shared/lib/i18n/context'` |
| Data engine types | `import type { DataEngine } from '@open-mercato/shared/lib/data/engine'` |
| Search config types | `import type { SearchModuleConfig } from '@open-mercato/shared/modules/search'` |
| Injection positioning | `import { InjectionPosition } from '@open-mercato/shared/modules/widgets/injection-position'` |
| Headless injection widgets hook | `import { useInjectionDataWidgets } from '@open-mercato/ui/backend/injection/useInjectionDataWidgets'` |
| Menu injection hook | `import { useInjectedMenuItems } from '@open-mercato/ui/backend/injection/useInjectedMenuItems'` |
| Component replacement hook | `import { useRegisteredComponent } from '@open-mercato/ui/backend/injection/useRegisteredComponent'` |
| UI primitives | `import { Spinner } from '@open-mercato/ui/primitives/spinner'` |
| API calls (backend pages) | `import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'` |
| CRUD forms | `import { CrudForm } from '@open-mercato/ui/backend/crud'` |
| API interceptor types | `import type { ApiInterceptor } from '@open-mercato/shared/lib/crud/api-interceptor'` |
| Response enricher types | `import type { ResponseEnricher } from '@open-mercato/shared/lib/crud/response-enricher'` |
| App event hook | `import { useAppEvent } from '@open-mercato/ui/backend/injection/useAppEvent'` |
| Event bridge hook | `import { useEventBridge } from '@open-mercato/ui/backend/injection/eventBridge'` |
| Operation progress hook | `import { useOperationProgress } from '@open-mercato/ui/backend/injection/useOperationProgress'` |
| Broadcast event check | `import { isBroadcastEvent } from '@open-mercato/shared/modules/events'` |
| Portal broadcast event check | `import { isPortalBroadcastEvent } from '@open-mercato/shared/modules/events'` |
| Portal customer auth hook | `import { useCustomerAuth } from '@open-mercato/ui/portal/hooks/useCustomerAuth'` |
| Portal tenant context hook | `import { useTenantContext } from '@open-mercato/ui/portal/hooks/useTenantContext'` |
| Portal shell (layout) | `import { PortalShell } from '@open-mercato/ui/portal/PortalShell'` |
| Portal menu injection hook | `import { usePortalInjectedMenuItems } from '@open-mercato/ui/portal/hooks/usePortalInjectedMenuItems'` |
| Portal event bridge hook | `import { usePortalEventBridge } from '@open-mercato/ui/portal/hooks/usePortalEventBridge'` |
| Portal app event hook | `import { usePortalAppEvent } from '@open-mercato/ui/portal/hooks/usePortalAppEvent'` |
| Customer auth types | `import type { CustomerAuthContext } from '@open-mercato/shared/modules/customer-auth'` |
| Customer auth server (cookies) | `import { getCustomerAuthFromCookies } from '@open-mercato/core/modules/customer_accounts/lib/customerAuthServer'` |

Import strategy:
- Prefer package-level imports (`@open-mercato/<package>/...`) over deep relative imports (`../../../...`) when crossing module boundaries, referencing shared module internals, or importing from deeply nested files.
- Keep short relative imports for same-folder/local siblings (`./x`, `../x`) where they are clearer than package paths.

## Conventions

- Modules: plural, snake_case (folders and `id`). Special cases: `auth`, `example`.
- **Event IDs**: `module.entity.action` (singular entity, past tense action, e.g., `pos.cart.completed`). use dots as separators.
- `clientBroadcast: true` in EventDefinition bridges events to browser via SSE (DOM Event Bridge)
- `portalBroadcast: true` in EventDefinition bridges events to customer portal via SSE (Portal Event Bridge)
- JS/TS fields and identifiers: camelCase.
- Database tables and columns: snake_case; table names plural.
- Common columns: `id`, `created_at`, `updated_at`, `deleted_at`, `is_active`, `organization_id`, `tenant_id`.
- UUID PKs, explicit FKs, junction tables for many-to-many.
- Keep code minimal and focused; avoid side effects across modules.
- Keep modules self-contained; re-use common utilities via `src/lib/`.

## Module Development Quick Reference

All paths use `src/modules/<module>/` as shorthand. See `packages/core/AGENTS.md` for full details.

### Auto-Discovery Paths

- Frontend pages: `frontend/<path>.tsx` → `/<path>`
- Backend pages: `backend/<path>.tsx` → `/backend/<path>` (special: `backend/page.tsx` → `/backend/<module>`)
- API routes: `api/<method>/<path>.ts` → `/api/<path>` (dispatched by method)
- Subscribers: `subscribers/*.ts` — export default handler + `metadata` with `{ event, persistent?, id? }`
- Workers: `workers/*.ts` — export default handler + `metadata` with `{ queue, id?, concurrency? }`

### Optional Module Files

| File | Export | Purpose |
|------|--------|---------|
| `index.ts` | `metadata` | Module metadata |
| `cli.ts` | default | CLI commands |
| `di.ts` | `register(container)` | DI registrar (Awilix) |
| `acl.ts` | `features` | Feature-based permissions |
| `setup.ts` | `setup: ModuleSetupConfig` | Tenant initialization, role features, customer role features |
| `ce.ts` | `entities` | Custom entities / custom field sets |
| `search.ts` | `searchConfig` | Search indexing configuration |
| `events.ts` | `eventsConfig` | Typed event declarations |
| `translations.ts` | `translatableFields` | Translatable field declarations per entity |
| `notifications.ts` | `notificationTypes` | Notification type definitions |
| `notifications.client.ts` | — | Client-side notification renderers |
| `generators.ts` | `generatorPlugins` | Generator plugin declarations for additional aggregated output files |
| `ai-tools.ts` | `aiTools` | MCP AI tool definitions |
| `api/interceptors.ts` | `interceptors` | API route interception hooks (before/after) |
| `data/entities.ts` | — | MikroORM entities |
| `data/validators.ts` | — | Zod validation schemas |
| `data/extensions.ts` | `extensions` | Entity extensions (module links) |
| `widgets/injection/` | — | Injected UI widgets |
| `widgets/injection-table.ts` | — | Widget-to-slot mappings |
| `widgets/components.ts` | `componentOverrides` | Component replacement/wrapper/props override definitions |
| `data/enrichers.ts` | `enrichers` | Response enrichers for data federation |

### Key Rules

- API routes MUST export `openApi` for documentation generation
- CRUD routes: use `makeCrudRoute` with `indexer: { entityType }` for query index coverage
- Write operations: implement via the Command pattern (see `packages/core/src/modules/customers/commands/*`)
- Feature naming convention: `<module>.<action>` (e.g., `example.view`, `example.create`).
- setup.ts: always declare `defaultRoleFeatures` when adding features to `acl.ts`
- Every module with guarded routes or pages MUST declare features in `acl.ts` — never ship an empty `acl.ts` with `requireRoles` guards
- Custom fields: use `collectCustomFieldValues()` from `@open-mercato/ui/backend/utils/customFieldValues`
- Events: use `createModuleEvents()` with `as const` for typed emit
- Translations: when adding entities with user-facing text fields (title, name, description, label), create `translations.ts` at module root declaring translatable fields. Run `yarn generate` after adding.
- Widget injection: declare in `widgets/injection/`, map via `injection-table.ts`
- API interception: declare interceptors in `api/interceptors.ts`; keep hooks fail-closed and scoped by route + method
- Interceptors that narrow CRUD list results SHOULD prefer rewriting `query.ids` (comma-separated UUID list) instead of post-filtering response arrays
- Component replacement: use handle-based IDs (`page:*`, `data-table:*`, `crud-form:*`, `section:*`) for deterministic overrides
- Generated files: `apps/mercato/.mercato/generated/` — never edit manually
- Enable modules in your app’s `src/modules.ts` (e.g. `apps/mercato/src/modules.ts`)
- Run `yarn generate` after adding/modifying module files
- Agents MUST automatically run `yarn mercato configs cache structural --all-tenants` after enabling/disabling modules in `src/modules.ts`, adding/removing backend or frontend pages, or changing sidebar/navigation injection — stale `nav:*` cache can hide structural changes until it is purged
- New integration providers MUST own their env-backed preconfiguration inside the provider package: implement preset reading/application in the provider module, apply it from `setup.ts`, expose a rerunnable provider CLI command when practical, and document the env variables. Do not add provider-specific preconfiguration logic to core modules.

## Backward Compatibility Contract

> **Full specification**: [`BACKWARD_COMPATIBILITY.md`](BACKWARD_COMPATIBILITY.md) — MUST be read before modifying any contract surface.

Third-party module developers depend on stable platform APIs. Any change to a **contract surface** is a breaking change that blocks merge unless the deprecation protocol is followed.

**Deprecation protocol** (summary): (1) never remove in one release, (2) add `@deprecated` JSDoc, (3) provide a bridge (re-export/alias/dual-emit) for ≥1 minor version, (4) document in RELEASE_NOTES.md, (5) reference a spec with "Migration & Backward Compatibility" section.

**13 contract surface categories** (details in `BACKWARD_COMPATIBILITY.md`):

| # | Surface | Classification | Key Rule |
|---|---------|---------------|----------|
| 1 | Auto-discovery file conventions | FROZEN | File names, export names, routing algorithms immutable |
| 2 | Type definitions & interfaces | STABLE | Required fields cannot be removed/narrowed; optional additive-only |
| 3 | Function signatures | STABLE | Cannot remove/reorder params; new optional params OK |
| 4 | Import paths | STABLE | Moved modules must re-export from old path |
| 5 | Event IDs | FROZEN | Cannot rename/remove; payload fields additive-only |
| 6 | Widget injection spot IDs | FROZEN | Cannot rename/remove; context fields additive-only |
| 7 | API route URLs | STABLE | Cannot rename/remove; response fields additive-only |
| 8 | Database schema | ADDITIVE-ONLY | No column/table rename/remove; new columns with defaults OK |
| 9 | DI service names | STABLE | Cannot rename registration keys |
| 10 | ACL feature IDs | FROZEN | Stored in DB; rename requires data migration |
| 11 | Notification type IDs | FROZEN | Referenced by subscribers and stored in DB |
| 12 | CLI commands | STABLE | Cannot rename/remove commands or required flags |
| 13 | Generated file contracts | STABLE | Export names and `BootstrapData` shape immutable |

## Critical Rules

### Architecture

-   **NO direct ORM relationships between modules** — use foreign key IDs, fetch separately
-   Always filter by `organization_id` for tenant-scoped entities
-   Never expose cross-tenant data from API handlers
-   Use DI (Awilix) to inject services; avoid `new`-ing directly
-   Modules must remain isomorphic and independent
-   When extending another module's data, add a separate extension entity and declare a link in `data/extensions.ts`

### Data & Security

-   Validate all inputs with zod; place validators in `data/validators.ts`
-   Derive TypeScript types from zod via `z.infer<typeof schema>`
-   Use `findWithDecryption`/`findOneWithDecryption` instead of `em.find`/`em.findOne`
-   Never hand-write migrations — update ORM entities, run `yarn db:generate`
-   Hash passwords with bcryptjs (cost >=10), never log credentials
-   Return minimal error messages for auth (avoid revealing whether email exists)
-   RBAC: prefer declarative guards (`requireAuth`, `requireFeatures`) in page metadata; avoid `requireRoles` — role names are mutable and can be spoofed; use feature-based guards with immutable IDs from `acl.ts` instead
-   Portal RBAC: use `requireCustomerAuth` and `requireCustomerFeatures` in page metadata for portal pages

### UI & HTTP

-   Use `apiCall`/`apiCallOrThrow`/`readApiResultOrThrow` from `@open-mercato/ui/backend/utils/apiCall` — never use raw `fetch`
-   If a backend page cannot use `CrudForm`, wrap every write (`POST`/`PUT`/`PATCH`/`DELETE`) in `useGuardedMutation(...).runMutation(...)` and include `retryLastMutation` in the injection context
-   For CRUD forms: `createCrud`/`updateCrud`/`deleteCrud` (auto-handle `raiseCrudError`)
-   For local validation errors: throw `createCrudFormError(message, fieldErrors?)` from `@open-mercato/ui/backend/utils/serverErrors`
-   Read JSON defensively: `readJsonSafe(response, fallback)` — never `.json().catch(() => ...)`
-   Use `LoadingMessage`/`ErrorMessage` from `@open-mercato/ui/backend/detail`
-   i18n: `useT()` client-side, `resolveTranslations()` server-side
-   Never hard-code user-facing strings — use locale files
-   Every dialog: `Cmd/Ctrl+Enter` submit, `Escape` cancel
-   Keep `pageSize` at or below 100

### Code Quality

- No `any` types — use zod schemas with `z.infer`, narrow with runtime checks
- Prefer functional, data-first utilities over classes
- No one-letter variable names, no inline comments (self-documenting code)
- Don't add docstrings/comments/type annotations to code you didn't change
- Boolean parsing: use `parseBooleanToken`/`parseBooleanWithDefault` from `@open-mercato/shared/lib/boolean`
- Confirm project still builds after changes

## Design System Rules

### Colors
- NEVER use hardcoded Tailwind colors for status semantics (`text-red-*`, `bg-green-*`, `text-emerald-*`, `bg-blue-*`, `text-amber-*`, etc.)
- USE semantic tokens: `text-status-error-text`, `bg-status-success-bg`, `border-status-warning-border`, `text-status-info-icon`
- Status token structure: `{property}-status-{status}-{role}` where status = error|success|warning|info|neutral and role = bg|text|border|icon
- For destructive actions (buttons, not status display): use existing `destructive` token (`text-destructive`, `bg-destructive`)
- All status tokens have dedicated dark mode values — NO `dark:` overrides needed

### Typography
- NEVER use arbitrary text sizes (`text-[11px]`, `text-[13px]`, `text-[15px]`)
- USE Tailwind scale: `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px), `text-xl` (20px), `text-2xl` (24px)
- For 11px uppercase labels: use `text-overline` (custom token)
- Exception: `text-[9px]` for notification badge count (single use case)

### Typography Hierarchy
| Role | HTML | Tailwind | When to use |
|------|------|----------|-------------|
| Page title | `<h1>` | `text-2xl font-bold tracking-tight` | Page header (one per page) |
| Section title | `<h2>` | `text-xl font-semibold` | Major sections |
| Subsection | `<h3>` | `text-sm font-semibold` | Detail page sections, card titles |
| Body | `<p>` | `text-sm` | Default body text |
| Body large | `<p>` | `text-base` | Emphasized body |
| Caption | `<span>` | `text-xs text-muted-foreground` | Secondary info, timestamps |
| Label | `<label>` | `text-sm font-medium` | Form labels (via Label component) |
| Overline | `<span>` | `text-overline font-semibold uppercase tracking-wider` | Section labels, category tags |
| Code | `<code>` | `text-sm font-mono` | Code snippets |

### Feedback
- USE `Alert` for inline messages — NOT `Notice` (deprecated)
- USE `flash()` for transient toast messages
- USE `useConfirmDialog()` for destructive action confirmation
- Every list/data page MUST handle empty state via `<EmptyState>` or `emptyState` prop on DataTable
- Every async page MUST show loading state via `<LoadingMessage>`, `<Spinner>`, or `<DataLoader>`
- Alert variants: `default`, `destructive` (error), `success`, `warning`, `info`

### Status Display
- USE `StatusBadge` for entity status display — NEVER hardcode colors on Badge
- Define a `StatusMap` per entity type in your module:
```typescript
import type { StatusMap } from '@open-mercato/ui/primitives/status-badge'

const dealStatusMap: StatusMap<'open' | 'won' | 'lost'> = {
  open: 'info',
  won: 'success',
  lost: 'error',
}
```

### Forms
- USE `FormField` wrapper for standalone forms (portal, auth, custom pages)
- CrudForm handles field layout internally — do NOT wrap CrudForm fields in FormField
- Every input MUST have a visible label (never placeholder-only)
- Error messages use `text-status-error-text` (FormField handles this automatically)

### Icons
- USE `lucide-react` for ALL icons — NEVER inline `<svg>` elements
- Icon sizes: `size-3` (12px), `size-4` (16px, default), `size-5` (20px), `size-6` (24px)
- Stroke width: 2 (lucide default) — do NOT override per-instance
- Icon-only buttons MUST have `aria-label`

### Sections
- USE `SectionHeader` for detail page section headers (title + count + action)
- USE `CollapsibleSection` when section content should be collapsible

### Components — quick reference
| I need to... | Use this |
|---|---|
| Show an error/success/warning message inline | `<Alert variant="destructive\|success\|warning\|info">` |
| Show a toast notification | `flash('message', 'success\|error\|warning\|info')` |
| Confirm a destructive action | `useConfirmDialog()` |
| Display entity status (active, draft, etc.) | `<StatusBadge variant={statusMap[status]} dot>` |
| Wrap a form field with label + error | `<FormField label="..." error={...}>` |
| Build a section header with count + action | `<SectionHeader title="..." count={n} action={...}>` |
| Build a collapsible section | `<CollapsibleSection title="...">content</CollapsibleSection>` |

### Reference Implementation
When building a new module UI, use the **customers module** as reference:
- List page: `packages/core/src/modules/customers/backend/customers/people/page.tsx`
- Detail page: `packages/core/src/modules/customers/backend/customers/people/[id]/page.tsx`
- Create page: `packages/core/src/modules/customers/backend/customers/people/create/page.tsx`
- Status mapping: `packages/core/src/modules/customers/components/formConfig.tsx`

### Boy Scout Rule
When modifying a file that contains hardcoded status colors (`text-red-*`, `bg-green-*`, etc.) or arbitrary text sizes (`text-[11px]`), you MUST migrate at minimum the lines you touched to semantic tokens.

## Key Commands

```bash
yarn dev                  # Start compact dev runtime; press `d` to toggle raw logs
yarn dev:verbose          # Start dev runtime with full raw passthrough logs
yarn dev:app              # Start compact app-only runtime
yarn dev:app:verbose      # Start app-only runtime with raw passthrough logs
yarn build                # Build everything
yarn build:packages       # Build packages only
yarn lint                 # Lint all packages
yarn test                 # Run tests
yarn generate             # Run module generators
yarn db:generate          # Generate database migrations
yarn db:migrate           # Apply database migrations
yarn initialize           # Full project initialization
yarn dev:greenfield       # Fresh compact dev boot with build/generate/reinstall stages
yarn dev:greenfield:verbose  # Greenfield boot with full raw passthrough logs
yarn test:integration     # Run integration tests (Playwright, headless)
yarn test:integration:report  # View HTML test report
```

**Configuration (`.mcp.json`):**
```json
{
  "mcpServers": {
    "open-mercato": {
      "type": "http",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "x-api-key": "omk_your_api_key_here"
      }
    }
  }
}
```

**Environment variables:**
- `MCP_DEV_PORT` - Port (default: 3001)
- `MCP_DEBUG` - Enable debug logging (`true`/`false`)

#### Production Server (`yarn mcp:serve`)
For web-based AI chat. Requires two-tier authentication: server API key + user session tokens.

```bash
# Requires MCP_SERVER_API_KEY in .env
yarn mcp:serve
```

**Environment variables:**
- `MCP_SERVER_API_KEY` - Required. Static API key for server-level auth.

#### Comparison

| Feature | Dev (`mcp:dev`) | Production (`mcp:serve`) |
|---------|-----------------|-------------------------|
| Auth | API key only | API key + session tokens |
| Permission check | Once at startup | Per tool call |
| Session tokens | Not required | Required (`_sessionToken`) |
| Use case | Claude Code, local dev | Web AI chat interface |

### Session Management
- Chat sessions use ephemeral API keys that inherit the user's permissions.
- Session tokens are created when a new chat starts and expire after **2 hours** of inactivity.
- When a session expires, tool calls return a `SESSION_EXPIRED` error with a user-friendly message.
- The AI will receive: `"Your chat session has expired. Please close and reopen the chat window to continue."`
- The AI should relay this message naturally to the user without mentioning technical details like tokens.

### MCP CLI Commands

```bash
# Run development server (Claude Code / local dev)
yarn mcp:dev

# Run production server (web AI chat)
yarn mcp:serve

# List all available MCP tools
yarn mercato ai_assistant mcp:list-tools

# List tools with descriptions
yarn mercato ai_assistant mcp:list-tools --verbose
```

### Key Files
- Dev server: `packages/ai-assistant/src/modules/ai_assistant/lib/mcp-dev-server.ts`
- Production server: `packages/ai-assistant/src/modules/ai_assistant/lib/http-server.ts`
- Session creation: `packages/ai-assistant/src/modules/ai_assistant/api/chat/route.ts`
- Session validation: `packages/ai-assistant/src/modules/ai_assistant/lib/http-server.ts`
- API key service: `packages/core/src/modules/api_keys/services/apiKeyService.ts`
- CLI commands: `packages/ai-assistant/src/modules/ai_assistant/cli.ts`

## Brand Customization

The platform supports multi-tenant/white-label branding with per-brand theme colors, sidebar module visibility, and navbar customization. Brands are detected by domain and configured statically in `src/brands/`.

### Architecture Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| Brand Types | `src/brands/types.ts` | TypeScript interfaces for brand configuration |
| Brand Registry | `src/brands/registry.ts` | Brand definitions with domain mappings |
| Domain Detection | `src/proxy.ts` | Middleware that sets `x-brand-id` header |
| Theme Provider | `packages/ui/src/theme/ThemeProvider.tsx` | Injects CSS variables for brand colors |
| Backend Layout | `src/app/(backend)/backend/layout.tsx` | Applies theme and filters sidebar |
| Nav API | `packages/core/src/modules/auth/api/admin/nav.ts` | Client-side nav refresh with brand filtering |

### Brand Configuration Structure

```typescript
// src/brands/types.ts
interface BrandConfig {
  id: string                    // Unique identifier (e.g., 'freighttech')
  name: string                  // Display name
  productName: string           // Shown in sidebar header
  logo: { src, width, height, alt }
  domains: string[]             // Domains mapped to this brand

  theme?: {
    colors?: BrandThemeColors   // Base colors (applied to both modes)
    light?: BrandThemeColors    // Light mode specific (merged on top of base)
    dark?: BrandThemeColors     // Dark mode specific (merged on top of base)
  }

  layout?: {
    sidebar?: {
      hiddenModules?: string[]   // URL path segments to hide
      hiddenGroups?: string[]    // Navigation group IDs to hide
    }
    navbar?: {
      hideSearch?: boolean       // Hide global search
      hideOrgSwitcher?: boolean  // Hide organization switcher
    }
  }
}

// BrandThemeColors (same structure for colors, light, and dark)
interface BrandThemeColors {
  // Main colors
  background?: string
  foreground?: string
  primary?: string
  primaryForeground?: string
  accent?: string
  accentForeground?: string
  // Sidebar colors
  sidebar?: string
  sidebarForeground?: string
  sidebarPrimary?: string
  sidebarAccent?: string
  // Muted and borders
  muted?: string
  mutedForeground?: string
  border?: string
  // ... more color options
}
```

**Theme Mode Support:** Colors are merged in order: `colors` (base) → `light` or `dark` (mode-specific). Mode-specific values take precedence over base colors. This allows brands to define separate color schemes for light and dark modes.

### Domain Configuration via Environment Variables

Brand domains can be configured via environment variables instead of hardcoding them in the registry. This is useful for different deployment environments (staging, production, etc.).

| Environment Variable | Brand | Default Value |
|---------------------|-------|---------------|
| `OPENMERCATO_DOMAINS` | Open Mercato | `localhost,127.0.0.1,open-mercato.freighttech.org` |
| `FREIGHTTECH_DOMAINS` | FreightTech | `freighttech.org,freighttech.localhost,fms.freighttech.org` |
| `INF_DOMAINS` | INF Shipping | `inf.localhost,inf.freighttech.org` |

**Format:** Comma-separated list of domains (spaces around commas are trimmed).

**Example `.env` configuration:**
```bash
OPENMERCATO_DOMAINS=localhost,127.0.0.1,app.example.com
FREIGHTTECH_DOMAINS=freighttech.example.com,fms.example.com
INF_DOMAINS=inf.example.com,infshipping.com
```

If an environment variable is not set, the default hardcoded domains are used.

### How to Add/Modify a Brand

1. **Edit `src/brands/registry.ts`** to add or modify brand configuration:

```typescript
const myBrand: BrandConfig = {
  id: 'mybrand',
  name: 'My Brand',
  productName: 'My Product',
  logo: {
    src: '/mybrand-logo.png',
    width: 32,
    height: 32,
    alt: 'My Brand',
  },
  domains: ['mybrand.com', 'mybrand.localhost'],
  theme: {
    // Base colors shared across both modes
    colors: {
      accent: 'oklch(0.55 0.18 250)',         // Blue accent for brand identity
      accentForeground: 'oklch(0.98 0 0)',
    },
    // Light mode specific
    light: {
      primary: 'oklch(0.45 0.15 250)',
      sidebar: 'oklch(0.97 0.01 250)',
      sidebarPrimary: 'oklch(0.45 0.15 250)',
    },
    // Dark mode specific (optional - if not specified, base colors apply)
    dark: {
      primary: 'oklch(0.60 0.15 250)',
      sidebar: 'oklch(0.18 0.02 250)',
      sidebarPrimary: 'oklch(0.60 0.15 250)',
    },
  },
  layout: {
    sidebar: {
      hiddenModules: ['audit_logs', 'docs'],
      hiddenGroups: ['entities.nav.group'],
    },
    navbar: {
      hideOrgSwitcher: true,
    },
  },
}

// Add to brands array
export const brands: BrandConfig[] = [
  openMercatoBrand,
  freighttechBrand,
  myBrand,  // Add here
]
```

2. **Add logo file** to `public/` directory

3. **Test** by accessing the app via the configured domain

### Available Hidden Modules (`hiddenModules`)

Use the **URL path segment** (not module ID) in the `hiddenModules` array:

| URL Path | Module ID | Description |
|----------|-----------|-------------|
| `dashboards` | `dashboards` | Main dashboard |
| `users` | `auth` | User management |
| `roles` | `auth` | Role management |
| `api-keys` | `api_keys` | API key management |
| `directory` | `directory` | Organizations, Tenants |
| `customers` | `customers` | CRM (Companies, People, Deals) |
| `catalog` | `catalog` | Product catalog |
| `sales` | `sales` | Sales management |
| `entities` | `entities` | Data Designer |
| `audit-logs` | `audit_logs` | Audit logging |
| `docs` | `api_docs` | API documentation |
| `booking` | `booking` | Booking/Scheduling |
| `business-rules` | `business_rules` | Business rules engine |
| `workflows` | `workflows` | Workflows |
| `feature-toggles` | `feature_toggles` | Feature flags |
| `currencies` | `currencies` | Currencies & Exchange rates |
| `dictionaries` | `dictionaries` | Dictionaries |
| `attachments` | `attachments` | File attachments |
| `content` | `content` | Content management |
| `shipments` | `shipments` | Shipments |
| `fms-tracking` | `fms_tracking` | FMS Tracking |
| `contractors` | `contractors` | FMS Contractors |
| `fms-offers` | `fms_offers` | FMS Offers |
| `fms-locations` | `fms_locations` | FMS Locations |
| `fms-products` | `fms_products` | FMS Products |
| `example` | `example` | Example module |

**Note:** URL paths use hyphens (`audit-logs`), module IDs use underscores (`audit_logs`). The filtering normalizes both, so you can use either format.

### Available Hidden Groups (`hiddenGroups`)

| Group ID | Display Name | Contains |
|----------|--------------|----------|
| `customers.nav.group` | Customers | Companies, People, Deals |
| `catalog.nav.group` | Catalog | Products, Categories |
| `customers~sales.nav.group` | Sales | Quotes, Orders, Channels |
| `entities.nav.group` | Data Designer | System Entities, User Entities, Query Indexes |
| `directory.nav.group` | Directory | Organizations, Tenants |
| `customers.storage.nav.group` | Storage | Attachments |
| `auth.nav.group` | Auth | Users, Roles, API Keys |
| `booking.nav.group` | Booking | Resources, Services, Teams |
| `currencies.nav.group` | Currencies | Currencies, Exchange Rates |
| `rules.nav.group` | Business Rules | Rules, Rule Sets |

### Theme Colors (CSS Variables)

Colors are applied as CSS custom properties. Use any valid CSS color format (hex, rgb, oklch, etc.):

| Property | CSS Variable | Description |
|----------|--------------|-------------|
| `background` | `--background` | Main background |
| `foreground` | `--foreground` | Main text color |
| `primary` | `--primary` | Primary action color |
| `primaryForeground` | `--primary-foreground` | Text on primary |
| `accent` | `--accent` | Accent/highlight color |
| `accentForeground` | `--accent-foreground` | Text on accent |
| `sidebar` | `--sidebar` | Sidebar background |
| `sidebarForeground` | `--sidebar-foreground` | Sidebar text |
| `sidebarPrimary` | `--sidebar-primary` | Sidebar active item |
| `sidebarAccent` | `--sidebar-accent` | Sidebar hover state |
| `border` | `--border` | Border color |
| `card` | `--card` | Card background |
| `muted` | `--muted` | Muted backgrounds |
| `mutedForeground` | `--muted-foreground` | Muted text |

### Example: FreightTech Brand Configuration

```typescript
const freighttechBrand: BrandConfig = {
  id: 'freighttech',
  name: 'FreightTech',
  productName: 'FreightTech',
  logo: {
    src: '/fms/freighttech-logo.png',
    width: 32,
    height: 32,
    alt: 'FreightTech',
  },
  domains: ['freighttech.org', 'freighttech.localhost'],
  theme: {
    colors: {
      primary: 'oklch(0.45 0.15 250)',
      primaryForeground: 'oklch(0.98 0 0)',
      accent: 'oklch(0.94 0.03 250)',
      sidebar: 'oklch(0.97 0.01 250)',
      sidebarForeground: 'oklch(0.20 0.02 250)',
      sidebarPrimary: 'oklch(0.45 0.15 250)',
      sidebarAccent: 'oklch(0.92 0.03 250)',
    },
  },
  layout: {
    sidebar: {
      hiddenModules: ['audit_logs', 'docs', 'example'],
      hiddenGroups: ['entities.nav.group', 'booking.nav.group'],
    },
    navbar: {
      hideOrgSwitcher: true,
    },
  },
}
```
- Tool loader: `packages/ai-assistant/src/modules/ai_assistant/lib/tool-loader.ts`

### Module AI Tools

Modules can expose AI tools via MCP by creating an `ai-tools.ts` file. Tools are **auto-discovered** by the generator - no manual registration required.

**File location**: `src/modules/<module>/ai-tools.ts` (for packages: `packages/<package>/src/modules/<module>/ai-tools.ts`)

**Structure**:
```typescript
import { z } from 'zod'
import type { AiToolDefinition } from '@open-mercato/ai-assistant'

export const aiTools: AiToolDefinition[] = [
  {
    name: 'module_action',          // No dots allowed, use underscores
    description: 'What this tool does',
    inputSchema: z.object({
      param: z.string().describe('Parameter description'),
    }),
    requiredFeatures: ['module.feature'],  // ACL features required
    handler: async (input, ctx) => {
      const service = ctx.container.resolve('myService')
      return { success: true }
    },
  },
]
```

**Registration flow**:
1. Create `ai-tools.ts` in your module
2. Run `npm run modules:prepare` (generates `ai-tools.generated.ts`)
3. Tools are automatically loaded at MCP server startup

**Generated file**: `apps/mercato/.mercato/generated/ai-tools.generated.ts`

**Example**: See `packages/search/src/modules/search/ai-tools.ts` for search-related tools.

### MCP Tools Reference

The AI assistant exposes 4 core tools via MCP for understanding and interacting with the system:

#### `entity_context` - Get full context for an entity

Use when you need to understand a database entity (fields, relationships, API endpoints).

**Input:** `{ "entity": "SalesOrder" }`

**Output:**
- `entity.fields` - All columns with types and nullability
- `relationships` - Array of triples: `(Entity)-[TYPE:property]->(Target)`
- `endpoints` - CRUD operations with paths and operationIds

**Example usage:**
```
"I need to create a sales order"
-> Call entity_context("SalesOrder")
-> Get fields + POST endpoint
-> Call api_execute with the endpoint
```

#### `schema_overview` - Discover entities and relationships

Use for high-level exploration: what entities exist, how they relate.

**Input:**
- `{ }` - Get all entities grouped by module
- `{ "module": "sales" }` - Filter to one module
- `{ "includeGraph": true }` - Include relationship triples

**Output:**
- `stats` - Total entities, relationships, modules
- `entities` - Entities grouped by module
- `graph` - Relationship triples (if requested)

**Example usage:**
```
"What entities are in the sales module?"
-> Call schema_overview({ module: "sales" })
```

#### `api_discover` - Search API endpoints

Use to find endpoints by natural language query. Returns schema summary.

**Input:** `{ "query": "create order", "method": "POST" }`

**Output:** Matching endpoints with:
- `path`, `method`, `operationId`
- `requestBody` - Schema with required fields and types

**Example usage:**
```
"How do I update a customer?"
-> Call api_discover({ query: "update customer" })
```

#### `api_execute` - Call an API endpoint

Use to execute API operations after discovering the endpoint.

**Input:**
```json
{
  "method": "POST",
  "path": "/api/sales/orders",
  "body": { "customerId": "...", "lines": [...] }
}
```

**Workflow pattern:**
1. `entity_context` or `api_discover` -> understand the API
2. `api_execute` -> make the call

### Relationship Triple Format

Relationships are always expressed as triples:
```
(SourceEntity)-[RELATIONSHIP_TYPE:propertyName]->(TargetEntity)
```

Types:
- `BELONGS_TO` - ManyToOne (e.g., OrderLine belongs to Order)
- `HAS_MANY` - OneToMany (e.g., Order has many Lines)
- `HAS_ONE` - OneToOne owner
- `BELONGS_TO_ONE` - OneToOne inverse
- `HAS_MANY_MANY` / `BELONGS_TO_MANY` - ManyToMany

The `?` suffix indicates nullable: `(Order)-[BELONGS_TO?:channel]->(Channel)`

## Event Module Configuration

Modules that emit events must declare them in an `events.ts` file for type safety, runtime validation, and workflow trigger discovery.

### Creating Module Events

**File**: `src/modules/<module>/events.ts`

```typescript
import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  { id: 'customers.people.created', label: 'Customer (Person) Created', entity: 'people', category: 'crud' },
  { id: 'customers.people.updated', label: 'Customer (Person) Updated', entity: 'people', category: 'crud' },
  { id: 'customers.people.deleted', label: 'Customer (Person) Deleted', entity: 'people', category: 'crud' },
  // Lifecycle events can be excluded from workflow triggers
  { id: 'customers.pricing.resolve.before', label: 'Before Pricing Resolve', category: 'lifecycle', excludeFromTriggers: true },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'customers',
  events,
})

// Export typed emit function for use in commands
export const emitCustomersEvent = eventsConfig.emit

// Export event IDs as a type for external use
export type CustomersEventId = typeof events[number]['id']

export default eventsConfig
```

### Event Definition Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Event identifier (pattern: `module.entity.action`) |
| `label` | Yes | Human-readable label for UI |
| `description` | No | Optional detailed description |
| `category` | No | `'crud'` \| `'lifecycle'` \| `'system'` \| `'custom'` |
| `entity` | No | Associated entity name |
| `excludeFromTriggers` | No | If `true`, hidden from workflow trigger selection |

### TypeScript Enforcement

Using `as const` with the events array provides compile-time safety:

```typescript
// ✅ Compiles - event is declared
emitCustomersEvent('customers.people.created', { id: '123', tenantId: 'abc' })

// ❌ TypeScript error - event not declared
emitCustomersEvent('customers.people.exploded', { id: '123' })
```

### Runtime Validation

Undeclared events trigger runtime warnings:
```
[events] Module "customers" tried to emit undeclared event "customers.people.exploded".
Add it to the module's events.ts file first.
```

### Auto-Discovery

Events are auto-discovered by generators and registered via `generated/events.generated.ts`. Run `npm run modules:prepare` after creating or modifying `events.ts` files.

### UI Integration

Use the `EventSelect` component from `@open-mercato/ui/backend/inputs/EventSelect` for event selection. It fetches declared events via the `/api/events` endpoint.
