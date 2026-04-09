import { Migration } from '@mikro-orm/migrations';

export class Migration20260409120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "automation_definitions" ("id" uuid not null default gen_random_uuid(), "automation_id" varchar(100) not null, "name" varchar(255) not null, "description" text null, "definition" jsonb not null, "enabled" boolean not null default true, "version" int not null default 1, "metadata" jsonb null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_by" varchar(255) null, "updated_by" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "automation_definitions_pkey" primary key ("id"));`);
    this.addSql(`create index "automation_definitions_enabled_idx" on "automation_definitions" ("enabled");`);
    this.addSql(`create index "automation_definitions_tenant_org_idx" on "automation_definitions" ("tenant_id", "organization_id");`);
    this.addSql(`alter table "automation_definitions" add constraint "automation_definitions_automation_id_tenant_id_unique" unique ("automation_id", "tenant_id");`);

    this.addSql(`create table "automation_runs" ("id" uuid not null default gen_random_uuid(), "definition_id" uuid not null, "automation_id" varchar(100) not null, "status" varchar(20) not null, "trigger_data" jsonb null, "context" jsonb null, "error_message" text null, "error_node_id" varchar(100) null, "execution_time_ms" int null, "started_at" timestamptz null, "completed_at" timestamptz null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, constraint "automation_runs_pkey" primary key ("id"));`);
    this.addSql(`create index "automation_runs_definition_status_idx" on "automation_runs" ("definition_id", "status");`);
    this.addSql(`create index "automation_runs_status_tenant_idx" on "automation_runs" ("status", "tenant_id");`);
    this.addSql(`create index "automation_runs_tenant_org_idx" on "automation_runs" ("tenant_id", "organization_id");`);

    this.addSql(`create table "automation_node_executions" ("id" uuid not null default gen_random_uuid(), "run_id" uuid not null, "node_id" varchar(100) not null, "node_type" varchar(50) not null, "status" varchar(20) not null, "input_data" jsonb null, "output_data" jsonb null, "error_data" jsonb null, "execution_time_ms" int null, "started_at" timestamptz null, "completed_at" timestamptz null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, constraint "automation_node_executions_pkey" primary key ("id"));`);
    this.addSql(`create index "automation_node_exec_run_idx" on "automation_node_executions" ("run_id");`);
    this.addSql(`create index "automation_node_exec_run_node_idx" on "automation_node_executions" ("run_id", "node_id");`);
    this.addSql(`create index "automation_node_exec_tenant_org_idx" on "automation_node_executions" ("tenant_id", "organization_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "automation_node_executions";`);
    this.addSql(`drop table if exists "automation_runs";`);
    this.addSql(`drop table if exists "automation_definitions";`);
  }
}
