import { Migration } from '@mikro-orm/migrations';

export class Migration20260210134052 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contractor_credit_limits' AND column_name = 'payment_days') THEN
          ALTER TABLE "contractor_credit_limits" ADD COLUMN "payment_days" int NOT NULL DEFAULT 30;
        END IF;
      END $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "contractor_credit_limits" DROP COLUMN IF EXISTS "payment_days";`);
  }

}
