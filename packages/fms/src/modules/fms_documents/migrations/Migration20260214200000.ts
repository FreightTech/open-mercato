import { Migration } from '@mikro-orm/migrations';

export class Migration20260214200000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_documents" add column "processing_status" text not null default 'pending';`);
    this.addSql(`alter table "fms_documents" add column "processing_result" jsonb null;`);
    this.addSql(`alter table "fms_documents" add column "consensus_confidence" numeric(3,2) null;`);
    this.addSql(`alter table "fms_documents" add column "consensus_recommendation" text null;`);
    this.addSql(`alter table "fms_documents" add column "document_type" text null;`);
    this.addSql(`alter table "fms_documents" add column "document_type_confidence" int null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_documents" drop column "processing_status";`);
    this.addSql(`alter table "fms_documents" drop column "processing_result";`);
    this.addSql(`alter table "fms_documents" drop column "consensus_confidence";`);
    this.addSql(`alter table "fms_documents" drop column "consensus_recommendation";`);
    this.addSql(`alter table "fms_documents" drop column "document_type";`);
    this.addSql(`alter table "fms_documents" drop column "document_type_confidence";`);
  }

}
