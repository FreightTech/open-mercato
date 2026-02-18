import { Migration } from '@mikro-orm/migrations'

/**
 * Add route, dates, AWB numbers, and notes fields to frc_projects.
 * These fields support the new project wizard and improved offer acceptance flow.
 */
export class Migration20260218140000_project_route_fields extends Migration {

  override async up(): Promise<void> {
    // Add origin airport reference
    this.addSql(`ALTER TABLE "frc_projects" ADD COLUMN "origin_airport_id" UUID NULL;`)

    // Add destination airport reference
    this.addSql(`ALTER TABLE "frc_projects" ADD COLUMN "destination_airport_id" UUID NULL;`)

    // Add shipment ready date
    this.addSql(`ALTER TABLE "frc_projects" ADD COLUMN "shipment_ready_date" DATE NULL;`)

    // Add required delivery date
    this.addSql(`ALTER TABLE "frc_projects" ADD COLUMN "required_delivery_date" DATE NULL;`)

    // Add AWB numbers as JSONB array (multiple AWBs per project)
    this.addSql(`ALTER TABLE "frc_projects" ADD COLUMN "awb_numbers" JSONB NULL;`)

    // Add notes field
    this.addSql(`ALTER TABLE "frc_projects" ADD COLUMN "notes" TEXT NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "frc_projects" DROP COLUMN "origin_airport_id";`)
    this.addSql(`ALTER TABLE "frc_projects" DROP COLUMN "destination_airport_id";`)
    this.addSql(`ALTER TABLE "frc_projects" DROP COLUMN "shipment_ready_date";`)
    this.addSql(`ALTER TABLE "frc_projects" DROP COLUMN "required_delivery_date";`)
    this.addSql(`ALTER TABLE "frc_projects" DROP COLUMN "awb_numbers";`)
    this.addSql(`ALTER TABLE "frc_projects" DROP COLUMN "notes";`)
  }

}
