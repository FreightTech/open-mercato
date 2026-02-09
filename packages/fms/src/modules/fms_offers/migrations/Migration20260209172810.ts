import { Migration } from '@mikro-orm/migrations';

export class Migration20260209172810 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_rfqs" add column "origin_location_id" uuid null, add column "destination_location_id" uuid null, add column "place_of_loading" text null, add column "place_of_loading_id" uuid null, add column "place_of_delivery" text null, add column "place_of_delivery_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_rfqs" drop column "origin_location_id", drop column "destination_location_id", drop column "place_of_loading", drop column "place_of_loading_id", drop column "place_of_delivery", drop column "place_of_delivery_id";`);
  }

}
