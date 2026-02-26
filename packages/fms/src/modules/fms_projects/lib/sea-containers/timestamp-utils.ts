/**
 * Multi-source timestamp utilities for FmsSeaContainer tracking.
 *
 * Supports tracking ETD/ETA/ATD/ATA from multiple sources with full history (SCD pattern).
 * Primary value is computed using "latest update wins" strategy.
 *
 * These utilities mirror the shipment-tracking module for sync compatibility.
 */

import type { ShipmentTimestampEntry, TimestampSource } from '../../data/tracking-types'

/**
 * Computed primary timestamp with its metadata.
 */
export interface ComputedTimestamp {
  value: Date
  offset: string | null
  source: TimestampSource
  updatedAt: Date
  sourceEventId?: string | null
}

/**
 * Gets the latest (primary) timestamp from an array of entries.
 * Uses "latest update wins" strategy - the entry with most recent updatedAt is primary.
 *
 * @param entries Array of timestamp entries or null/undefined
 * @returns The latest entry or null if no entries
 */
export function getLatestTimestamp(
  entries: ShipmentTimestampEntry[] | null | undefined,
): ComputedTimestamp | null {
  if (!entries?.length) return null

  // Use >= to prefer later entries when updatedAt is equal.
  // This handles the case where entries are added in the same millisecond.
  const latest = entries.reduce((best, entry) =>
    entry.updatedAt >= best.updatedAt ? entry : best,
  )

  return {
    value: new Date(latest.value),
    offset: latest.offset,
    source: latest.source,
    updatedAt: new Date(latest.updatedAt),
    sourceEventId: latest.sourceEventId,
  }
}

/**
 * Gets the primary value as a Date, or null if no entries.
 * Convenience wrapper around getLatestTimestamp.
 */
export function getPrimaryTimestampValue(
  entries: ShipmentTimestampEntry[] | null | undefined,
): Date | null {
  return getLatestTimestamp(entries)?.value ?? null
}

/**
 * Gets the primary offset, or null if no entries.
 */
export function getPrimaryTimestampOffset(
  entries: ShipmentTimestampEntry[] | null | undefined,
): string | null {
  return getLatestTimestamp(entries)?.offset ?? null
}

/**
 * Creates a new timestamp entry for manual input.
 *
 * @param value Date value (will be converted to ISO string)
 * @param offset Optional timezone offset (e.g., "+02:00", "Z")
 * @returns A timestamp entry with source='manual'
 */
export function createManualTimestampEntry(
  value: Date | string,
  offset?: string | null,
): ShipmentTimestampEntry {
  const dateValue = value instanceof Date ? value : new Date(value)

  return {
    value: dateValue.toISOString(),
    offset: offset ?? null,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Adds a new timestamp entry to an existing array.
 * Does not mutate the original array.
 *
 * @param entries Existing entries or null
 * @param newEntry New entry to add
 * @returns New array with the entry added
 */
export function addTimestampEntry(
  entries: ShipmentTimestampEntry[] | null | undefined,
  newEntry: ShipmentTimestampEntry,
): ShipmentTimestampEntry[] {
  return [...(entries ?? []), newEntry]
}

/**
 * Updates timestamp array with a new value from a specific source.
 * If the source already has an entry, adds a new entry (history preserved).
 *
 * @param entries Existing entries or null
 * @param value New date value
 * @param source Source of the timestamp
 * @param offset Optional timezone offset
 * @param sourceEventId Optional tracking event ID
 * @returns New array with the entry added
 */
export function updateTimestamp(
  entries: ShipmentTimestampEntry[] | null | undefined,
  value: Date | string,
  source: TimestampSource,
  offset?: string | null,
  sourceEventId?: string | null,
): ShipmentTimestampEntry[] {
  const dateValue = value instanceof Date ? value : new Date(value)

  const newEntry: ShipmentTimestampEntry = {
    value: dateValue.toISOString(),
    offset: offset ?? null,
    source,
    updatedAt: new Date().toISOString(),
    sourceEventId: sourceEventId ?? undefined,
  }

  return addTimestampEntry(entries, newEntry)
}

/**
 * Formats a timestamp for display.
 * Uses the primary (latest) timestamp value.
 *
 * @param entries Timestamp entries array
 * @param options Formatting options
 * @returns Formatted date string or null
 */
export function formatPrimaryTimestamp(
  entries: ShipmentTimestampEntry[] | null | undefined,
  options?: {
    locale?: string
    dateStyle?: 'full' | 'long' | 'medium' | 'short'
    timeStyle?: 'full' | 'long' | 'medium' | 'short'
  },
): string | null {
  const timestamp = getLatestTimestamp(entries)
  if (!timestamp) return null

  const { locale = 'en-US', dateStyle = 'medium', timeStyle = 'short' } = options ?? {}

  return timestamp.value.toLocaleString(locale, { dateStyle, timeStyle })
}

/**
 * Gets timestamp history for a specific source.
 *
 * @param entries All timestamp entries
 * @param source Source to filter by
 * @returns Entries from the specified source, sorted by updatedAt desc
 */
export function getTimestampHistoryBySource(
  entries: ShipmentTimestampEntry[] | null | undefined,
  source: TimestampSource,
): ShipmentTimestampEntry[] {
  if (!entries?.length) return []

  return entries
    .filter((e) => e.source === source)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Checks if timestamps have been updated since a given date.
 *
 * @param entries Timestamp entries
 * @param since Date to compare against
 * @returns true if any entry was updated after the given date
 */
export function hasTimestampUpdatedSince(
  entries: ShipmentTimestampEntry[] | null | undefined,
  since: Date,
): boolean {
  if (!entries?.length) return false

  const sinceIso = since.toISOString()
  return entries.some((e) => e.updatedAt > sinceIso)
}

/**
 * Converts a simple Date field to a timestamp array with a single manual entry.
 * Useful for migrating old data to the new format.
 *
 * @param date Simple date value
 * @param updatedAt When the original value was set (for migration)
 * @returns Timestamp array with one manual entry, or null if date is null
 */
export function migrateSimpleDateToTimestamps(
  date: Date | null | undefined,
  updatedAt?: Date,
): ShipmentTimestampEntry[] | null {
  if (!date) return null

  return [
    {
      value: date.toISOString(),
      offset: null,
      source: 'manual',
      updatedAt: (updatedAt ?? new Date()).toISOString(),
    },
  ]
}
