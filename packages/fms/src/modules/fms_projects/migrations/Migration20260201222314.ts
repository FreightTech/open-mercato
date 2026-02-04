import { Migration } from '@mikro-orm/migrations';

export class Migration20260201222314 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column if not exists "cargo_ready_date" timestamptz null, add column if not exists "vgm_cutoff_date" timestamptz null, add column if not exists "doc_cutoff_date" timestamptz null, add column if not exists "gate_in_date" timestamptz null, add column if not exists "gate_close_date" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_projects" drop column if exists "cargo_ready_date", drop column if exists "vgm_cutoff_date", drop column if exists "doc_cutoff_date", drop column if exists "gate_in_date", drop column if exists "gate_close_date";`);
  }

}
