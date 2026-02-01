import { Migration } from '@mikro-orm/migrations';

export class Migration20260201205006 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_project_notes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "body" text not null, "author_user_id" uuid null, "author_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_project_notes_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_project_notes_project_idx" on "fms_project_notes" ("project_id");`);
    this.addSql(`create index "fms_project_notes_org_tenant_idx" on "fms_project_notes" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "fms_project_notes" add constraint "fms_project_notes_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade;`);

    this.addSql(`alter table "fms_projects" add column "etd" timestamptz null, add column "eta" timestamptz null, add column "atd" timestamptz null, add column "ata" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_projects" drop column "etd", drop column "eta", drop column "atd", drop column "ata";`);
  }

}
