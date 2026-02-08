import { Migration } from '@mikro-orm/migrations';

export class Migration20260207163205 extends Migration {

  override async up(): Promise<void> {
    // No changes needed - contractor FK constraints are managed by the contractors module
  }

}
