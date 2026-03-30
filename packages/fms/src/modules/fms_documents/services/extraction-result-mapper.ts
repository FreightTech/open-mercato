import type { FmsDocument } from '../data/entities'
import type { DocumentType } from '../data/schema-types'
import type { DocumentProcessingResult } from './pipeline/types'

export function extractString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

export function extractNumericString(data: Record<string, unknown>, path: string): string | null {
  const parts = path.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[part]
  }
  if (current == null) return null
  const num = typeof current === 'number' ? current : parseFloat(String(current))
  return isNaN(num) ? null : num.toFixed(2)
}

export function mapDocumentNumber(documentType: DocumentType, data: Record<string, unknown>): string | null {
  switch (documentType) {
    case 'invoice': return extractString(data.invoice_number)
    case 'bill_of_lading': return extractString(data.bl_number)
    case 'customs_declaration': return extractString(data.mrn_number)
    case 'delivery_note': return extractString(data.dn_number)
    case 'booking_confirmation': return extractString(data.booking_number)
    case 'packing_list': return extractString(data.packing_list_number)
    case 'vgm_certificate': return extractString(data.container_number)
    default: return null
  }
}

export function mapDocumentDate(documentType: DocumentType, data: Record<string, unknown>): Date | null {
  let dateStr: string | null = null
  switch (documentType) {
    case 'invoice': dateStr = extractString(data.invoice_date); break
    case 'bill_of_lading': dateStr = extractString(data.issue_date); break
    case 'customs_declaration': dateStr = extractString(data.declaration_date); break
    case 'delivery_note': dateStr = extractString(data.delivery_date); break
    case 'packing_list': dateStr = extractString(data.date); break
    case 'vgm_certificate': dateStr = extractString(data.weighing_date); break
    default: return null
  }
  if (!dateStr) return null
  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? null : parsed
}

export function mapSellerName(documentType: DocumentType, data: Record<string, unknown>): string | null {
  switch (documentType) {
    case 'invoice': return extractString((data.seller as any)?.name)
    case 'bill_of_lading': return extractString((data.shipper as any)?.name)
    case 'customs_declaration': return extractString((data.exporter as any)?.name)
    case 'delivery_note': return extractString((data.sender as any)?.name)
    case 'booking_confirmation': return extractString((data.shipper as any)?.name)
    case 'packing_list': return extractString((data.shipper as any)?.name)
    case 'vgm_certificate': return extractString((data.submitting_company as any)?.name)
    default: return null
  }
}

export function mapBuyerName(documentType: DocumentType, data: Record<string, unknown>): string | null {
  switch (documentType) {
    case 'invoice': return extractString((data.buyer as any)?.name)
    case 'bill_of_lading': return extractString((data.consignee as any)?.name)
    case 'customs_declaration': return extractString((data.declarant as any)?.name)
    case 'delivery_note': return extractString((data.receiver as any)?.name)
    case 'booking_confirmation': return extractString((data.consignee as any)?.name)
    case 'packing_list': return extractString((data.consignee as any)?.name)
    default: return null
  }
}

function normalizeContainerType(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim().toUpperCase()

  if (/^(20|40|45)(GP|HC|RF|OT|FR|TK|PL)$/.test(s)) return s

  const sizeMatch = s.match(/(\d{2})['']?\s*/)
  const size = sizeMatch ? sizeMatch[1] : null
  if (!size) return raw.trim()

  if (/HI[\s-]?CUBE|HIGH[\s-]?CUBE|HC/.test(s)) return `${size}HC`
  if (/REEFER|REFRIGERAT/.test(s)) return `${size}RF`
  if (/OPEN[\s-]?TOP/.test(s)) return `${size}OT`
  if (/FLAT[\s-]?RACK/.test(s)) return `${size}FR`
  if (/TANK/.test(s)) return `${size}TK`
  if (/PLATFORM/.test(s)) return `${size}PL`
  if (/STANDARD|DRY|GP/.test(s)) return `${size}GP`

  return `${size}GP`
}

export function normalizeConsensusData(data: Record<string, unknown>): Record<string, unknown> {
  if (data.currency && typeof data.currency === 'object' && !Array.isArray(data.currency)) {
    const keys = Object.keys(data.currency as Record<string, unknown>)
    data.currency = keys[0] ?? null
  }
  const totals = data.totals as Record<string, unknown> | undefined
  if (totals?.currency && typeof totals.currency === 'object' && !Array.isArray(totals.currency)) {
    const keys = Object.keys(totals.currency as Record<string, unknown>)
    totals.currency = keys[0] ?? null
  }

  const containers = data.containers
  if (Array.isArray(containers)) {
    data.containers = containers.map((c: any) => {
      if (typeof c !== 'object' || !c) return c
      const normalized: Record<string, unknown> = { ...c }
      if (!normalized.type && normalized.size_type) {
        normalized.type = normalizeContainerType(normalized.size_type)
        delete normalized.size_type
      } else if (normalized.type) {
        normalized.type = normalizeContainerType(normalized.type)
      }
      return normalized
    })
  }

  const containerDetails = data.container_details
  if (Array.isArray(containerDetails)) {
    data.container_details = containerDetails.map((c: any) => {
      if (typeof c !== 'object' || !c) return c
      const normalized: Record<string, unknown> = { ...c }
      if (normalized.container_type) {
        normalized.container_type = normalizeContainerType(normalized.container_type)
      }
      return normalized
    })
  }

  const lineItems = data.line_items
  if (Array.isArray(lineItems)) {
    data.line_items = lineItems.map((item: any) => {
      if (typeof item !== 'object' || !item) return item
      const n: Record<string, unknown> = { ...item }

      if (!n.description && n.charge) { n.description = n.charge; delete n.charge }
      if (!n.description && n.service) { n.description = n.service; delete n.service }
      if (!n.description && n.charge_name) { n.description = n.charge_name; delete n.charge_name }

      if (n.unit_price_net == null && n.rate != null) { n.unit_price_net = n.rate; delete n.rate }
      if (n.unit_price_net == null && n.unit_price != null) { n.unit_price_net = n.unit_price; delete n.unit_price }
      if (n.unit_price_net == null && n.price != null) { n.unit_price_net = n.price; delete n.price }

      if (n.net_amount == null && n.total != null) { n.net_amount = n.total; delete n.total }
      if (n.net_amount == null && n.amount != null) { n.net_amount = n.amount; delete n.amount }
      if (n.net_amount == null && n.total_amount != null) { n.net_amount = n.total_amount; delete n.total_amount }

      if (n.gross_amount == null && n.net_amount != null) { n.gross_amount = n.net_amount }

      if (typeof n.quantity === 'string') {
        const qtyMatch = (n.quantity as string).match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(.+)$/i)
        if (qtyMatch) {
          n.quantity = parseFloat(qtyMatch[1])
          if (!n.unit) n.unit = qtyMatch[2].trim()
        } else {
          const parsed = parseFloat(n.quantity as string)
          if (!isNaN(parsed)) n.quantity = parsed
        }
      }

      return n
    })
  }

  if (data.bank_account && typeof data.bank_account === 'object' && !Array.isArray(data.bank_account)) {
    const ba = data.bank_account as Record<string, unknown>
    const ibanKeys = ['EUR', 'PLN', 'USD', 'GBP', 'CHF']
    const firstIban = ibanKeys.find(k => typeof ba[k] === 'string')
    if (firstIban) {
      const parts = ibanKeys.filter(k => typeof ba[k] === 'string').map(k => `${k}: ${ba[k]}`)
      if (ba.bank_name) parts.push(`Bank: ${ba.bank_name}`)
      data.bank_account = parts.join('; ')
    }
  }

  return data
}

/**
 * Apply extraction pipeline results to an FmsDocument entity.
 * Sets all processing fields, normalizes consensus data, and maps type-specific fields.
 */
export function applyExtractionResult(document: FmsDocument, pipelineResult: DocumentProcessingResult): void {
  document.processingStatus = 'completed'
  document.processingResult = pipelineResult as unknown as Record<string, unknown>
  document.consensusConfidence = pipelineResult.consensus.overallConfidence.toFixed(2)
  document.consensusRecommendation = pipelineResult.consensus.recommendation
  document.documentType = pipelineResult.documentType
  document.documentTypeConfidence = pipelineResult.documentTypeConfidence
  document.extractedData = pipelineResult.consensus.consensusData
  document.processedAt = new Date()

  const consensusData = normalizeConsensusData(pipelineResult.consensus.consensusData)
  pipelineResult.consensus.consensusData = consensusData

  document.rawText = pipelineResult.rawText
  document.documentData = consensusData

  const transport = consensusData.transportation as Record<string, unknown> | undefined
  const routing = consensusData.routing as Record<string, unknown> | undefined
  const vessel = consensusData.vessel as Record<string, unknown> | undefined

  document.blNumber = extractString(transport?.hbl_number)
    ?? extractString(transport?.hbl_no)
    ?? extractString(transport?.bl_number)
    ?? extractString(consensusData.bl_number)
    ?? null

  document.mblNumber = extractString(transport?.mbl_number)
    ?? extractString(transport?.mbl_no)
    ?? extractString(consensusData.mbl_number)
    ?? null

  document.bookingNumber = extractString(transport?.booking_number)
    ?? extractString(transport?.job_no)
    ?? extractString(consensusData.booking_number)
    ?? null

  const containerSrc = transport?.container_numbers ?? transport?.containers_no ?? consensusData.container_details
  document.containerNumbers = Array.isArray(containerSrc)
    ? containerSrc.map((c: any) => typeof c === 'string' ? c : c?.container_number).filter(Boolean)
    : null

  const rawVessel = extractString(transport?.vessel_name) ?? extractString(transport?.vessel) ?? extractString(vessel?.name)
  if (rawVessel && rawVessel.includes('/')) {
    const [vesselPart, voyagePart] = rawVessel.split('/')
    document.vesselName = vesselPart.trim() || null
    document.voyageNumber = extractString(transport?.voyage_number) ?? (voyagePart.trim() || null)
  } else {
    document.vesselName = rawVessel ?? null
    document.voyageNumber = extractString(transport?.voyage_number) ?? extractString(vessel?.voyage_number) ?? null
  }

  document.portOfLoading = extractString(transport?.port_of_loading)
    ?? extractString(transport?.pol)
    ?? extractString(routing?.port_of_loading)
    ?? null

  document.portOfDischarge = extractString(transport?.port_of_discharge)
    ?? extractString(transport?.pod)
    ?? extractString(routing?.port_of_discharge)
    ?? null

  document.documentNumber = mapDocumentNumber(pipelineResult.documentType, consensusData)
  document.documentDate = mapDocumentDate(pipelineResult.documentType, consensusData)
  document.sellerName = mapSellerName(pipelineResult.documentType, consensusData)
  document.buyerName = mapBuyerName(pipelineResult.documentType, consensusData)
  document.currency = extractString(consensusData.currency) ?? extractString((consensusData.totals as any)?.currency) ?? null
  document.totalGrossAmount = extractNumericString(consensusData, 'totals.gross_amount') ?? extractNumericString(consensusData, 'totals.total_customs_value') ?? null

  document.lastError = null
}
