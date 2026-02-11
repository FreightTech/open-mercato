# fms_4rcargo Package — Agent Guidelines

`@open-mercato/fms_4rcargo` provides 4R Cargo air freight operations modules.

## Modules

| Module | Description | Tables |
|--------|-------------|--------|
| `frc_airports` | Airport lookup data | `frc_airports` |
| `frc_rfqs` | Request for Quotes | `frc_rfqs`, `frc_air_cargo` |
| `frc_offers` | Offers to customers | `frc_offers`, `frc_air_routing` |
| `frc_trucks` | Truck fleet management | `frc_trucks`, `frc_truck_bookings` |
| `frc_projects` | Project tracking | `frc_projects` |

## Database Migrations

**IMPORTANT:** All frc_ module migrations are consolidated into a single location.

### Migration Location

All database schema changes for frc_ modules are managed in:
```
packages/fms_4rcargo/src/modules/frc_airports/migrations/
```

The other frc_ modules (`frc_rfqs`, `frc_offers`, `frc_trucks`, `frc_projects`) do **NOT** have migrations folders.

### Why Consolidated?

The frc_ modules have cross-module `@ManyToOne` ORM relationships (e.g., `FrcRfq.originAirport` -> `FrcAirport`). MikroORM's migration generator includes all referenced entities, causing duplicate table creation across module migrations.

Since these modules are tightly coupled within the same package, we consolidate migrations to:
1. Avoid duplicate `CREATE TABLE` statements
2. Ensure correct dependency order
3. Simplify schema management

### Adding Schema Changes

When you modify an entity in any frc_ module:

1. **Manually add the migration** to `frc_airports/migrations/`:
   ```bash
   # Create a new migration file
   touch packages/fms_4rcargo/src/modules/frc_airports/migrations/Migration$(date +%Y%m%d%H%M%S)_description.ts
   ```

2. **Write the migration** with the appropriate `up()` and `down()` methods

3. **Run `yarn db:migrate`** to apply the migration

### Warning: `yarn db:generate` Behavior

Running `yarn db:generate` will create migration folders and bloated migration files in `frc_rfqs`, `frc_offers`, `frc_trucks`, and `frc_projects`. This is because the CLI auto-creates folders for modules with entities.

**After running `yarn db:generate`:**
1. Delete any generated migrations in these modules:
   ```bash
   rm -rf packages/fms_4rcargo/src/modules/frc_rfqs/migrations
   rm -rf packages/fms_4rcargo/src/modules/frc_offers/migrations
   rm -rf packages/fms_4rcargo/src/modules/frc_trucks/migrations
   rm -rf packages/fms_4rcargo/src/modules/frc_projects/migrations
   ```
2. Review and keep only relevant changes in `frc_airports/migrations/`

### Example: Adding a Column

```typescript
// Migration20260215120000_add_notes_to_offers.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260215120000_add_notes_to_offers extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "frc_offers" add column "notes" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "frc_offers" drop column "notes";`);
  }
}
```

## Cross-Module Relationships

These modules use ORM relationships across module boundaries (within this package):

| From | To | Relationship |
|------|-----|--------------|
| `FrcRfq` | `FrcAirport` | `originAirport`, `destinationAirport` |
| `FrcAirRouting` | `FrcAirport` | `originAirport`, `destinationAirport` |
| `FrcAirRouting` | `FrcOffer` | `offer` |
| `FrcTruckBooking` | `FrcAirport` | `originAirport`, `destinationAirport` |
| `FrcTruckBooking` | `FrcTruck` | `truck` |
| `FrcAirCargo` | `FrcRfq` | `rfq` |

This is an intentional deviation from the platform's "no direct ORM relationships between modules" guideline. These modules are tightly coupled within the same package and frequently need eager loading of related entities.

## Entity Files

- `frc_airports`: `packages/fms_4rcargo/src/modules/frc_airports/data/entities.ts`
- `frc_rfqs`: `packages/fms_4rcargo/src/modules/frc_rfqs/data/entities.ts`
- `frc_offers`: `packages/fms_4rcargo/src/modules/frc_offers/data/entities.ts`
- `frc_trucks`: `packages/fms_4rcargo/src/modules/frc_trucks/data/entities.ts`
- `frc_projects`: `packages/fms_4rcargo/src/modules/frc_projects/data/entities.ts`
