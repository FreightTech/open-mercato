import { Migration } from '@mikro-orm/migrations'

export class Migration20260226120000_add_assigned_to_id_to_frc_projects extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "frc_projects" add column "assigned_to_id" uuid null;`)
    this.addSql(
      `create index "frc_projects_assigned_to_idx" on "frc_projects" ("organization_id", "tenant_id", "assigned_to_id");`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "frc_projects_assigned_to_idx";`)
    this.addSql(`alter table "frc_projects" drop column "assigned_to_id";`)
  }
}
