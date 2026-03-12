import { Migration } from '@mikro-orm/migrations';

export class Migration20260211150028 extends Migration {

  override async up(): Promise<void> {
    // Add columns if they don't exist
    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_logs' AND column_name = 'parent_resource_kind') THEN
          ALTER TABLE "action_logs" ADD COLUMN "parent_resource_kind" text null;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_logs' AND column_name = 'parent_resource_id') THEN
          ALTER TABLE "action_logs" ADD COLUMN "parent_resource_id" text null;
        END IF;
      END $$;
    `);

    // Create indexes if they don't exist
    this.addSql(`CREATE INDEX IF NOT EXISTS "action_logs_parent_resource_idx" ON "action_logs" ("tenant_id", "parent_resource_kind", "parent_resource_id", "created_at");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "action_logs_resource_idx" ON "action_logs" ("tenant_id", "resource_kind", "resource_id", "created_at");`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "action_logs_parent_resource_idx";`);
    this.addSql(`DROP INDEX IF EXISTS "action_logs_resource_idx";`);
    this.addSql(`ALTER TABLE "action_logs" DROP COLUMN IF EXISTS "parent_resource_kind", DROP COLUMN IF EXISTS "parent_resource_id";`);
  }

}
