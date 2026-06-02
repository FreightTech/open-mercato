# SPEC — `@freighttech/products`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.2 (master-data group; lands FIRST — true leaf, safest starter) |
| **Modules hosted** | `products` (formerly `fms_products`) |
| **Depends on** | `@freighttech/logistics`, `@open-mercato/core`, `@open-mercato/ui` |

## 1. What's inside

```
packages/products/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   └── modules/
│       └── products/              # formerly fms_products
│           ├── __integration__/
│           ├── acl.ts             # feature ids: products.view, products.manage
│           ├── api/
│           ├── backend/
│           ├── cli.ts
│           ├── commands/
│           ├── components/
│           ├── data/
│           │   └── entities.ts    # Product, Carrier
│           ├── (events.ts)        # OPTIONAL — `fms_products` has no events.ts today. Step 1.2 may create one if the author chooses (`products.product.*`, `products.carrier.*`); not required by the migration.
│           ├── index.ts           # metadata.name === 'products' (field is `name`, not `id`)
│           ├── lib/
│           ├── migrations/
│           ├── search.ts          # entity types: products:product, products:carrier (colon + snake_case)
│           ├── services/
│           └── setup.ts
└── generated/
```

DB tables after rename: `products`, `carriers`.

## 2. Why this is the first master-data package to extract

True leaf:

- **Zero outbound cross-module source imports.**
- **Zero entity FKs to other in-scope modules.**
- **Has its own integration test folder** (`__integration__/`).

Inbound importers: `offers` (conversion + RFQ references `Product`), `projects` (`Carrier` FK on `Project`), `folders` (tracking-integration uses `Carrier`). No reverse edges.

Extracting it first validates the packaging template (`package.json`, build scripts, `generated/` emission, `modules.ts` wiring) on the easiest case before facilities (2b) and contractors (2c).

## 3. External dependencies

```jsonc
{
  "name": "@freighttech/products",
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

## 4. Imports that change on the move

```ts
// before
import { logger } from '../../../lib/logger'
import { ActivityPanel } from '../../../lib/activity'

// after
import { logger } from '@freighttech/logistics/lib/logger'
import { ActivityPanel } from '@freighttech/logistics/lib/activity'
```

## 5. `apps/web/src/modules.ts` diff (Step 1.2; in Tier 2)

```diff
- { id: 'fms_products', from: '@open-mercato/fms' },
+ { id: 'products', from: '@freighttech/products' },
```

## 6. Customization patterns

- **Add a pricing engine** by forking. Consumers that don't need it keep upstream.
- **Replace the variant/option data model** without touching contractors or facilities.
- **Ship a carrier-less variant** (some apps don't need `Carrier`) by forking and removing that entity. Module id stays `products`.

## 7. Acceptance

- `yarn workspace @freighttech/products typecheck && yarn workspace @freighttech/products build` green.
- `rg -n "Fms(Product|Carrier)\b" packages/products/src/` returns zero.
- `rg -n "fms_(products|locations|offers|projects|files|invoicing|tasks_board)\b" packages/products/src/` returns zero.
- `rg -n "@open-mercato/(facilities|contractors|offers|projects|invoicing|fms)\b" packages/products/src/` returns zero (only logistics + core + ui + shared permitted).
- `products/__integration__/` tests pass.
- Product + carrier CRUD works end-to-end.
