import { Migration } from '@mikro-orm/migrations';

export class Migration20260318174803 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_notes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "related_entity_type" text not null, "related_entity_id" uuid not null, "body" text not null, "author_user_id" uuid null, "author_name" text null, "attachment_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_notes_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_notes_related_idx" on "fms_notes" ("related_entity_id", "related_entity_type");`);
    this.addSql(`create index "fms_notes_org_tenant_idx" on "fms_notes" ("organization_id", "tenant_id");`);
  }

}
