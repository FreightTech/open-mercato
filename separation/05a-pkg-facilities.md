# SPEC — `@freighttech/facilities`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.2 (master-data group; lands after `products`, before `contractors`) |
| **Modules hosted** | `facilities` (formerly `fms_locations`) |
| **Depends on** | `@freighttech/logistics`, `@open-mercato/core`, `@open-mercato/ui` |

## 1. What's inside

```
packages/facilities/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   └── modules/
│       └── facilities/            # formerly fms_locations
│           ├── acl.ts
│           ├── AGENTS.md
│           ├── api/
│           ├── backend/
│           ├── commands/
│           ├── components/        # GooglePlacesEditor, FacilitySearchInput (was LocationSearchInput), facility editors
│           ├── data/
│           │   ├── entities.ts    # Facility (with `contractor_id` UUID column)
│           │   └── types.ts       # ContractorAddressType, CONTRACTOR_ADDRESS_TYPES, FacilityCodeEntry
│           ├── (events.ts)        # OPTIONAL — `fms_locations` has no events.ts today. Step 1.2 may create one declaring `facilities.facility.*` CRUD events if the author chooses, but the migration does NOT require it. Aspirational; skip unless needed.
│           ├── index.ts           # metadata.name === 'facilities' (field is `name`, not `id`)
│           ├── lib/
│           ├── migrations/
│           ├── search.ts          # entity type: facilities:facility (colon + snake_case)
│           ├── services/
│           ├── setup.ts           # feature ids: facilities.view, facilities.manage
│           └── subscribers/
└── generated/
```

DB table after rename: `facilities` (single table — the module has one entity).

## 2. Why this is a clean leaf

- **No outbound cross-module source imports.** Grep for `from '\.\./\.\./` inside `facilities/` returns nothing pointing at `contractors`, `products`, `offers`, `projects`, `folders`, `invoicing`, or `rfq_board`.
- **Single outbound dep beyond shared: the `contractor_id` UUID column** on `Facility` — plain `@Property`, no TypeScript import of `Contractor`.
- **Inbound importers** after the split: `contractors` (Google Places editor, address types), `offers` (entity FKs, search inputs), `projects` (entity FKs).

## 3. External dependencies

```jsonc
{
  "name": "@freighttech/facilities",
  "dependencies": {
    "@freighttech/logistics": "workspace:*",
    "uuid": "..."
  },
  "peerDependencies": {
    "@mikro-orm/postgresql": "^6.5.9",
    "@open-mercato/core": "^0.5.0",
    "@open-mercato/shared": "^0.5.0",
    "@open-mercato/ui": "^0.5.0",
    "react": "^19.0.0"
  }
}
```

Platform `@open-mercato/*` deps are peer, not regular deps (MIGRATION Part C invariants).

## 4. Imports that change on the move

```ts
// before
import { logger } from '../../../lib/logger'
import { ActivityPanel } from '../../../lib/activity'

// after
import { logger } from '@freighttech/logistics/lib/logger'
import { ActivityPanel } from '@freighttech/logistics/lib/activity'
```

Nothing else changes — no same-package cross-boundary edges to unwind.

## 5. `apps/web/src/modules.ts` diff (Step 1.2; in Tier 2)

```diff
- { id: 'fms_locations', from: '@open-mercato/fms' },
+ { id: 'facilities', from: '@freighttech/facilities' },
```

## 6. Customization patterns

- **Fork.** `@myapp/facilities` with a custom address resolver (Mapbox, internal gazetteer), registered with module id `facilities`.
- **Swap.** A consumer replaces `GooglePlacesEditor` inside their fork without touching contractors or projects.
- **Pin.** Apps with stricter upgrade policy pin `@freighttech/facilities@0.x`.

## 7. Acceptance

- `yarn workspace @freighttech/facilities typecheck && yarn workspace @freighttech/facilities build` green.
- `rg -n "FmsLocation" packages/facilities/src/` returns zero.
- `rg -n "fms_(locations|offers|projects|files|invoicing|products|tasks_board)\b" packages/facilities/src/` returns zero.
- `rg -n "@open-mercato/(contractors|products|offers|projects|invoicing|fms)\b" packages/facilities/src/` returns zero (only `@freighttech/logistics` + core + ui + shared permitted; `@open-mercato/fms` appears nowhere in facilities).
- Facility CRUD works end-to-end.
- Google Places editor renders and saves inside contractor address tab once Step 1.2 lands.
- **Integration tests**: `fms_locations` has **no `__integration__/` directory today** — Step 1.2 optionally adds minimum coverage (facility CRUD; facility search; contractor→facility lookup). If deferred, the acceptance gate for facilities is limited to typecheck + build + manual CRUD verification; full integration coverage can follow in a later PR.
