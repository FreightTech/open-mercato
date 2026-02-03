'use client'

import { useMemo } from 'react'
import type { Quote, PortRef } from '../types/quote-wizard'

// =============================================================================
// Direction Mapping
// =============================================================================

const DIRECTION_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'export', label: 'Export' },
  { value: 'import', label: 'Import' },
  { value: 'both', label: 'Both' },
]

export function directionToLabel(direction: string | null | undefined): string {
  return DIRECTION_OPTIONS.find((o) => o.value === direction)?.label || 'Select'
}

export function labelToDirection(label: string): string | null {
  const option = DIRECTION_OPTIONS.find((o) => o.label === label)
  return option?.value || null
}

export { DIRECTION_OPTIONS }

// =============================================================================
// Currency Options
// =============================================================================

export const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'PLN', label: 'PLN' },
  { value: 'CNY', label: 'CNY' },
]

// =============================================================================
// Quote Header Table Data Type
// =============================================================================

export type QuoteHeaderTableRow = {
  id: string
  clientId: string | null
  clientName: string // JSON string when has ID, plain text otherwise
  operationalGuardianId: string | null
  operationalGuardianName: string // JSON string when has data
  businessGuardianId: string | null
  businessGuardianName: string // JSON string when has data
  direction: string // Label format (e.g., 'Export')
  originPorts: PortRef[]
  destinationPorts: PortRef[]
  currencyCode: string
}

// =============================================================================
// useQuoteTableData Hook
//
// Ensures consistent data format for Handsontable:
// - Entity references (client, assignedTo) are stored as JSON strings
//   when selected from search, matching what EntitySearchEditor produces
// - Ports are stored as arrays of PortRef objects
// - Direction is converted to label format for dropdown display
// =============================================================================

export function useQuoteTableData(quote: Quote | null): QuoteHeaderTableRow[] {
  return useMemo(() => {
    if (!quote) return []

    // Store client as JSON string when we have both ID and name
    // This matches what EntitySearchEditor produces
    const clientNameValue =
      quote.clientId && quote.clientName
        ? JSON.stringify({ id: quote.clientId, name: quote.clientName })
        : quote.clientName || ''

    // Store guardians as JSON string when we have data
    const operationalGuardianNameValue = quote.operationalGuardian
      ? JSON.stringify({ id: quote.operationalGuardian.id, name: quote.operationalGuardian.name })
      : ''
    const businessGuardianNameValue = quote.businessGuardian
      ? JSON.stringify({ id: quote.businessGuardian.id, name: quote.businessGuardian.name })
      : ''

    return [
      {
        id: quote.id,
        clientId: quote.clientId || null,
        clientName: clientNameValue,
        operationalGuardianId: quote.operationalGuardianId || null,
        operationalGuardianName: operationalGuardianNameValue,
        businessGuardianId: quote.businessGuardianId || null,
        businessGuardianName: businessGuardianNameValue,
        direction: directionToLabel(quote.direction),
        originPorts: quote.originPorts || [],
        destinationPorts: quote.destinationPorts || [],
        currencyCode: quote.currencyCode || 'USD',
      },
    ]
  }, [quote])
}

// =============================================================================
// Parse Helpers
//
// These helpers parse data coming back from Handsontable editors
// =============================================================================

/**
 * Parse client value from cell - can be JSON (from search) or plain text
 */
export function parseClientValue(
  value: unknown
): { clientId: string | null; clientName: string | null } {
  const strValue = String(value || '')
  if (!strValue) {
    return { clientId: null, clientName: null }
  }

  try {
    const parsed = JSON.parse(strValue)
    if (parsed && typeof parsed === 'object' && 'id' in parsed) {
      return {
        clientId: parsed.id,
        clientName: parsed.name || '',
      }
    }
  } catch {
    // Not JSON, treat as plain text
  }

  // Plain text - just clientName, no clientId
  return { clientId: null, clientName: strValue }
}

/**
 * Parse guardian value from cell
 */
export function parseGuardianValue(
  value: unknown,
  guardianType: 'operational' | 'business'
): {
  guardianId: string | null
  guardian: Quote['operationalGuardian'] | Quote['businessGuardian']
  idFieldName: 'operationalGuardianId' | 'businessGuardianId'
  guardianFieldName: 'operationalGuardian' | 'businessGuardian'
} {
  const strValue = String(value || '')
  const idFieldName = guardianType === 'operational' ? 'operationalGuardianId' : 'businessGuardianId'
  const guardianFieldName = guardianType === 'operational' ? 'operationalGuardian' : 'businessGuardian'

  if (!strValue) {
    return { guardianId: null, guardian: null, idFieldName, guardianFieldName }
  }

  try {
    const parsed = JSON.parse(strValue)
    if (parsed && typeof parsed === 'object' && 'id' in parsed) {
      return {
        guardianId: parsed.id,
        guardian: {
          id: parsed.id,
          name: parsed.name || '',
          email: '', // Email not available from search
        },
        idFieldName,
        guardianFieldName,
      }
    }
  } catch {
    // Not JSON - clear assignment
  }

  return { guardianId: null, guardian: null, idFieldName, guardianFieldName }
}

/**
 * Parse port value from multi-select cell
 */
export function parsePortValue(
  value: unknown,
  isOrigin: boolean
): {
  portIds: string[]
  ports: PortRef[]
  fieldName: 'originPortIds' | 'destinationPortIds'
  portsFieldName: 'originPorts' | 'destinationPorts'
} {
  const ports = Array.isArray(value) ? value : []
  const portIds = ports.map((p: PortRef | { id: string }) => p.id)

  // Convert to PortRef format, handling both PortRef and MultiSelectSelectedItem
  const portRefs: PortRef[] = ports.map(
    (p: PortRef | { id: string; label?: string; locode?: string; name?: string }) => ({
      id: p.id,
      locode: (p as PortRef).locode || (p as { label?: string }).label?.split(' - ')[0] || null,
      name: (p as PortRef).name || (p as { label?: string }).label || '',
    })
  )

  return {
    portIds,
    ports: portRefs,
    fieldName: isOrigin ? 'originPortIds' : 'destinationPortIds',
    portsFieldName: isOrigin ? 'originPorts' : 'destinationPorts',
  }
}
