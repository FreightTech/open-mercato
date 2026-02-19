import { Migration } from '@mikro-orm/migrations'

export class Migration20260217120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`UPDATE "fms_documents" SET "category" = 'customs_declaration' WHERE "category" = 'customs';`)
    this.addSql(`UPDATE "fms_documents" SET "category" = 'booking_confirmation' WHERE "category" = 'booking';`)
    this.addSql(`UPDATE "fms_documents" SET "category" = 'vgm_certificate' WHERE "category" = 'vgm';`)
  }

  override async down(): Promise<void> {
    this.addSql(`UPDATE "fms_documents" SET "category" = 'customs' WHERE "category" = 'customs_declaration';`)
    this.addSql(`UPDATE "fms_documents" SET "category" = 'booking' WHERE "category" = 'booking_confirmation';`)
    this.addSql(`UPDATE "fms_documents" SET "category" = 'vgm' WHERE "category" = 'vgm_certificate';`)
  }
}
