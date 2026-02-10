import { Migration } from '@mikro-orm/migrations';

export class Migration20260210210000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_sea_containers" alter column "container_type" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_sea_containers" alter column "container_type" set not null;`);
  }

}
