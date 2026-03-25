import { Migration } from '@mikro-orm/migrations';

export class Migration20260320094348 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_file_notes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "file_id" uuid not null, "body" text not null, "author_user_id" uuid null, "author_name" text null, "attachment_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_file_notes_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_file_notes_file_idx" on "fms_file_notes" ("file_id");`);
    this.addSql(`create index "fms_file_notes_org_tenant_idx" on "fms_file_notes" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "fms_file_notes" add constraint "fms_file_notes_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fms_file_notes" cascade;`);
  }

}
