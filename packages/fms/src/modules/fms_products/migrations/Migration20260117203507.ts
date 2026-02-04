import { Migration } from '@mikro-orm/migrations';

export class Migration20260117203507 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_products') then
          alter table "fms_products" drop constraint if exists "fms_products_product_type_check";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_products') then
          alter table "fms_products" drop constraint if exists "fms_products_charge_code_id_foreign";
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_products') then
          alter table "fms_products" drop constraint if exists "fms_products_service_provider_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_product_variants') then
          alter table "fms_product_variants" drop constraint if exists "fms_product_variants_variant_type_check";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_product_variants') then
          alter table "fms_product_variants" drop constraint if exists "fms_product_variants_provider_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'charge_code_id') then
          alter table "fms_products" alter column "charge_code_id" drop default;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'charge_code_id') then
          alter table "fms_products" alter column "charge_code_id" type uuid using ("charge_code_id"::text::uuid);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'charge_code_id') then
          alter table "fms_products" alter column "charge_code_id" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'service_provider_id') then
          alter table "fms_products" alter column "service_provider_id" drop default;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'service_provider_id') then
          alter table "fms_products" alter column "service_provider_id" type uuid using ("service_provider_id"::text::uuid);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'service_provider_id') then
          alter table "fms_products" alter column "service_provider_id" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'product_type') then
          alter table "fms_products" alter column "product_type" type text using ("product_type"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_products" add constraint "fms_products_charge_code_id_foreign" foreign key ("charge_code_id") references "fms_charge_codes" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_products" add constraint "fms_products_service_provider_id_foreign" foreign key ("service_provider_id") references "contractors" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_product_variants' and column_name = 'provider_id') then
          alter table "fms_product_variants" alter column "provider_id" drop default;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_product_variants' and column_name = 'provider_id') then
          alter table "fms_product_variants" alter column "provider_id" type uuid using ("provider_id"::text::uuid);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_product_variants' and column_name = 'provider_id') then
          alter table "fms_product_variants" alter column "provider_id" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_product_variants' and column_name = 'variant_type') then
          alter table "fms_product_variants" alter column "variant_type" type text using ("variant_type"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_product_variants" add constraint "fms_product_variants_provider_id_foreign" foreign key ("provider_id") references "contractors" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_products') then
          alter table "fms_products" drop constraint if exists "fms_products_charge_code_id_foreign";
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_products') then
          alter table "fms_products" drop constraint if exists "fms_products_service_provider_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_product_variants') then
          alter table "fms_product_variants" drop constraint if exists "fms_product_variants_provider_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'charge_code_id') then
          alter table "fms_products" alter column "charge_code_id" drop default;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'charge_code_id') then
          alter table "fms_products" alter column "charge_code_id" type uuid using ("charge_code_id"::text::uuid);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'charge_code_id') then
          alter table "fms_products" alter column "charge_code_id" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'service_provider_id') then
          alter table "fms_products" alter column "service_provider_id" drop default;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'service_provider_id') then
          alter table "fms_products" alter column "service_provider_id" type uuid using ("service_provider_id"::text::uuid);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'service_provider_id') then
          alter table "fms_products" alter column "service_provider_id" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_products" add constraint "fms_products_product_type_check" check("product_type" in ('GBAF_PIECE', 'GBAF', 'GBOL', 'CUSTOM', 'GCUS', 'GFRT', 'GTHC'));
      exception when others then null; end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_products" add constraint "fms_products_charge_code_id_foreign" foreign key ("charge_code_id") references "fms_charge_codes" ("id") on update cascade on delete restrict;
      exception when others then null; end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_products" add constraint "fms_products_service_provider_id_foreign" foreign key ("service_provider_id") references "contractors" ("id") on update cascade on delete restrict;
      exception when others then null; end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_product_variants' and column_name = 'provider_id') then
          alter table "fms_product_variants" alter column "provider_id" drop default;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_product_variants' and column_name = 'provider_id') then
          alter table "fms_product_variants" alter column "provider_id" type uuid using ("provider_id"::text::uuid);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_product_variants' and column_name = 'provider_id') then
          alter table "fms_product_variants" alter column "provider_id" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_product_variants" add constraint "fms_product_variants_variant_type_check" check("variant_type" in ('container', 'simple'));
      exception when others then null; end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_product_variants" add constraint "fms_product_variants_provider_id_foreign" foreign key ("provider_id") references "contractors" ("id") on update cascade on delete restrict;
      exception when others then null; end $$;
    `);
  }

}
