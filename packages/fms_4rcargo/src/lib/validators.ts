import { z } from 'zod'

// ============================================
// 4R Cargo FMS - Shared Zod Validators
// ============================================

/**
 * Schema for numeric string fields that accept both string and number inputs.
 * Transforms numbers to strings for database storage.
 *
 * Use for: dimensions (cm), weights (kg), monetary values, rates, volumes, etc.
 *
 * Examples:
 *   - Input: 123 (number) -> Output: "123" (string)
 *   - Input: "123.45" (string) -> Output: "123.45" (string)
 *   - Input: null -> Output: null
 *   - Input: undefined -> Output: undefined
 */
export const numericString = z
  .union([z.string(), z.number().transform(String)])
  .nullable()
  .optional()

/**
 * Numeric string with a default value.
 * Use when the field should never be null/undefined in the output.
 *
 * @param defaultValue - The default string value (e.g., '0')
 *
 * Examples:
 *   - Input: 123 -> Output: "123"
 *   - Input: undefined -> Output: "0" (default)
 *   - Input: null -> Output: "0" (default)
 */
export const numericStringWithDefault = (defaultValue: string) =>
  z
    .union([z.string(), z.number().transform(String)])
    .nullable()
    .optional()
    .transform((val) => val ?? defaultValue)
