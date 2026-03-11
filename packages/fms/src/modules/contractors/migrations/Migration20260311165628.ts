import { Migration } from '@mikro-orm/migrations';

export class Migration20260311165628 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "contractor_comments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "contractor_id" uuid not null, "body" text not null, "author_user_id" uuid null, "author_name" varchar(255) null, "attachment_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "contractor_comments_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_comments_contractor_idx" on "contractor_comments" ("contractor_id");`);
    this.addSql(`create index "contractor_comments_org_tenant_idx" on "contractor_comments" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "contractor_comments" add constraint "contractor_comments_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade;`);
  }

}
