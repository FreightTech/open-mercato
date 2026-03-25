import { Migration } from '@mikro-orm/migrations';

export class Migration20260325120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_file_legs" add column "gate_in_cutoff" timestamptz null;`);
    this.addSql(`alter table "fms_file_legs" add column "documentation_cutoff" timestamptz null;`);
    this.addSql(`alter table "fms_file_legs" add column "vgm_cutoff" timestamptz null;`);
    this.addSql(`alter table "fms_file_legs" add column "dangerous_goods_cutoff" timestamptz null;`);
    this.addSql(`alter table "fms_file_legs" add column "dem_free_time" int null;`);
    this.addSql(`alter table "fms_file_legs" add column "det_free_time" int null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_file_legs" drop column "gate_in_cutoff";`);
    this.addSql(`alter table "fms_file_legs" drop column "documentation_cutoff";`);
    this.addSql(`alter table "fms_file_legs" drop column "vgm_cutoff";`);
    this.addSql(`alter table "fms_file_legs" drop column "dangerous_goods_cutoff";`);
    this.addSql(`alter table "fms_file_legs" drop column "dem_free_time";`);
    this.addSql(`alter table "fms_file_legs" drop column "det_free_time";`);
  }

}
