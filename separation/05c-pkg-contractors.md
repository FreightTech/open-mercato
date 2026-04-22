# SPEC — `@freighttech/contractors`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.2 (master-data group; lands AFTER `products` and `facilities`; includes E4) |
| **Modules hosted** | `contractors` (module id unchanged — already prefix-free) |
| **Depends on** | `@freighttech/logistics`, `@freighttech/facilities`, `@open-mercato/core`, `@open-mercato/ui` |

## 1. What's inside

```
packages/contractors/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   └── modules/
│       └── contractors/
│           ├── __integration__/
│           ├── acl.ts             # feature ids: contractors.view, contractors.manage
│           ├── api/
│           ├── backend/
│           ├── cli.ts
│           ├── commands/
│           ├── components/        # ContractorFacilitiesTab (was ContractorLocationsTab), ContractorHighlights, …
│           ├── data/              # Contractor, ContractorAddress, ContractorContact (unchanged class names)
│           ├── (events.ts)        # OPTIONAL — `contractors` has no events.ts today. Step 1.2 may create one (`contractors.contractor.*`); not required.
│           ├── hooks/
│           ├── i18n/
│           ├── index.ts           # metadata.name === 'contractors' (field is `name`, not `id`)
│           ├── lib/
│           ├── migrations/
│           ├── search.ts          # entity types: contractors:contractor, contractors:contractor_address, contractors:contractor_contact, … (colon + snake_case; unchanged — module id already prefix-free)
│           ├── services/
│           └── setup.ts
└── generated/
```

DB tables stay with unprefixed names (already that way today): `contractors`, `contractor_addresses`, `contractor_contacts`.

## 2. Why this lands last of the three

`contractors` has the highest outbound coupling of the three master-data modules:

- **Source dep on `facilities`** — `ContractorFacilitiesTab.tsx` (renamed from `ContractorLocationsTab.tsx`) imports `createGooglePlacesEditor` from `facilities/components/`; the activity API reads `ContractorAddressType`, `CONTRACTOR_ADDRESS_TYPES`, and `Facility` from `facilities/data/`. That's why 2b lands first.
- **Legacy source dep on `projects` (via old `FmsProject`)** — `contractors/api/contractors/[id]/activity/route.ts` today imports `FmsProject`. Step 1.2 **must** cut this before extraction (§4). Otherwise `contractors` would depend on `projects`, which breaks the leaf topology.

Inbound importers after the split: `offers` (RFQ intake + conversion reference `Contractor`), `projects` (multiple FKs: `client_id`, `notify_party_id`, …), `invoicing` (**runtime lookup from backend pages** — no ORM FK, since invoice entities hold party data as denormalized strings; see overview §2.4).

## 3. External dependencies

```jsonc
{
  "name": "@freighttech/contractors",
  "dependencies": {
    "@freighttech/facilities": "workspace:*",
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

## 4. Pre-extraction remediation — cut the `Project` dep (E4)

Blocker for Step 1.2. Ship before extraction or as the first commit of the extraction PR.

### Today (pre-rename)

```ts
// packages/fms/src/modules/contractors/api/contractors/[id]/activity/route.ts
// Lines 17 + 18 BOTH cross the prospective package boundary:
import { FmsProject } from '../../../fms_projects/data/entities'
import { FmsLocation } from '../../../fms_locations/data/entities'   // ← spec also covers this import
const projects = await em.find(FmsProject, { /* filter by contractor id */ })
// ... later, FmsLocation query ...
```

### Post-rename, pre-remediation (still bad)

```ts
import { Project } from '../../../projects/data/entities'
const projects = await em.find(Project, { /* … */ })
```

### Fix — data engine for `Project`, direct import for `Facility`

`FmsProject` must become a data-engine query (contractors cannot depend on the projects package — leaf topology). `FmsLocation` can stay as a direct import because `@freighttech/contractors` already depends on `@freighttech/facilities` (Google Places editor); swap the class name + import path.

```ts
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { Facility } from '@freighttech/facilities/modules/facilities/data/entities'

const dataEngine = container.resolve<DataEngine>('dataEngine')
const projectRows = await dataEngine.query({
  entityType: 'projects:project',  // colon + snake_case per overview §1.5
  fields: ['id', 'referenceNumber', 'status', 'createdAt'],
  where: {
    clientId: contractorId,
    // … OR across other party FK columns
  },
  limit: 50,
})
// Facility queries work as today, just via the renamed class + new import path.
const facilities = await em.find(Facility, { contractorId })
```

Entity-type string `'projects:project'` is the new stable contract post-rename.

### Acceptance

- `rg -n "\bProject\b" packages/contractors/src/modules/contractors/` returns zero (allowing partial matches only when wrapped in another identifier like `ProjectInvoice` isn't expected here).
- `rg -n "from '.*projects/data/entities'" packages/contractors/src/` returns zero.
- Contractor activity tab still lists projects linked to the contractor.

## 5. Imports that change on move

```ts
// before
import { createGooglePlacesEditor } from '../../fms_locations/components/GooglePlacesEditor'
import type { ContractorAddressType } from '../../fms_locations/data/types'
import { CONTRACTOR_ADDRESS_TYPES } from '../../../fms_locations/data/types'
import { FmsLocation } from '../../../fms_locations/data/entities'
import { logger } from '../../../lib/logger'

// after
import { createGooglePlacesEditor } from '@freighttech/facilities/modules/facilities/components/GooglePlacesEditor'
import type { ContractorAddressType, CONTRACTOR_ADDRESS_TYPES } from '@freighttech/facilities/modules/facilities/data/types'
import { Facility } from '@freighttech/facilities/modules/facilities/data/entities'
import { logger } from '@freighttech/logistics/lib/logger'
```

## 6. `apps/web/src/modules.ts` diff (Step 1.2; in Tier 2)

```diff
- { id: 'contractors', from: '@open-mercato/fms' },
+ { id: 'contractors', from: '@freighttech/contractors' },
```

Module id unchanged; only the `from` changes.

## 7. Customization patterns

- **Fork to add custom contractor fields** (tax-id validators, industry-specific party types). Useful for jurisdiction-specific builds.
- **Replace with a CRM-backed contractor source.** Fork proxies reads through the consumer's CRM API while keeping entity shape + module id stable for downstream `offers` / `projects` / `invoicing`.
- **Swap the facilities dep** by pointing at a forked `@myapp/facilities` through workspace alias.

## 8. Acceptance

- `yarn workspace @freighttech/contractors typecheck && yarn workspace @freighttech/contractors build` green.
- `rg -n "FmsProject|FmsLocation|Fms(Contractor|Carrier|Offer|Rfq)" packages/contractors/src/modules/` returns zero.
- `rg -n "from '@open-mercato/(projects|offers|folders|invoicing|products|fms)'" packages/contractors/src/` returns zero.
- `@freighttech/facilities` is the only other fms-domain sibling in `dependencies`.
- `contractors/__integration__/` tests pass.
- Contractor detail page renders, address tab loads with Google Places editor, activity panel shows recent projects via the data-engine query.
