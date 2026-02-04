import { Migration } from '@mikro-orm/migrations';

export class Migration20260124225500 extends Migration {

  override async up(): Promise<void> {
    // Add new columns to fms_charge_codes
    this.addSql(`alter table "fms_charge_codes" add column if not exists "name" text null;`);
    this.addSql(`alter table "fms_charge_codes" add column if not exists "keywords" jsonb null;`);
    this.addSql(`alter table "fms_charge_codes" add column if not exists "usage" text null;`);

    // Drop the old field_schema column
    this.addSql(`alter table "fms_charge_codes" drop column if exists "field_schema";`);

    // Migrate existing charge_unit values to new format
    this.addSql(`update "fms_charge_codes" set "charge_unit" = 'container' where "charge_unit" = 'per_container';`);
    this.addSql(`update "fms_charge_codes" set "charge_unit" = 'file' where "charge_unit" = 'one_time';`);
    this.addSql(`update "fms_charge_codes" set "charge_unit" = 'container' where "charge_unit" = 'per_piece';`);
  }

  override async down(): Promise<void> {
    // Revert charge_unit values to old format
    this.addSql(`update "fms_charge_codes" set "charge_unit" = 'per_container' where "charge_unit" = 'container';`);
    this.addSql(`update "fms_charge_codes" set "charge_unit" = 'one_time' where "charge_unit" = 'file';`);
    this.addSql(`update "fms_charge_codes" set "charge_unit" = 'per_piece' where "charge_unit" = 'weight_measure';`);
    this.addSql(`update "fms_charge_codes" set "charge_unit" = 'one_time' where "charge_unit" = 'cargo_value_percent';`);

    // Add back field_schema column
    this.addSql(`alter table "fms_charge_codes" add column if not exists "field_schema" jsonb null;`);

    // Drop new columns
    this.addSql(`alter table "fms_charge_codes" drop column if exists "name";`);
    this.addSql(`alter table "fms_charge_codes" drop column if exists "keywords";`);
    this.addSql(`alter table "fms_charge_codes" drop column if exists "usage";`);
  }

}
