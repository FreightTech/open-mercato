import { Migration } from '@mikro-orm/migrations';

export class Migration20260207163205 extends Migration {

  override async up(): Promise<void> {
    // Update fms_projects: quote_id → rfq_id
    this.addSql(`alter table "fms_projects" drop constraint if exists "fms_projects_quote_id_foreign";`);
    this.addSql(`alter table "fms_projects" rename column "quote_id" to "rfq_id";`);
    // Clear old quote references since fms_quotes table was dropped
    this.addSql(`update "fms_projects" set "rfq_id" = null where "rfq_id" is not null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_rfq_id_foreign" foreign key ("rfq_id") references "fms_rfqs" ("id") on update cascade on delete set null;`);

    // Drop variant_id from project lines
    this.addSql(`alter table "fms_project_lines" drop column "variant_id";`);
  }

}
