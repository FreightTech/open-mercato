# SPEC — Master-Data Packages (overview)

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.2 (four master-data packages created together). |
| **Packages** | [`@freighttech/facilities`](./05a-pkg-facilities.md), [`@freighttech/products`](./05b-pkg-products.md), [`@freighttech/contractors`](./05c-pkg-contractors.md), [`@freighttech/teams`](./09-pkg-teams.md) |

## 1. Scope

Master data ships as **four independent packages** so downstream apps can fork, customize, and version each one separately without paying in the others.

| Package | Module (new id) | Old module id | Old class prefix → new |
|---|---|---|---|
| `@freighttech/facilities` | `facilities` | `fms_locations` | `FmsLocation` → `Facility` |
| `@freighttech/products` | `products` | `fms_products` | `FmsProduct`, `FmsCarrier` → `Product`, `Carrier` |
| `@freighttech/contractors` | `contractors` | `contractors` (unchanged) | `Contractor*` (unchanged) |
| `@freighttech/teams` | `teams` | `fms_teams` | `FmsTeam` → `Team`, `FmsUserTeam` → `UserTeam`, `FmsUserContractorAssignment` → `UserContractorAssignment`, `FmsTeamContractorAssignment` → `TeamContractorAssignment` |

## 2. Dep graph inside master data

```
        logistics
            ▲
            │
  ┌─────────┼──────────┬──────────┐
  │         │          │          │
facilities products  contractors  teams
 (leaf)    (leaf)     │ ◄── UUID-only FKs to contractors
                      └──► facilities (Google Places editor, address types)
```

- `facilities`, `products`, and `teams` are **leaves** (or effectively so) — teams has a plain UUID column to contractors but no source-level import.
- `contractors` depends on `facilities` because `ContractorLocationsTab.tsx` uses `createGooglePlacesEditor` + `ContractorAddressType` from `facilities`. One-directional — `facilities/data/entities.ts` has a `contractor_id` plain UUID column, no source-level import of `Contractor`.
- `teams` has `user_contractor_assignments` and `team_contractor_assignments` tables with plain UUID `contractor_id` columns; consumers resolve via `em.findOne` or `dataEngine.query({ entityType: 'contractors:contractor' })`.

## 3. The one remaining cross-package edge to fix

`contractors/api/contractors/[id]/activity/route.ts` today hard-imports `FmsProject` from `fms_projects`. This edge is unacceptable post-split — `@freighttech/contractors` cannot depend on `@freighttech/projects`. Fix: replace with a data-engine query against entity-type `projects:project`. Detail in [05c-pkg-contractors.md](./05c-pkg-contractors.md) §4 and [07-cross-boundary-remediation.md](./07-cross-boundary-remediation.md) §4 (E4).

## 4. Customization patterns enabled by the split

- **Fork-and-replace.** Fork `@freighttech/contractors` into `@myapp/contractors` (keep module id `contractors`), register `{ id: 'contractors', from: '@myapp/contractors' }` in `modules.ts`. Facilities and products keep coming from upstream.
- **Version pinning divergence.** App A stays on `@freighttech/products@1.x`; App B upgrades to `@2.x`. Neither pays in contractors or facilities churn.
- **Dep-surface trimming.** A lightweight CRM variant takes `@freighttech/contractors` + `@freighttech/facilities` without `@freighttech/products`.
- **Replacement rollout.** `@myapp/mapbox-facilities` ships as a sibling with the same module id; consumers opt in per app via `modules.ts`.

## 5. Execution order inside Step 1.2

Dep-ordered (all four land in MIGRATION Phase 1 Step 1.2):

1. `@freighttech/products` (leaf, safest starter — validates the packaging template).
2. `@freighttech/facilities` (leaf, must land before contractors).
3. `@freighttech/contractors` (depends on facilities; includes E4 remediation).
4. `@freighttech/teams` (UUID-only FKs to contractors).

## 6. `apps/web/src/modules.ts` diff (Step 1.2; in Tier 2)

```diff
- { id: 'contractors', from: '@open-mercato/fms' },
- { id: 'fms_locations', from: '@open-mercato/fms' },
- { id: 'fms_products', from: '@open-mercato/fms' },
- { id: 'fms_teams', from: '@open-mercato/fms' },
+ { id: 'products', from: '@freighttech/products' },
+ { id: 'facilities', from: '@freighttech/facilities' },
+ { id: 'contractors', from: '@freighttech/contractors' },
+ { id: 'teams', from: '@freighttech/teams' },
```

## 7. Read next

- [05a-pkg-facilities.md](./05a-pkg-facilities.md) — `@freighttech/facilities`.
- [05b-pkg-products.md](./05b-pkg-products.md) — `@freighttech/products` (lands first — validates template).
- [05c-pkg-contractors.md](./05c-pkg-contractors.md) — `@freighttech/contractors` (with E4).
- [09-pkg-teams.md](./09-pkg-teams.md) — `@freighttech/teams`.
