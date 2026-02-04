import { Migration } from '@mikro-orm/migrations';

export class Migration20260201222314 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column "cargo_ready_date" timestamptz null, add column "vgm_cutoff_date" timestamptz null, add column "doc_cutoff_date" timestamptz null, add column "gate_in_date" timestamptz null, add column "gate_close_date" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_projects" drop column "cargo_ready_date", drop column "vgm_cutoff_date", drop column "doc_cutoff_date", drop column "gate_in_date", drop column "gate_close_date";`);
  }

}
