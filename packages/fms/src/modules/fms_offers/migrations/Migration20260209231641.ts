import { Migration } from '@mikro-orm/migrations';

export class Migration20260209231641 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_rfqs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "title" text null, "description" text null, "origin" text null, "destination" text null, "origin_location_id" uuid null, "destination_location_id" uuid null, "place_of_loading" text null, "place_of_loading_id" uuid null, "place_of_delivery" text null, "place_of_delivery_id" uuid null, "container_count" int null, "direction" text null, "transport_mode" text null, "cargo_type" text null, "company_name" text null, "contact_person" text null, "context" text null, "status" text not null default 'incoming', "assigned_to_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_rfqs_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_rfqs_org_tenant_idx" on "fms_rfqs" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_offers" ("id" uuid not null default gen_random_uuid(), "rfq_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "offer_number" text not null, "version" int not null default 1, "status" text not null default 'draft', "direction" text null, "transport_mode" text null, "cargo_type" text null, "valid_until" timestamptz null, "payment_terms" text null, "special_terms" text null, "customer_notes" text null, "notes" text null, "superseded_by_id" uuid null, "assigned_to_id" uuid null, "operational_guardian_id" uuid null, "business_guardian_id" uuid null, "document_id" uuid null, "sent_at" timestamptz null, "sent_to_email" text null, "exchange_rates" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_offers_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_offers_status_idx" on "fms_offers" ("organization_id", "tenant_id", "status");`);
    this.addSql(`create index "fms_offers_rfq_idx" on "fms_offers" ("rfq_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "fms_offers_org_tenant_idx" on "fms_offers" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_offers" add constraint "fms_offers_number_unique" unique ("organization_id", "tenant_id", "offer_number");`);

    this.addSql(`create table "fms_offer_calculations" ("id" uuid not null default gen_random_uuid(), "offer_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "calculation_number" int not null default 1, "label" text null, "containers" jsonb null, "origin_location_id" uuid null, "destination_location_id" uuid null, "place_of_loading_id" uuid null, "place_of_delivery_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_offer_calculations_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_offer_calcs_offer_idx" on "fms_offer_calculations" ("offer_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "fms_offer_calcs_org_tenant_idx" on "fms_offer_calculations" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_offer_lines" ("id" uuid not null default gen_random_uuid(), "calculation_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "line_number" int not null default 0, "product_id" uuid null, "product_name" text null, "charge_code" text null, "charge_basis" text null, "currency_code" text not null default 'USD', "rate" numeric(18,4) not null default '0', "buy_price" numeric(18,4) not null default '0', "sell_price" numeric(18,4) not null default '0', "container_type" text null, "is_enabled" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_offer_lines_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_offer_lines_calc_idx" on "fms_offer_lines" ("calculation_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "fms_offer_lines_org_tenant_idx" on "fms_offer_lines" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "fms_offers" add constraint "fms_offers_rfq_id_foreign" foreign key ("rfq_id") references "fms_rfqs" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "fms_offer_calculations" add constraint "fms_offer_calculations_offer_id_foreign" foreign key ("offer_id") references "fms_offers" ("id") on update cascade;`);

    this.addSql(`alter table "fms_offer_lines" add constraint "fms_offer_lines_calculation_id_foreign" foreign key ("calculation_id") references "fms_offer_calculations" ("id") on update cascade;`);
  }

}
