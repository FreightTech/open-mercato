import { Migration } from '@mikro-orm/migrations'

export class Migration20260409_offer_line_section_type extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "fms_offer_lines" ADD COLUMN "section_type" text NULL`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "fms_offer_lines" DROP COLUMN "section_type"`)
  }
}
