import { Migration } from '@mikro-orm/migrations';

export class Migration20260119000000 extends Migration {

  override async up(): Promise<void> {
    // Add assigned_to_id column to fms_quotes
    this.addSql(`alter table "fms_quotes" add column if not exists "assigned_to_id" uuid null;`);
    this.addSql(`do $$ begin alter table "fms_quotes" add constraint "fms_quotes_assigned_to_id_foreign" foreign key ("assigned_to_id") references "users" ("id") on update cascade on delete set null; exception when others then null; end $$;`);
    this.addSql(`create index if not exists "fms_quotes_assigned_to_idx" on "fms_quotes" ("assigned_to_id");`);

    // Add assigned_to_id column to fms_offers
    this.addSql(`alter table "fms_offers" add column if not exists "assigned_to_id" uuid null;`);
    this.addSql(`do $$ begin alter table "fms_offers" add constraint "fms_offers_assigned_to_id_foreign" foreign key ("assigned_to_id") references "users" ("id") on update cascade on delete set null; exception when others then null; end $$;`);
    this.addSql(`create index if not exists "fms_offers_assigned_to_idx" on "fms_offers" ("assigned_to_id");`);

    // Add document_id column to fms_offers (references fms_documents for generated PDF)
    this.addSql(`alter table "fms_offers" add column if not exists "document_id" uuid null;`);
    this.addSql(`do $$ begin alter table "fms_offers" add constraint "fms_offers_document_id_foreign" foreign key ("document_id") references "fms_documents" ("id") on update cascade on delete set null; exception when others then null; end $$;`);
    this.addSql(`create index if not exists "fms_offers_document_idx" on "fms_offers" ("document_id");`);
  }

  override async down(): Promise<void> {
    // Remove document_id from fms_offers
    this.addSql(`alter table "fms_offers" drop constraint if exists "fms_offers_document_id_foreign";`);
    this.addSql(`drop index if exists "fms_offers_document_idx";`);
    this.addSql(`alter table "fms_offers" drop column if exists "document_id";`);

    // Remove assigned_to_id from fms_offers
    this.addSql(`alter table "fms_offers" drop constraint if exists "fms_offers_assigned_to_id_foreign";`);
    this.addSql(`drop index if exists "fms_offers_assigned_to_idx";`);
    this.addSql(`alter table "fms_offers" drop column if exists "assigned_to_id";`);

    // Remove assigned_to_id from fms_quotes
    this.addSql(`alter table "fms_quotes" drop constraint if exists "fms_quotes_assigned_to_id_foreign";`);
    this.addSql(`drop index if exists "fms_quotes_assigned_to_idx";`);
    this.addSql(`alter table "fms_quotes" drop column if exists "assigned_to_id";`);
  }

}
