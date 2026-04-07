import { Migration } from '@mikro-orm/migrations';

export class Migration20260407_product_default_section extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_products" add column "default_section_type" text null;`);

    // Auto-classify existing products by name keywords
    this.addSql(`update "fms_products" set "default_section_type" = 'origin' where lower("name") similar to '%(origin|loading|vgm|seal fee|ets)%';`);
    this.addSql(`update "fms_products" set "default_section_type" = 'destination' where lower("name") similar to '%(destination|dest|delivery|inland|customs|discharge|arrival)%';`);
    this.addSql(`update "fms_products" set "default_section_type" = 'main_freight' where "default_section_type" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_products" drop column "default_section_type";`);
  }

}
