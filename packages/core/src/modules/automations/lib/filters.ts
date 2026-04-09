import type { FilterCondition, FilterOperator, ContextMapping } from '../data/entities'

// ============================================================================
// Nested Value Access
// ============================================================================

export function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined

  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

// ============================================================================
// Condition Evaluation
// ============================================================================

function evaluateCondition(condition: FilterCondition, data: Record<string, unknown>): boolean {
  const value = getNestedValue(data, condition.field)
  const expected = condition.value

  switch (condition.operator) {
    case 'eq':
      return value === expected

    case 'neq':
      return value !== expected

    case 'gt':
      return typeof value === 'number' && typeof expected === 'number' && value > expected

    case 'gte':
      return typeof value === 'number' && typeof expected === 'number' && value >= expected

    case 'lt':
      return typeof value === 'number' && typeof expected === 'number' && value < expected

    case 'lte':
      return typeof value === 'number' && typeof expected === 'number' && value <= expected

    case 'contains':
      if (typeof value === 'string' && typeof expected === 'string') {
        return value.includes(expected)
      }
      if (Array.isArray(value)) {
        return value.includes(expected)
      }
      return false

    case 'startsWith':
      return typeof value === 'string' && typeof expected === 'string' && value.startsWith(expected)

    case 'endsWith':
      return typeof value === 'string' && typeof expected === 'string' && value.endsWith(expected)

    case 'in':
      return Array.isArray(expected) && expected.includes(value)

    case 'notIn':
      return Array.isArray(expected) && !expected.includes(value)

    case 'exists':
      return value !== undefined && value !== null

    case 'notExists':
      return value === undefined || value === null

    case 'regex':
      if (typeof value !== 'string' || typeof expected !== 'string') return false
      try {
        return new RegExp(expected).test(value)
      } catch {
        return false
      }

    default:
      return false
  }
}

export function evaluateFilterConditions(
  conditions: FilterCondition[] | undefined,
  data: Record<string, unknown>,
  combineMode: 'AND' | 'OR' = 'AND'
): boolean {
  if (!conditions || conditions.length === 0) return true

  if (combineMode === 'OR') {
    return conditions.some(condition => evaluateCondition(condition, data))
  }

  return conditions.every(condition => evaluateCondition(condition, data))
}

// ============================================================================
// Context Mapping
// ============================================================================

export function mapDataToContext(
  mapping: ContextMapping[] | undefined,
  data: Record<string, unknown>
): Record<string, unknown> {
  const context: Record<string, unknown> = {}

  if (!mapping || mapping.length === 0) return context

  for (const item of mapping) {
    const value = getNestedValue(data, item.sourceExpression)
    context[item.targetKey] = value !== undefined ? value : item.defaultValue
  }

  return context
}
