import { Migration } from '@mikro-orm/migrations';

export class Migration20260312165828 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "cell_annotation_assignees" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "user_id" uuid not null, "assigned_by" uuid not null, "created_at" timestamptz not null, "annotation_id" uuid not null, constraint "cell_annotation_assignees_pkey" primary key ("id"));`);
    this.addSql(`create index "cell_annotation_assignees_annotation_id_index" on "cell_annotation_assignees" ("annotation_id");`);
    this.addSql(`alter table "cell_annotation_assignees" add constraint "cell_annotation_assignees_annotation_id_user_id_unique" unique ("annotation_id", "user_id");`);

    this.addSql(`alter table "cell_annotation_assignees" add constraint "cell_annotation_assignees_annotation_id_foreign" foreign key ("annotation_id") references "cell_annotations" ("id") on update cascade;`);
  }

}
