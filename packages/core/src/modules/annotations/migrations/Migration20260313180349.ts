import { Migration } from '@mikro-orm/migrations';

export class Migration20260313180349 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop index if exists "cell_annotations_table_row_idx";`);
    this.addSql(`alter table "cell_annotations" drop constraint if exists "cell_annotations_unique_cell";`);

    this.addSql(`alter table "cell_annotations" add column "entity_type" text not null;`);
    this.addSql(`alter table "cell_annotations" alter column "table_id" type text using ("table_id"::text);`);
    this.addSql(`alter table "cell_annotations" alter column "table_id" drop not null;`);
    this.addSql(`create index "cell_annotations_entity_row_idx" on "cell_annotations" ("organization_id", "tenant_id", "entity_type", "row_id");`);
    this.addSql(`alter table "cell_annotations" add constraint "cell_annotations_unique_entity_cell" unique ("organization_id", "tenant_id", "entity_type", "row_id", "column_key");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "cell_annotations_entity_row_idx";`);
    this.addSql(`alter table "cell_annotations" drop constraint "cell_annotations_unique_entity_cell";`);
    this.addSql(`alter table "cell_annotations" drop column "entity_type";`);

    this.addSql(`alter table "cell_annotations" alter column "table_id" type text using ("table_id"::text);`);
    this.addSql(`alter table "cell_annotations" alter column "table_id" set not null;`);
    this.addSql(`create index "cell_annotations_table_row_idx" on "cell_annotations" ("organization_id", "tenant_id", "table_id", "row_id");`);
    this.addSql(`alter table "cell_annotations" add constraint "cell_annotations_unique_cell" unique ("organization_id", "tenant_id", "table_id", "row_id", "column_key");`);
  }

}
