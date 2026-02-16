import { Migration } from '@mikro-orm/migrations';

export class Migration20260216100000_add_truck_presets extends Migration {

  override async up(): Promise<void> {
    // Create frc_truck_presets table
    this.addSql(`
      create table "frc_truck_presets" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "name" varchar(100) not null,
        "width" integer not null,
        "length" integer not null,
        "height" integer not null,
        "max_weight" integer not null,
        "volume" integer not null,
        "is_active" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "frc_truck_presets_pkey" primary key ("id")
      );
    `);

    // Add index for organization/tenant lookups
    this.addSql(`create index "frc_truck_presets_org_tenant_idx" on "frc_truck_presets" ("organization_id", "tenant_id");`);

    // Alter frc_consoles.truck_preset_id from varchar to uuid (nullable)
    // First drop the existing column, then add it as uuid
    this.addSql(`alter table "frc_consoles" drop column if exists "truck_preset_id";`);
    this.addSql(`alter table "frc_consoles" add column "truck_preset_id" uuid null;`);

    // Add foreign key constraint
    this.addSql(`alter table "frc_consoles" add constraint "frc_consoles_truck_preset_id_foreign" foreign key ("truck_preset_id") references "frc_truck_presets" ("id") on update cascade on delete set null;`);

    // Add index for preset lookups
    this.addSql(`create index "frc_consoles_preset_idx" on "frc_consoles" ("truck_preset_id", "organization_id", "tenant_id");`);
  }

  override async down(): Promise<void> {
    // Remove foreign key and index from frc_consoles
    this.addSql(`drop index if exists "frc_consoles_preset_idx";`);
    this.addSql(`alter table "frc_consoles" drop constraint if exists "frc_consoles_truck_preset_id_foreign";`);
    
    // Restore truck_preset_id as varchar
    this.addSql(`alter table "frc_consoles" drop column if exists "truck_preset_id";`);
    this.addSql(`alter table "frc_consoles" add column "truck_preset_id" varchar(50) not null default 'standard';`);

    // Drop frc_truck_presets table
    this.addSql(`drop table if exists "frc_truck_presets";`);
  }

}
