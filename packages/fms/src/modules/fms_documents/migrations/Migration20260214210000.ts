import { Migration } from '@mikro-orm/migrations';

export class Migration20260214210000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_document_pages" (
      "id" uuid not null default gen_random_uuid(),
      "organization_id" uuid not null,
      "tenant_id" uuid not null,
      "document_id" uuid not null,
      "page_number" int not null,
      "storage_path" text not null,
      "storage_driver" text not null default 'local',
      "width" int null,
      "height" int null,
      "file_size" int null,
      "created_at" timestamptz not null default now(),
      constraint "fms_document_pages_pkey" primary key ("id")
    );`);

    this.addSql(`create index "fms_document_pages_scope_idx" on "fms_document_pages" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_document_pages_document_idx" on "fms_document_pages" ("document_id");`);

    this.addSql(`alter table "fms_document_pages" add constraint "fms_document_pages_document_id_foreign" foreign key ("document_id") references "fms_documents" ("id") on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fms_document_pages" cascade;`);
  }

}
