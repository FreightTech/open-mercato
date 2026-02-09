import { Migration } from '@mikro-orm/migrations';

export class Migration20260209231641 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_teams" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_teams_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_teams_org_tenant_idx" on "fms_teams" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_teams" add constraint "fms_teams_name_unique" unique ("organization_id", "tenant_id", "name");`);

    this.addSql(`create table "fms_team_contractor_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "team_id" uuid not null, "contractor_id" uuid not null, "created_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_team_contractor_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_team_contractor_asgn_contractor_idx" on "fms_team_contractor_assignments" ("contractor_id");`);
    this.addSql(`create index "fms_team_contractor_asgn_team_idx" on "fms_team_contractor_assignments" ("team_id");`);
    this.addSql(`create index "fms_team_contractor_asgn_org_tenant_idx" on "fms_team_contractor_assignments" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_team_contractor_assignments" add constraint "fms_team_contractor_asgn_unique" unique ("organization_id", "team_id", "contractor_id");`);

    this.addSql(`create table "fms_user_contractor_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "user_id" uuid not null, "contractor_id" uuid not null, "created_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_user_contractor_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_user_contractor_asgn_contractor_idx" on "fms_user_contractor_assignments" ("contractor_id");`);
    this.addSql(`create index "fms_user_contractor_asgn_user_idx" on "fms_user_contractor_assignments" ("user_id");`);
    this.addSql(`create index "fms_user_contractor_asgn_org_tenant_idx" on "fms_user_contractor_assignments" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_user_contractor_assignments" add constraint "fms_user_contractor_asgn_unique" unique ("organization_id", "user_id", "contractor_id");`);

    this.addSql(`create table "fms_user_teams" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "team_id" uuid null, "user_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "fms_user_teams_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_user_teams_team_idx" on "fms_user_teams" ("team_id");`);
    this.addSql(`create index "fms_user_teams_user_idx" on "fms_user_teams" ("user_id");`);
    this.addSql(`create index "fms_user_teams_org_tenant_idx" on "fms_user_teams" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_user_teams" add constraint "fms_user_teams_user_org_unique" unique ("organization_id", "user_id");`);
  }

}
