import { Migration } from '@mikro-orm/migrations';

export class Migration20260117203507 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_product_type_check";`);

    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_charge_code_id_foreign";`);
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_service_provider_id_foreign";`);

    this.addSql(`alter table "fms_product_variants" drop constraint if exists "fms_product_variants_variant_type_check";`);

    this.addSql(`alter table "fms_product_variants" drop constraint if exists "fms_product_variants_provider_id_foreign";`);

    this.addSql(`alter table "fms_products" alter column "charge_code_id" drop default;`);
    this.addSql(`alter table "fms_products" alter column "charge_code_id" type uuid using ("charge_code_id"::text::uuid);`);
    this.addSql(`alter table "fms_products" alter column "charge_code_id" drop not null;`);
    this.addSql(`alter table "fms_products" alter column "service_provider_id" drop default;`);
    this.addSql(`alter table "fms_products" alter column "service_provider_id" type uuid using ("service_provider_id"::text::uuid);`);
    this.addSql(`alter table "fms_products" alter column "service_provider_id" drop not null;`);
    this.addSql(`alter table "fms_products" alter column "product_type" type text using ("product_type"::text);`);
    this.addSql(`alter table "fms_products" add constraint "fms_products_charge_code_id_foreign" foreign key ("charge_code_id") references "fms_charge_codes" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_products" add constraint "fms_products_service_provider_id_foreign" foreign key ("service_provider_id") references "contractors" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "fms_product_variants" alter column "provider_id" drop default;`);
    this.addSql(`alter table "fms_product_variants" alter column "provider_id" type uuid using ("provider_id"::text::uuid);`);
    this.addSql(`alter table "fms_product_variants" alter column "provider_id" drop not null;`);
    this.addSql(`alter table "fms_product_variants" alter column "variant_type" type text using ("variant_type"::text);`);
    this.addSql(`alter table "fms_product_variants" add constraint "fms_product_variants_provider_id_foreign" foreign key ("provider_id") references "contractors" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_charge_code_id_foreign";`);
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_service_provider_id_foreign";`);

    this.addSql(`alter table "fms_product_variants" drop constraint if exists "fms_product_variants_provider_id_foreign";`);

    this.addSql(`alter table "fms_products" alter column "charge_code_id" drop default;`);
    this.addSql(`alter table "fms_products" alter column "charge_code_id" type uuid using ("charge_code_id"::text::uuid);`);
    this.addSql(`alter table "fms_products" alter column "charge_code_id" set not null;`);
    this.addSql(`alter table "fms_products" alter column "service_provider_id" drop default;`);
    this.addSql(`alter table "fms_products" alter column "service_provider_id" type uuid using ("service_provider_id"::text::uuid);`);
    this.addSql(`alter table "fms_products" alter column "service_provider_id" set not null;`);
    this.addSql(`alter table "fms_products" add constraint "fms_products_product_type_check" check("product_type" in ('GBAF_PIECE', 'GBAF', 'GBOL', 'CUSTOM', 'GCUS', 'GFRT', 'GTHC'));`);
    this.addSql(`alter table "fms_products" add constraint "fms_products_charge_code_id_foreign" foreign key ("charge_code_id") references "fms_charge_codes" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "fms_products" add constraint "fms_products_service_provider_id_foreign" foreign key ("service_provider_id") references "contractors" ("id") on update cascade on delete restrict;`);

    this.addSql(`alter table "fms_product_variants" alter column "provider_id" drop default;`);
    this.addSql(`alter table "fms_product_variants" alter column "provider_id" type uuid using ("provider_id"::text::uuid);`);
    this.addSql(`alter table "fms_product_variants" alter column "provider_id" set not null;`);
    this.addSql(`alter table "fms_product_variants" add constraint "fms_product_variants_variant_type_check" check("variant_type" in ('container', 'simple'));`);
    this.addSql(`alter table "fms_product_variants" add constraint "fms_product_variants_provider_id_foreign" foreign key ("provider_id") references "contractors" ("id") on update cascade on delete restrict;`);
  }

}
