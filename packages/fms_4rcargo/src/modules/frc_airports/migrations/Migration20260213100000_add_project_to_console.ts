import { Migration } from '@mikro-orm/migrations';

export class Migration20260213100000_add_project_to_console extends Migration {

  override async up(): Promise<void> {
    // Add project_id column to frc_consoles for linking consoles to projects
    this.addSql(`alter table "frc_consoles" add column "project_id" uuid null;`);
    
    // Add foreign key constraint to frc_projects
    this.addSql(`alter table "frc_consoles" add constraint "frc_consoles_project_id_foreign" foreign key ("project_id") references "frc_projects" ("id") on update cascade on delete set null;`);
    
    // Add index for faster project-based lookups
    this.addSql(`create index "frc_consoles_project_idx" on "frc_consoles" ("project_id", "organization_id", "tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "frc_consoles_project_idx";`);
    this.addSql(`alter table "frc_consoles" drop constraint if exists "frc_consoles_project_id_foreign";`);
    this.addSql(`alter table "frc_consoles" drop column if exists "project_id";`);
  }

}
