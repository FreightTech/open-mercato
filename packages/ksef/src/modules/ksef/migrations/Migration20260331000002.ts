import { Migration } from '@mikro-orm/migrations'

/**
 * Add refresh_token column to ksef_sessions.
 *
 * Previously the refresh token was incorrectly stored in the encryption_key
 * column as a fallback. This migration adds a dedicated column.
 */
export class Migration20260331000002 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "ksef_sessions" add column "refresh_token" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "ksef_sessions" drop column if exists "refresh_token";`)
  }
}
