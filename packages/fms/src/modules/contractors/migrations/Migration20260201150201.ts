import { Migration } from '@mikro-orm/migrations';

export class Migration20260201150201 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "contractor_bank_accounts" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "bank_name" text null, "iban" text null, "swift_bic" text null, "currency_code" text not null default 'USD', "is_primary" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, "contractor_id" uuid not null, constraint "contractor_bank_accounts_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "contractor_bank_accounts_contractor_idx" on "contractor_bank_accounts" ("contractor_id");`);

    this.addSql(`
      do $$ begin
        alter table "contractor_bank_accounts" add constraint "contractor_bank_accounts_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade;
      exception when others then null; end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "contractor_bank_accounts" cascade;`);
  }

}
