import { Migration } from '@mikro-orm/migrations'

/**
 * Drop `default now()` from timestamp columns on documents and document_pages.
 *
 * The ORM entities use `onCreate` / `onUpdate` callbacks to set these values
 * from JavaScript, so the database-level defaults are unnecessary and cause
 * MikroORM's schema diff to flag a mismatch.
 *
 * Also re-adds FK constraints with `on update cascade` to match the current
 * MikroORM convention.
 */
export class Migration20260411164524 extends Migration {
  override async up(): Promise<void> {
    // Drop existing FK constraints before column alterations
    this.addSql(`alter table "documents" drop constraint if exists "documents_parent_document_id_foreign";`)
    this.addSql(`alter table "document_pages" drop constraint if exists "document_pages_document_id_foreign";`)

    // documents: drop default on created_at / updated_at
    this.addSql(`alter table "documents" alter column "created_at" drop default;`)
    this.addSql(`alter table "documents" alter column "created_at" type timestamptz using ("created_at"::timestamptz);`)
    this.addSql(`alter table "documents" alter column "updated_at" drop default;`)
    this.addSql(`alter table "documents" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);`)

    // document_pages: drop default on created_at
    this.addSql(`alter table "document_pages" alter column "created_at" drop default;`)
    this.addSql(`alter table "document_pages" alter column "created_at" type timestamptz using ("created_at"::timestamptz);`)

    // Re-add FK constraints with on update cascade
    this.addSql(`alter table "documents" add constraint "documents_parent_document_id_foreign" foreign key ("parent_document_id") references "documents" ("id") on update cascade on delete set null;`)
    this.addSql(`alter table "document_pages" add constraint "document_pages_document_id_foreign" foreign key ("document_id") references "documents" ("id") on update cascade on delete cascade;`)
  }

  override async down(): Promise<void> {
    // Drop FK constraints
    this.addSql(`alter table "documents" drop constraint if exists "documents_parent_document_id_foreign";`)
    this.addSql(`alter table "document_pages" drop constraint if exists "document_pages_document_id_foreign";`)

    // Restore default now() on timestamp columns
    this.addSql(`alter table "documents" alter column "created_at" set default now();`)
    this.addSql(`alter table "documents" alter column "updated_at" set default now();`)
    this.addSql(`alter table "document_pages" alter column "created_at" set default now();`)

    // Re-add FK constraints without on update cascade (original form)
    this.addSql(`alter table "documents" add constraint "documents_parent_document_id_foreign" foreign key ("parent_document_id") references "documents" ("id") on delete set null;`)
    this.addSql(`alter table "document_pages" add constraint "document_pages_document_id_foreign" foreign key ("document_id") references "documents" ("id") on delete cascade;`)
  }
}

export default Migration20260411164524
