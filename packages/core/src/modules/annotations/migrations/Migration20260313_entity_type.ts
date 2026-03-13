import { Migration } from '@mikro-orm/migrations';

export class Migration20260313_entity_type extends Migration {

  override async up(): Promise<void> {
    // 1. Add entity_type column with default empty string
    this.addSql(`alter table "cell_annotations" add column "entity_type" text not null default '';`);

    // 2. Backfill entity_type from table_id
    this.addSql(`update "cell_annotations" set "entity_type" = case
      when "table_id" in ('project_sea_containers') then 'fms_sea_container'
      when "table_id" in ('project_road_units') then 'fms_road_unit'
      when "table_id" in ('fms_projects', 'project_highlights', 'project_cutoffs') then 'fms_project'
      when "table_id" = 'project_cargo' then 'fms_project_cargo'
      when "table_id" in ('project_documents', 'fms_documents') then 'fms_document'
      when "table_id" = 'project_parties' then 'fms_project_party'
      when "table_id" = 'fms_offers' then 'fms_offer'
      when "table_id" = 'contractors' then 'fms_contractor'
      when "table_id" = 'transports' then 'fms_sea_container'
      else "table_id"
    end where "entity_type" = '';`);

    // 3. Fix road units that were in the transports table (default was fms_sea_container)
    this.addSql(`update "cell_annotations" set "entity_type" = 'fms_road_unit'
      where "table_id" = 'transports' and "entity_type" = 'fms_sea_container'
        and "row_id" in (select "id"::text from "fms_road_units");`);

    // 4. Handle duplicates before adding unique constraint.
    //    When the same (org, tenant, entityType, rowId, columnKey) exists multiple times
    //    (e.g. from project_sea_containers + transports), merge comments into the oldest
    //    annotation and soft-delete the newer duplicates.
    this.addSql(`
      with duplicates as (
        select "id",
          row_number() over (
            partition by "organization_id", "tenant_id", "entity_type", "row_id", "column_key"
            order by "created_at" asc
          ) as rn,
          first_value("id") over (
            partition by "organization_id", "tenant_id", "entity_type", "row_id", "column_key"
            order by "created_at" asc
          ) as survivor_id
        from "cell_annotations"
        where "deleted_at" is null
      )
      update "cell_comments" set "annotation_id" = d.survivor_id
      from duplicates d
      where "cell_comments"."annotation_id" = d."id" and d.rn > 1;
    `);

    this.addSql(`
      with duplicates as (
        select "id",
          row_number() over (
            partition by "organization_id", "tenant_id", "entity_type", "row_id", "column_key"
            order by "created_at" asc
          ) as rn
        from "cell_annotations"
        where "deleted_at" is null
      )
      update "cell_annotations" set "deleted_at" = now()
      from duplicates d
      where "cell_annotations"."id" = d."id" and d.rn > 1;
    `);

    // 5. Drop old unique constraint and index
    this.addSql(`alter table "cell_annotations" drop constraint if exists "cell_annotations_unique_cell";`);
    this.addSql(`drop index if exists "cell_annotations_table_row_idx";`);

    // 6. Add new unique constraint and index on entity_type
    this.addSql(`alter table "cell_annotations" add constraint "cell_annotations_unique_entity_cell" unique ("organization_id", "tenant_id", "entity_type", "row_id", "column_key");`);
    this.addSql(`create index "cell_annotations_entity_row_idx" on "cell_annotations" ("organization_id", "tenant_id", "entity_type", "row_id");`);

    // 7. Make table_id nullable (view context metadata only)
    this.addSql(`alter table "cell_annotations" alter column "table_id" drop not null;`);
  }

  override async down(): Promise<void> {
    // Make table_id required again
    this.addSql(`update "cell_annotations" set "table_id" = coalesce("table_id", "entity_type") where "table_id" is null;`);
    this.addSql(`alter table "cell_annotations" alter column "table_id" set not null;`);

    // Drop new constraint/index, restore old ones
    this.addSql(`alter table "cell_annotations" drop constraint if exists "cell_annotations_unique_entity_cell";`);
    this.addSql(`drop index if exists "cell_annotations_entity_row_idx";`);
    this.addSql(`create index "cell_annotations_table_row_idx" on "cell_annotations" ("organization_id", "tenant_id", "table_id", "row_id");`);
    this.addSql(`alter table "cell_annotations" add constraint "cell_annotations_unique_cell" unique ("organization_id", "tenant_id", "table_id", "row_id", "column_key");`);

    // Drop entity_type column
    this.addSql(`alter table "cell_annotations" drop column "entity_type";`);
  }

}
