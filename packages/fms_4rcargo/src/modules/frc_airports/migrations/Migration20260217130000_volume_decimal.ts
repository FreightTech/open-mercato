import { Migration } from '@mikro-orm/migrations'

/**
 * Change frc_truck_presets.volume from integer to numeric(10,2) for decimal precision.
 * Also recalculates existing volumes with the new precision formula.
 */
export class Migration20260217130000_volume_decimal extends Migration {

  override async up(): Promise<void> {
    // Change volume column from integer to numeric(10,2)
    this.addSql(`ALTER TABLE "frc_truck_presets" ALTER COLUMN "volume" TYPE numeric(10,2);`)

    // Recalculate existing volumes with 2 decimal precision
    // Formula: ROUND((width * length * height) / 10000) / 100
    this.addSql(`
      UPDATE "frc_truck_presets"
      SET "volume" = ROUND((width * length * height)::numeric / 10000) / 100;
    `)
  }

  override async down(): Promise<void> {
    // Revert to integer (will lose decimal precision)
    this.addSql(`ALTER TABLE "frc_truck_presets" ALTER COLUMN "volume" TYPE integer USING volume::integer;`)
  }

}
