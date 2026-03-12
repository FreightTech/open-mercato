import React from 'react'
import ReactPDF, { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../data/entities'
import { generatePdf } from '../../pdf_templates'

// -- Direction / Transport Mode / Cargo Type labels (no JSX icons for PDF) --
const DIRECTION_LABELS: Record<string, string> = {
  import: 'Import',
  export: 'Export',
  both: 'Import & Export',
}
const TRANSPORT_MODE_LABELS: Record<string, string> = {
  sea: 'Sea',
  air: 'Air',
  rail: 'Rail',
  road: 'Road',
  barge: 'Barge',
}
const CARGO_TYPE_LABELS: Record<string, string> = {
  general: 'General',
  dangerous: 'Dangerous Goods',
  perishable: 'Perishable',
  oog: 'Out-of-Gauge (OOG)',
}

// -- Colors matching preview --
const ACCENT = '#1e3a5f'
const ACCENT_LIGHT = '#eef2f7'
const BORDER = '#dce3ed'
const TEXT_PRIMARY = '#1f2937'
const TEXT_SECONDARY = '#6b7280'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: TEXT_PRIMARY,
  },
  // -- Header --
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: ACCENT,
    marginBottom: 4,
  },
  companyDetail: {
    fontSize: 8,
    color: TEXT_SECONDARY,
    marginBottom: 2,
  },
  offerBadge: {
    borderWidth: 2,
    borderColor: ACCENT,
    borderRadius: 6,
    padding: '8 16',
    alignItems: 'flex-end',
  },
  offerBadgeLabel: {
    fontSize: 8,
    color: ACCENT,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offerBadgeNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: ACCENT,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  dateLabel: {
    fontSize: 9,
    color: TEXT_SECONDARY,
    marginRight: 4,
  },
  dateValue: {
    fontSize: 9,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginVertical: 14,
  },
  // -- Section labels --
  sectionLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: ACCENT,
    marginBottom: 8,
  },
  // -- Customer block --
  customerBlock: {
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 6,
    padding: '10 14',
    marginBottom: 16,
  },
  customerName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
    marginBottom: 2,
  },
  customerAddress: {
    fontSize: 9,
    color: '#4b5563',
    marginBottom: 1,
  },
  // -- Shipment details grid --
  detailsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  detailCell: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 8,
    color: TEXT_SECONDARY,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  // -- Route block --
  routeBlock: {
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 6,
    padding: '10 14',
    flexDirection: 'row',
    marginBottom: 20,
  },
  // -- Table --
  table: {
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeaderAccent: {
    height: 2,
    backgroundColor: ACCENT,
    borderRadius: 1,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  headerText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
  },
  cellText: {
    fontSize: 9,
  },
  cellBold: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  colDescription: { width: '40%' },
  colContainer: { width: '15%' },
  colCurrency: { width: '15%' },
  colValue: { width: '15%', textAlign: 'right' },
  colDescriptionNoContainer: { width: '50%' },
  colCurrencyNoContainer: { width: '20%' },
  colValueNoContainer: { width: '30%', textAlign: 'right' },
  // -- Terms --
  termsSection: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  termsLine: {
    fontSize: 9,
    color: TEXT_PRIMARY,
    lineHeight: 1.7,
    marginBottom: 2,
  },
  // -- Footer --
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#a0aec0',
  },
})

function formatCurrency(value: number | string, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0.00'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  } catch {
    return '—'
  }
}

type PdfContractorData = {
  name: string
} | null

type PdfAddressData = {
  addressLine1: string | null
  city: string | null
  postalCode: string | null
  country: string | null
} | null

type PdfLocationData = {
  id: string
  name: string
  code: string | null
}

function OfferPdfDocument({
  offer,
  companyName,
  contractor,
  billingAddress,
  locations,
}: {
  offer: FmsOffer
  companyName: string
  contractor: PdfContractorData
  billingAddress: PdfAddressData
  locations: PdfLocationData[]
}) {
  const allLines = offer.calculations?.getItems().flatMap(c => c.lines?.getItems() || []) || []
  const enabledLines = allLines.filter(l => l.isEnabled)
  const currency = enabledLines[0]?.currencyCode || 'USD'
  const rfq = offer.rfq
  const hasContainerType = enabledLines.some(l => l.containerType)

  // Resolve direction/transport/cargo labels
  const direction = offer.direction || rfq?.direction
  const transportMode = offer.transportMode || rfq?.transportMode
  const cargoType = offer.cargoType || rfq?.cargoType

  const directionLabel = direction ? (DIRECTION_LABELS[direction] || direction) : '—'
  const transportModeLabel = transportMode ? (TRANSPORT_MODE_LABELS[transportMode] || transportMode) : '—'
  const cargoTypeLabel = cargoType ? (CARGO_TYPE_LABELS[cargoType] || cargoType) : '—'

  // Route from RFQ text fields
  const origin = rfq?.origin || '—'
  const destination = rfq?.destination || '—'

  // Contractor & billing address
  const customerName = contractor?.name || rfq?.companyName || '—'
  const addressLines: string[] = []
  if (billingAddress) {
    if (billingAddress.addressLine1) addressLines.push(billingAddress.addressLine1)
    const cityLine = [billingAddress.postalCode, billingAddress.city].filter(Boolean).join(' ')
    if (cityLine) {
      addressLines.push(billingAddress.country ? `${cityLine}, ${billingAddress.country}` : cityLine)
    } else if (billingAddress.country) {
      addressLines.push(billingAddress.country)
    }
  }

  // Column styles based on whether container type column is present
  const colDesc = hasContainerType ? styles.colDescription : styles.colDescriptionNoContainer
  const colCur = hasContainerType ? styles.colCurrency : styles.colCurrencyNoContainer
  const colVal = hasContainerType ? styles.colValue : styles.colValueNoContainer

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── HEADER ── */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>{companyName}</Text>
          </View>
          <View>
            <View style={styles.offerBadge}>
              <Text style={styles.offerBadgeLabel}>Offer Number</Text>
              <Text style={styles.offerBadgeNumber}>{offer.offerNumber}</Text>
            </View>
          </View>
        </View>

        {/* Dates */}
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Date:</Text>
          <Text style={styles.dateValue}>{formatDate(offer.createdAt)}</Text>
        </View>
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Valid until:</Text>
          <Text style={styles.dateValue}>{formatDate(offer.validUntil)}</Text>
        </View>

        <View style={styles.divider} />

        {/* ── CUSTOMER ── */}
        <Text style={styles.sectionLabel}>Customer</Text>
        <View style={styles.customerBlock}>
          <Text style={styles.customerName}>{customerName}</Text>
          {addressLines.map((line, i) => (
            <Text key={i} style={styles.customerAddress}>{line}</Text>
          ))}
        </View>

        {/* ── SHIPMENT DETAILS ── */}
        <Text style={styles.sectionLabel}>Shipment Details</Text>
        <View style={styles.detailsRow}>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>{directionLabel}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Transport Mode</Text>
            <Text style={styles.detailValue}>{transportModeLabel}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Cargo Type</Text>
            <Text style={styles.detailValue}>{cargoTypeLabel}</Text>
          </View>
        </View>

        {/* ── ROUTE ── */}
        <Text style={styles.sectionLabel}>Route</Text>
        <View style={styles.routeBlock}>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>From</Text>
            <Text style={styles.detailValue}>{origin}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>To</Text>
            <Text style={styles.detailValue}>{destination}</Text>
          </View>
        </View>

        {/* ── LINES TABLE ── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, colDesc]}>Description</Text>
            {hasContainerType && <Text style={[styles.headerText, styles.colContainer]}>Container</Text>}
            <Text style={[styles.headerText, colCur]}>Currency</Text>
            <Text style={[styles.headerText, colVal]}>Value</Text>
          </View>
          <View style={styles.tableHeaderAccent} />
          {enabledLines.map((line) => (
            <View key={line.id} style={styles.tableRow}>
              <Text style={[styles.cellBold, colDesc]}>{line.productName || line.chargeCode || '—'}</Text>
              {hasContainerType && <Text style={[styles.cellText, styles.colContainer]}>{line.containerType || '—'}</Text>}
              <Text style={[styles.cellText, colCur]}>{line.currencyCode}</Text>
              <Text style={[styles.cellBold, colVal]}>{formatCurrency(line.sellPrice, line.currencyCode)}</Text>
            </View>
          ))}
        </View>

        {/* ── TERMS & CONDITIONS ── */}
        <View style={styles.termsSection}>
          <Text style={styles.sectionLabel}>Terms & Conditions</Text>
          {offer.validUntil && (
            <Text style={styles.termsLine}>
              {'\u2022'} This offer is valid until {formatDate(offer.validUntil)}.
            </Text>
          )}
          <Text style={styles.termsLine}>
            {'\u2022'} Payment terms: {offer.paymentTerms || 'Net 30 days from invoice date.'}
          </Text>
          {offer.specialTerms ? (
            <Text style={styles.termsLine}>{'\u2022'} {offer.specialTerms}</Text>
          ) : (
            <>
              <Text style={styles.termsLine}>{'\u2022'} Rates are subject to availability and may change based on market conditions.</Text>
              <Text style={styles.termsLine}>{'\u2022'} Additional charges may apply for special handling, customs clearance delays, or demurrage.</Text>
            </>
          )}
          {offer.customerNotes && (
            <Text style={styles.termsLine}>{'\u2022'} {offer.customerNotes}</Text>
          )}
        </View>

        {/* ── FOOTER ── */}
        <View style={styles.footer}>
          <Text>Generated {formatDate(new Date())}</Text>
          <Text>{companyName}</Text>
        </View>
      </Page>
    </Document>
  )
}

/**
 * Generate offer PDF using the template system.
 * When tenant/org context is available, uses the template-based renderer
 * which respects PDF settings (company name, logo, colors, footer, etc.).
 * Falls back to legacy React PDF when no tenant/org context exists.
 */
export async function generateOfferPdf(
  offerId: string,
  em: EntityManager,
  options?: { tenantId?: string; organizationId?: string; brandId?: string }
): Promise<Buffer> {
  const offer = await em.findOne(
    FmsOffer,
    { id: offerId, deletedAt: null },
    {
      populate: ['rfq', 'calculations', 'calculations.lines'],
    }
  )

  if (!offer) {
    throw new Error('Offer not found')
  }

  const tenantId = options?.tenantId || offer.tenantId
  const organizationId = options?.organizationId || offer.organizationId

  if (tenantId && organizationId) {
    // Use template-based PDF generation when we have tenant/org context.
    // This correctly loads PdfSettings (company name, logo, colors, footer, terms)
    // and falls back to the default HTML template if no custom template is saved.
    return generateOfferPdfFromTemplate(offer, em, tenantId, organizationId, options?.brandId)
  }

  // Fall back to legacy React PDF renderer when no tenant/org context
  return generateOfferPdfLegacy(offer, em)
}

/**
 * Generate offer PDF using HTML/CSS templates with Puppeteer rendering.
 * This method respects tenant-specific PDF settings including company branding,
 * colors, logo, footer, and terms & conditions.
 */
async function generateOfferPdfFromTemplate(
  offer: FmsOffer,
  em: EntityManager,
  tenantId: string,
  organizationId: string,
  brandId?: string
): Promise<Buffer> {
  const rfq = offer.rfq
  const allLines = offer.calculations?.getItems().flatMap(c => c.lines?.getItems() || []) || []
  const enabledLines = allLines.filter(l => l.isEnabled)
  const isExpired = offer.validUntil && new Date(offer.validUntil) < new Date()

  // Get currency from first enabled line or default to USD
  const currencyCode = enabledLines[0]?.currencyCode || 'USD'

  // Resolve contractor info (name + tax_id)
  let clientName = ''
  let clientTaxId = ''
  const contractorId = offer.contractorId || rfq?.contractorId
  if (contractorId) {
    const rows = await em.getConnection().execute(
      'SELECT name, tax_id FROM contractors WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [contractorId],
    )
    if (rows.length > 0) {
      clientName = rows[0].name || ''
      clientTaxId = rows[0].tax_id || ''
    }
  }
  // Fallback to RFQ company name if no contractor
  if (!clientName && rfq?.companyName) {
    clientName = rfq.companyName
  }

  // Resolve billing address
  let clientAddress = ''
  if (offer.billingAddressId) {
    const rows = await em.getConnection().execute(
      'SELECT address_line1, city, postal_code, country FROM fms_locations WHERE id = ? LIMIT 1',
      [offer.billingAddressId],
    )
    if (rows.length > 0) {
      const parts = [
        rows[0].address_line1,
        [rows[0].postal_code, rows[0].city].filter(Boolean).join(' '),
        rows[0].country,
      ].filter(Boolean)
      clientAddress = parts.join(', ')
    }
  }

  // Resolve location names for route labels
  const locationIds = offer.calculations?.getItems().flatMap(c => [
    c.originLocationId,
    c.destinationLocationId,
    c.placeOfLoadingId,
    c.placeOfDeliveryId,
  ]).filter(Boolean) as string[] || []
  const locationMap = new Map<string, { name: string; code: string | null }>()
  if (locationIds.length > 0) {
    const uniqueIds = [...new Set(locationIds)]
    const locRows = await em.getConnection().execute(
      `SELECT id, name, code FROM fms_locations WHERE id IN (${uniqueIds.map(() => '?').join(',')})`,
      uniqueIds,
    )
    for (const row of locRows) {
      locationMap.set(row.id, { name: row.name, code: row.code })
    }
  }

  // Resolve direction/transport mode/cargo type
  const direction = offer.direction || rfq?.direction
  const transportMode = offer.transportMode || rfq?.transportMode
  const cargoType = offer.cargoType || rfq?.cargoType

  const directionLabel = direction ? (DIRECTION_LABELS[direction] || direction).toUpperCase() : ''
  const cargoTypeLabel = cargoType ? (CARGO_TYPE_LABELS[cargoType] || cargoType).toUpperCase() : ''

  // Format exchange rates if present
  let exchangeRatesStr = ''
  if (offer.exchangeRates && Array.isArray(offer.exchangeRates)) {
    exchangeRatesStr = offer.exchangeRates
      .map((er) => `${er.fromCurrencyCode}/${er.toCurrencyCode}: ${er.rate}`)
      .join(', ')
  }

  // Build route label
  const buildRouteLabel = (originId?: string | null, destId?: string | null): string => {
    const origin = originId ? locationMap.get(originId)?.name : rfq?.origin
    const dest = destId ? locationMap.get(destId)?.name : rfq?.destination
    const prefix = [directionLabel, cargoTypeLabel].filter(Boolean).join('/')
    const route = [origin || '?', dest || '?'].join(' → ')
    return prefix ? `${prefix}  ${route}` : route
  }

  // Build routes array (one route per calculation)
  const calculations = offer.calculations?.getItems() || []
  const routes = calculations.map((calc) => {
    const calcLines = calc.lines?.getItems().filter(l => l.isEnabled) || []
    const routeLabel = buildRouteLabel(calc.originLocationId, calc.destinationLocationId)
    const transportModeClass = `mode-${transportMode || 'sea'}`

    return {
      routeLabel,
      transportModeClass,
      // Include label vars at route level for table headers in templates
      labelLineNumber: 'No.',
      labelName: 'Description',
      labelCurrencyCol: 'Currency',
      labelFeeScope: 'Container',
      labelQuantity: 'Qty',
      labelRate: 'Unit Price',
      labelTotal: 'Amount',
      lines: calcLines.map((line, index) => ({
        lineNumber: String(line.lineNumber || index + 1),
        productName: line.productName || line.chargeCode || '-',
        currencyCode: line.currencyCode,
        containerSize: line.containerType || '-',
        quantity: '1',
        unitPrice: formatCurrencyWithSymbol(line.sellPrice, line.currencyCode),
        amount: formatCurrencyWithSymbol(line.sellPrice, line.currencyCode),
      })),
    }
  })

  // If no calculations but we have enabled lines, create a single route
  if (routes.length === 0 && enabledLines.length > 0) {
    const routeLabel = buildRouteLabel(null, null)
    routes.push({
      routeLabel,
      transportModeClass: `mode-${transportMode || 'sea'}`,
      labelLineNumber: 'No.',
      labelName: 'Description',
      labelCurrencyCol: 'Currency',
      labelFeeScope: 'Container',
      labelQuantity: 'Qty',
      labelRate: 'Unit Price',
      labelTotal: 'Amount',
      lines: enabledLines.map((line, index) => ({
        lineNumber: String(line.lineNumber || index + 1),
        productName: line.productName || line.chargeCode || '-',
        currencyCode: line.currencyCode,
        containerSize: line.containerType || '-',
        quantity: '1',
        unitPrice: formatCurrencyWithSymbol(line.sellPrice, line.currencyCode),
        amount: formatCurrencyWithSymbol(line.sellPrice, line.currencyCode),
      })),
    })
  }

  // Label variables (English defaults - can be customized via template)
  const labelVars = {
    labelOffer: 'OFFER',
    labelClient: 'CLIENT',
    labelTaxId: 'Tax ID',
    labelIncoterms: 'Incoterms',
    labelValidity: 'Valid until',
    labelPaymentTerms: 'Payment terms',
    labelCargo: 'Cargo',
    labelCargoType: 'Cargo type',
    labelCurrency: 'Currency',
    labelLineNumber: 'No.',
    labelName: 'Description',
    labelCurrencyCol: 'Currency',
    labelFeeScope: 'Container',
    labelQuantity: 'Qty',
    labelRate: 'Unit Price',
    labelTotal: 'Amount',
    labelCustomerNotes: 'Customer Notes',
    labelExchangeRates: 'Exchange Rates',
    labelTermsTitle: 'TERMS & CONDITIONS',
  }

  const variables = {
    ...labelVars,
    offerNumber: offer.offerNumber,
    version: String(offer.version),
    status: offer.status,
    createdDate: formatDate(offer.createdAt),
    validUntil: offer.validUntil ? formatDate(offer.validUntil) : '',
    isExpired: !!isExpired,
    clientName,
    clientAddress,
    clientTaxId,
    incoterms: '', // Skipped - not available in current model
    cargoDescription: offer.notes || '',
    cargoType: cargoTypeLabel,
    currencyCode,
    paymentTerms: offer.paymentTerms || '',
    customerNotes: offer.customerNotes || '',
    exchangeRates: exchangeRatesStr,
    routes,
  }

  return generatePdf({
    em,
    tenantId,
    organizationId,
    templateType: 'offer',
    variables,
    brandId,
  })
}

/**
 * Format currency value with symbol using Intl.NumberFormat
 */
function formatCurrencyWithSymbol(value: number | string, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Legacy offer PDF generation using React PDF renderer.
 * Used as fallback when no tenant/org context is available.
 */
async function generateOfferPdfLegacy(offer: FmsOffer, em: EntityManager): Promise<Buffer> {
  // Resolve contractor name
  let contractor: PdfContractorData = null
  const contractorId = offer.contractorId || offer.rfq?.contractorId
  if (contractorId) {
    const rows = await em.getConnection().execute(
      'SELECT name FROM contractors WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [contractorId],
    )
    if (rows.length > 0) {
      contractor = { name: rows[0].name }
    }
  }

  // Resolve billing address
  let billingAddress: PdfAddressData = null
  if (offer.billingAddressId) {
    const rows = await em.getConnection().execute(
      'SELECT address_line1, city, postal_code, country FROM fms_locations WHERE id = ? LIMIT 1',
      [offer.billingAddressId],
    )
    if (rows.length > 0) {
      billingAddress = {
        addressLine1: rows[0].address_line1,
        city: rows[0].city,
        postalCode: rows[0].postal_code,
        country: rows[0].country,
      }
    }
  }

  // Resolve locations for route display (not used in current PDF but available)
  const locationIds = offer.calculations?.getItems().flatMap(c => [
    c.originLocationId,
    c.destinationLocationId,
    c.placeOfLoadingId,
    c.placeOfDeliveryId,
  ]).filter(Boolean) || []
  let locations: PdfLocationData[] = []
  if (locationIds.length > 0) {
    const uniqueIds = [...new Set(locationIds)]
    locations = await em.getConnection().execute(
      `SELECT id, name, code FROM fms_locations WHERE id IN (${uniqueIds.map(() => '?').join(',')})`,
      uniqueIds,
    )
  }

  // Resolve company name from tenant/organization (fallback to brand name)
  let companyName = 'Transport Solutions'
  try {
    const tenantRows = await em.getConnection().execute(
      'SELECT name FROM tenants WHERE id = ? LIMIT 1',
      [offer.tenantId],
    )
    if (tenantRows.length > 0 && tenantRows[0].name) {
      companyName = tenantRows[0].name
    }
  } catch {
    // Fallback to default if tenant table doesn't exist or query fails
  }

  const pdfStream = await ReactPDF.renderToStream(
    <OfferPdfDocument
      offer={offer}
      companyName={companyName}
      contractor={contractor}
      billingAddress={billingAddress}
      locations={locations}
    />
  )

  // Convert stream to buffer
  const chunks: Buffer[] = []
  for await (const chunk of pdfStream) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

export async function getOfferForPdf(offerId: string, em: EntityManager): Promise<FmsOffer | null> {
  return em.findOne(
    FmsOffer,
    { id: offerId, deletedAt: null },
    {
      populate: ['rfq', 'calculations', 'calculations.lines'],
    }
  )
}
