import { Migration } from '@mikro-orm/migrations';

export class Migration20260407_offer_redesign_phase1 extends Migration {

  override async up(): Promise<void> {
    // FmsOffer: new fields for multi-carrier, multi-provider, incoterm, cost grouping
    this.addSql(`alter table "fms_offers" add column "carrier_ids" jsonb null;`);
    this.addSql(`alter table "fms_offers" add column "provider_ids" jsonb null;`);
    this.addSql(`alter table "fms_offers" add column "incoterm" text null;`);
    this.addSql(`alter table "fms_offers" add column "cost_grouping_mode" text null;`);

    // Migrate existing carrier_id to carrier_ids array
    this.addSql(`update "fms_offers" set "carrier_ids" = jsonb_build_array("carrier_id") where "carrier_id" is not null;`);

    // FmsOfferCalculation: section type for tripartite cost grouping
    this.addSql(`alter table "fms_offer_calculations" add column "section_type" text null;`);

    // FmsOfferLine: quantity and client group label
    this.addSql(`alter table "fms_offer_lines" add column "quantity" numeric(18,4) not null default '1';`);
    this.addSql(`alter table "fms_offer_lines" add column "client_group_label" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offer_lines" drop column "client_group_label";`);
    this.addSql(`alter table "fms_offer_lines" drop column "quantity";`);
    this.addSql(`alter table "fms_offer_calculations" drop column "section_type";`);
    this.addSql(`alter table "fms_offers" drop column "cost_grouping_mode";`);
    this.addSql(`alter table "fms_offers" drop column "incoterm";`);
    this.addSql(`alter table "fms_offers" drop column "provider_ids";`);
    this.addSql(`alter table "fms_offers" drop column "carrier_ids";`);
  }

}
