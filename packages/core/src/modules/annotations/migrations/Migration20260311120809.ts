import { Migration } from '@mikro-orm/migrations';

export class Migration20260311120809 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "cell_annotations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "table_id" text not null, "row_id" text not null, "column_key" text not null, "color" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "cell_annotations_pkey" primary key ("id"));`);
    this.addSql(`create index "cell_annotations_table_row_idx" on "cell_annotations" ("organization_id", "tenant_id", "table_id", "row_id");`);
    this.addSql(`create index "cell_annotations_org_tenant_idx" on "cell_annotations" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "cell_annotations" add constraint "cell_annotations_unique_cell" unique ("organization_id", "tenant_id", "table_id", "row_id", "column_key");`);

    this.addSql(`create table "cell_comments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "user_id" uuid not null, "content" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "annotation_id" uuid not null, constraint "cell_comments_pkey" primary key ("id"));`);
    this.addSql(`create index "cell_comments_annotation_created_idx" on "cell_comments" ("annotation_id", "created_at");`);
    this.addSql(`create index "cell_comments_annotation_idx" on "cell_comments" ("annotation_id");`);

    this.addSql(`alter table "cell_comments" add constraint "cell_comments_annotation_id_foreign" foreign key ("annotation_id") references "cell_annotations" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "cell_comments" drop constraint "cell_comments_annotation_id_foreign";`);
    this.addSql(`drop table if exists "cell_comments" cascade;`);
    this.addSql(`drop table if exists "cell_annotations" cascade;`);
  }
}
