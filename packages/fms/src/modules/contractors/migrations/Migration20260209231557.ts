import { Migration } from '@mikro-orm/migrations';

export class Migration20260209231557 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "contractors" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "short_name" text null, "official_name" text null, "parent_id" uuid null, "tax_id" text null, "regon" text null, "krs" text null, "registration_date" text null, "pkd_main_code" text null, "pkd_main_description" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "role_type_ids" jsonb null, constraint "contractors_pkey" primary key ("id"));`);
    this.addSql(`create index "contractors_parent_idx" on "contractors" ("parent_id");`);
    this.addSql(`create index "idx_contractors_tenant_org_id" on "contractors" ("tenant_id", "organization_id", "id") where deleted_at is null;`);
    this.addSql(`create index "contractors_org_tenant_idx" on "contractors" ("organization_id", "tenant_id");`);

    this.addSql(`create table "contractor_addresses" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "purpose" text not null, "address_line" text null, "city" text null, "state" text null, "postal_code" text null, "country" text null, "is_primary" boolean not null default false, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "contractor_id" uuid not null, constraint "contractor_addresses_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_addresses_contractor_idx" on "contractor_addresses" ("contractor_id");`);

    this.addSql(`create table "contractor_bank_accounts" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "bank_name" text null, "iban" text null, "swift_bic" text null, "currency_code" text not null default 'USD', "is_primary" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, "contractor_id" uuid not null, constraint "contractor_bank_accounts_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_bank_accounts_contractor_idx" on "contractor_bank_accounts" ("contractor_id");`);

    this.addSql(`create table "contractor_contacts" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "first_name" text null, "last_name" text null, "email" text null, "phone" text null, "is_primary" boolean not null default false, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "contractor_id" uuid not null, constraint "contractor_contacts_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_contacts_contractor_idx" on "contractor_contacts" ("contractor_id");`);

    this.addSql(`create table "contractor_credit_limits" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "credit_limit" numeric(18,2) not null, "currency_code" text not null default 'USD', "is_unlimited" boolean not null default false, "payment_days" int not null default 30, "current_exposure" numeric(18,2) not null default '0', "last_calculated_at" timestamptz null, "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "contractor_id" uuid not null, constraint "contractor_credit_limits_pkey" primary key ("id"));`);
    this.addSql(`alter table "contractor_credit_limits" add constraint "contractor_credit_limits_contractor_id_unique" unique ("contractor_id");`);
    this.addSql(`create index "contractor_credit_limits_contractor_idx" on "contractor_credit_limits" ("contractor_id");`);
    this.addSql(`alter table "contractor_credit_limits" add constraint "contractor_credit_limits_contractor_unique" unique ("contractor_id");`);

    this.addSql(`create table "contractor_payment_terms" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "payment_days" int not null default 30, "payment_method" text null, "currency_code" text not null default 'USD', "bank_name" text null, "bank_account_number" text null, "bank_routing_number" text null, "iban" text null, "swift_bic" text null, "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "contractor_id" uuid not null, constraint "contractor_payment_terms_pkey" primary key ("id"));`);
    this.addSql(`alter table "contractor_payment_terms" add constraint "contractor_payment_terms_contractor_id_unique" unique ("contractor_id");`);
    this.addSql(`create index "contractor_payment_terms_contractor_idx" on "contractor_payment_terms" ("contractor_id");`);
    this.addSql(`alter table "contractor_payment_terms" add constraint "contractor_payment_terms_contractor_unique" unique ("contractor_id");`);

    this.addSql(`create table "contractor_role_types" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "category" text not null, "description" text null, "color" text null, "icon" text null, "has_custom_fields" boolean not null default false, "sort_order" int not null default 0, "is_system" boolean not null default false, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "contractor_role_types_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_contractor_role_types_category" on "contractor_role_types" ("tenant_id", "organization_id", "category") where is_active = true;`);
    this.addSql(`create index "contractor_role_types_org_tenant_idx" on "contractor_role_types" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "contractor_role_types" add constraint "contractor_role_types_code_unique" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "contractor_sop_comments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "category" text not null, "body" text not null, "author_user_id" uuid null, "author_name" text null, "is_pinned" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "contractor_id" uuid not null, constraint "contractor_sop_comments_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_sop_comments_contractor_idx" on "contractor_sop_comments" ("contractor_id");`);
    this.addSql(`create index "contractor_sop_comments_org_tenant_idx" on "contractor_sop_comments" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "contractor_addresses" add constraint "contractor_addresses_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade;`);

    this.addSql(`alter table "contractor_bank_accounts" add constraint "contractor_bank_accounts_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade;`);

    this.addSql(`alter table "contractor_contacts" add constraint "contractor_contacts_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade;`);

    this.addSql(`alter table "contractor_credit_limits" add constraint "contractor_credit_limits_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade;`);

    this.addSql(`alter table "contractor_payment_terms" add constraint "contractor_payment_terms_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade;`);

    this.addSql(`alter table "contractor_sop_comments" add constraint "contractor_sop_comments_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade;`);
  }

}
