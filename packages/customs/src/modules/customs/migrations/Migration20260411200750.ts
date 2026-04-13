import { Migration } from '@mikro-orm/migrations';

export class Migration20260411200750 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "customs_hs_classifications" add column "tariff_tree" jsonb null, add column "ai_path" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "customs_hs_classifications" drop column "tariff_tree", drop column "ai_path";`);
  }

}
