# Agents Guidelines

Leverage the module system and follow strict naming and coding conventions to keep the system consistent and safe to extend.

## Before Writing Code

1. Check the Task Router below — a single task may match multiple rows; read **all** relevant guides
2. Check `.ai/specs/` for existing specs on the module you're modifying
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
| Injecting UI widgets into other modules, defining spot IDs, cross-module UI extensions | `packages/core/AGENTS.md` → Widgets |
| Adding custom fields/entities, using DSL helpers (`defineLink`, `cf.*`), declaring `ce.ts` | `packages/core/AGENTS.md` → Custom Fields |
| Adding entity extensions, cross-module data links, `data/extensions.ts` | `packages/core/AGENTS.md` → Extensions |
| Configuring RBAC features in `acl.ts`, declarative guards, permission checks | `packages/core/AGENTS.md` → Access Control |
| Using encrypted queries (`findWithDecryption`), encryption defaults, GDPR fields | `packages/core/AGENTS.md` → Encryption |
| **Specific Modules** | |
| Managing people/companies/deals/activities, **copying CRUD patterns for new modules** | `packages/core/src/modules/customers/AGENTS.md` |
| Building orders/quotes/invoices, pricing calculations, document flow (Quote→Order→Invoice), shipments/payments, channel scoping | `packages/core/src/modules/sales/AGENTS.md` |
| Managing products/categories/variants, pricing resolvers (`selectBestPrice`), offers, channel-scoped pricing, option schemas | `packages/core/src/modules/catalog/AGENTS.md` |
| Users/roles/RBAC implementation, authentication flow, session management, feature-based access control | `packages/core/src/modules/auth/AGENTS.md` |
| Multi-currency support, exchange rates, dual currency recording, realized gains/losses | `packages/core/src/modules/currencies/AGENTS.md` |
| Workflow automation, defining step-based workflows, executing instances, user tasks, async activities, event triggers, signals, compensation (saga pattern), visual editor | `packages/core/src/modules/workflows/AGENTS.md` |
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
| **Other** | |
| Writing new specs, updating existing specs after implementation, documenting architectural decisions, maintaining changelogs | `.ai/specs/AGENTS.md` |

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Workflow Orchestration

1. **Spec-first**: Enter plan mode for non-trivial tasks (3+ steps or architectural decisions). Check `.ai/specs/` before coding; create SPEC files for new features (`SPEC-{number}-{date}-{title}.md`). Skip for small fixes/improvements.
2. **Subagent strategy**: Use subagents liberally to keep main context clean. Offload research and parallel analysis. One task per subagent.
3. **Self-improvement**: After corrections, update `.ai/lessons.md` or relevant AGENTS.md. Write rules that prevent the same mistake.
4. **Verification**: Run tests, check build, suggest user verification. Ask: "Would a staff engineer approve this?"
5. **Elegance**: For non-trivial changes, pause and ask "is there a more elegant way?" Skip for simple fixes.
6. **Autonomous bug fixing**: When given a bug report, just fix it. Point at logs/errors, then resolve. Zero hand-holding.

### Documentation and Specifications

- Specs live in `.ai/specs/` — see `.ai/specs/AGENTS.md` for naming, structure, and changelog conventions.
- Always check for existing specs before modifying a module. Update specs when implementing significant changes.

## Monorepo Structure

### Apps (`apps/`)

- **mercato**: Main Next.js app. Put user-created modules in `apps/mercato/src/modules/`.
- **docs**: Documentation site.

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

### Where to Put Code

- Put core platform features in `packages/<package>/src/modules/<module>/`
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
| UI primitives | `import { Spinner } from '@open-mercato/ui/primitives/spinner'` |
| API calls (backend pages) | `import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'` |
| CRUD forms | `import { CrudForm } from '@open-mercato/ui/backend/crud'` |

## Conventions

- Modules: plural, snake_case (folders and `id`). Special cases: `auth`, `example`.
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
| `setup.ts` | `setup: ModuleSetupConfig` | Tenant initialization, role features |
| `ce.ts` | `entities` | Custom entities / custom field sets |
| `search.ts` | `searchConfig` | Search indexing configuration |
| `events.ts` | `eventsConfig` | Typed event declarations |
| `notifications.ts` | `notificationTypes` | Notification type definitions |
| `notifications.client.ts` | — | Client-side notification renderers |
| `ai-tools.ts` | `aiTools` | MCP AI tool definitions |
| `data/entities.ts` | — | MikroORM entities |
| `data/validators.ts` | — | Zod validation schemas |
| `data/extensions.ts` | `extensions` | Entity extensions (module links) |
| `widgets/injection/` | — | Injected UI widgets |
| `widgets/injection-table.ts` | — | Widget-to-slot mappings |

### Key Rules

- API routes MUST export `openApi` for documentation generation
- CRUD routes: use `makeCrudRoute` with `indexer: { entityType }` for query index coverage
- setup.ts: always declare `defaultRoleFeatures` when adding features to `acl.ts`
- Custom fields: use `collectCustomFieldValues()` from `@open-mercato/ui/backend/utils/customFieldValues`
- Events: use `createModuleEvents()` with `as const` for typed emit
- Widget injection: declare in `widgets/injection/`, map via `injection-table.ts`
- Generated files: `apps/mercato/.mercato/generated/` — never edit manually
- Run `npm run modules:prepare` after adding/modifying module files

## Critical Rules

### Architecture

- **NO direct ORM relationships between modules** — use foreign key IDs, fetch separately
- Always filter by `organization_id` for tenant-scoped entities
- Never expose cross-tenant data from API handlers
- Use DI (Awilix) to inject services; avoid `new`-ing directly
- Modules must remain isomorphic and independent
- When extending another module's data, add a separate extension entity and declare a link in `data/extensions.ts`

### Data & Security

- Validate all inputs with zod; place validators in `data/validators.ts`
- Derive TypeScript types from zod via `z.infer<typeof schema>`
- Use `findWithDecryption`/`findOneWithDecryption` instead of `em.find`/`em.findOne`
- Never hand-write migrations — update ORM entities, run `yarn db:generate`
- Hash passwords with bcryptjs (cost >=10), never log credentials
- Return minimal error messages for auth (avoid revealing whether email exists)
- RBAC: prefer declarative guards (`requireAuth`, `requireRoles`, `requireFeatures`) in page metadata

### UI & HTTP

- Use `apiCall`/`apiCallOrThrow`/`readApiResultOrThrow` from `@open-mercato/ui/backend/utils/apiCall` — never use raw `fetch`
- For CRUD forms: `createCrud`/`updateCrud`/`deleteCrud` (auto-handle `raiseCrudError`)
- For local validation errors: throw `createCrudFormError(message, fieldErrors?)` from `@open-mercato/ui/backend/utils/serverErrors`
- Read JSON defensively: `readJsonSafe(response, fallback)` — never `.json().catch(() => ...)`
- Use `LoadingMessage`/`ErrorMessage` from `@open-mercato/ui/backend/detail`
- i18n: `useT()` client-side, `resolveTranslations()` server-side
- Never hard-code user-facing strings — use locale files
- Every dialog: `Cmd/Ctrl+Enter` submit, `Escape` cancel
- Keep `pageSize` at or below 100

### Code Quality

- No `any` types — use zod schemas with `z.infer`, narrow with runtime checks
- Prefer functional, data-first utilities over classes
- No one-letter variable names, no inline comments (self-documenting code)
- Don't add docstrings/comments/type annotations to code you didn't change
- Boolean parsing: use `parseBooleanToken`/`parseBooleanWithDefault` from `@open-mercato/shared/lib/boolean`
- Confirm project still builds after changes

## Key Commands

```bash
yarn dev                  # Start development server
yarn build                # Build everything
yarn build:packages       # Build packages only
yarn lint                 # Lint all packages
yarn test                 # Run tests
yarn generate             # Run module generators
yarn db:generate          # Generate database migrations
yarn db:migrate           # Apply database migrations
yarn initialize           # Full project initialization
yarn dev:greenfield       # Fresh dev environment setup
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
