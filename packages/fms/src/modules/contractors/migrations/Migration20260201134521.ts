import { Migration } from '@mikro-orm/migrations';

export class Migration20260201134521 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "contractor_sop_comments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "category" text not null, "body" text not null, "author_user_id" uuid null, "author_name" text null, "is_pinned" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "contractor_id" uuid not null, constraint "contractor_sop_comments_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "contractor_sop_comments_contractor_idx" on "contractor_sop_comments" ("contractor_id");`);
    this.addSql(`create index if not exists "contractor_sop_comments_org_tenant_idx" on "contractor_sop_comments" ("organization_id", "tenant_id");`);

    this.addSql(`do $$ begin alter table "contractor_sop_comments" add constraint "contractor_sop_comments_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade; exception when duplicate_object then null; end $$;`);

    this.addSql(`alter table "contractor_credit_limits" add column if not exists "current_exposure" numeric(18,2) not null default '0', add column if not exists "last_calculated_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "contractor_credit_limits" drop column "current_exposure", drop column "last_calculated_at";`);
  }

}
