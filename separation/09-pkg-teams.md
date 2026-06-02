# SPEC — `@freighttech/teams`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.2 (master-data group; lands after `contractors` because assignment entities reference contractor ids) |
| **Modules hosted** | `teams` (formerly `fms_teams`) |
| **Depends on** | `@freighttech/logistics`, `@open-mercato/core`, `@open-mercato/ui` |

## 1. Why this lands next to master data

`teams` is effectively another master-data module — it owns team structures and user / contractor assignments. It has no outbound source-level deps on any other in-scope module. `UserContractorAssignment` and `TeamContractorAssignment` reference contractors via **plain UUID `@Property` columns**, not ORM-typed `@ManyToOne` — so no compile-time dep on `@freighttech/contractors` either.

Verified during audit: `packages/fms/src/modules/fms_teams/data/entities.ts` uses `@Property({ name: 'organization_id', type: 'uuid' })` and `@Property({ name: 'tenant_id', type: 'uuid' })`; the entity class body has no imports from other modules.

The only cross-module read is via UUIDs on the assignment tables, which stay as plain columns — consumers resolve the `Contractor` on demand via `em.findOne` or `dataEngine.query({ entityType: 'contractors:contractor' })` (colon + snake_case per overview §1.5).

## 2. Class renames

| Before | After |
|---|---|
| `FmsTeam` | `Team` |
| `FmsUserTeam` | `UserTeam` |
| `FmsUserContractorAssignment` | `UserContractorAssignment` |
| `FmsTeamContractorAssignment` | `TeamContractorAssignment` |

No collisions with built-in globals or with other in-scope modules.

## 3. What's inside

```
packages/teams/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   └── modules/
│       └── teams/                 # formerly fms_teams
│           ├── acl.ts             # feature ids: teams.view, teams.manage
│           ├── api/               # members, teams, user-contractors, team-contractors
│           ├── backend/teams/
│           ├── commands/          # teams.ts
│           ├── components/        # UserContractorsDrawer, TeamDetailsDrawer
│           ├── data/
│           │   ├── entities.ts    # Team, UserTeam, UserContractorAssignment, TeamContractorAssignment
│           │   └── validators.ts
│           ├── (events.ts)        # OPTIONAL — `fms_teams` has no events.ts today. Step 1.2 may create one (`teams.team.*`); not required.
│           ├── index.ts           # metadata.name === 'teams' (field is `name`, not `id`)
│           ├── lib/
│           ├── migrations/
│           ├── search.ts          # entity types: teams:team, teams:user_team, teams:user_contractor_assignment, teams:team_contractor_assignment
│           ├── services/
│           └── setup.ts
└── generated/
```

DB tables after rename: `teams`, `user_teams`, `user_contractor_assignments`, `team_contractor_assignments`.

## 4. External dependencies

```jsonc
{
  "name": "@freighttech/teams",
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

No `@freighttech/contractors` dep — cross-module reads go via the data engine.

## 5. Imports that change on the move

```ts
// before
import { logger } from '../../../lib/logger'
// (teams had minimal use of shared libs; logger + activity panel if present)

// after
import { logger } from '@freighttech/logistics/lib/logger'
```

## 6. `apps/web/src/modules.ts` diff (Step 1.2; in Tier 2)

```diff
- { id: 'fms_teams', from: '@open-mercato/fms' },
+ { id: 'teams', from: '@freighttech/teams' },
```

## 7. Customization patterns

- **Fork to plug in a custom team hierarchy** (e.g. departments, cost centers).
- **Replace the user → contractor assignment model** with an external HR system adapter.
- **Pin independently** from contractors and facilities.

## 8. Acceptance

- `yarn workspace @freighttech/teams typecheck && yarn workspace @freighttech/teams build` green.
- `rg -n "Fms(Team|UserTeam|UserContractorAssignment|TeamContractorAssignment)\b" packages/teams/src/` returns zero.
- `rg -n "from '@open-mercato/(contractors|facilities|products|offers|projects|invoicing|freight-documents)'" packages/teams/src/` returns zero.
- `rg -n "fms_teams\b" packages/teams/src/` returns zero.
- Team CRUD works; user-contractor assignment + team-contractor assignment flows both work.
- **Integration tests**: `fms_teams` has **no `__integration__/` directory today** — Step 1.2 optionally adds minimum coverage (team CRUD, user-contractor assignment, team-contractor assignment). If deferred, the acceptance gate is limited to typecheck + build + manual CRUD verification.
