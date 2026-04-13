import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, ParsedDocument, ConsistencyCheck, HsClassification } from '../../../../../data/entities'
import { exportOpenApi } from '../../../../../api/openapi'
import type { ProductLine } from '../../../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs.view'] },
}

export const openApi = exportOpenApi

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function buildWinSADCSV(
  shipment: CustomsShipment,
  classifications: HsClassification[],
): string {
  const lines: string[] = []

  // Header row — fields commonly needed for SAD (Single Administrative Document)
  lines.push([
    'Lp', 'Kod_HS', 'Opis_towaru', 'Kraj_pochodzenia',
    'Masa_netto_kg', 'Masa_brutto_kg', 'Ilosc', 'Jednostka',
    'Wartosc', 'Waluta', 'Stawka_celna', 'Incoterms',
    'Nadawca', 'Odbiorca', 'Nr_faktury', 'Nr_BL',
    'Port_zaladunku', 'Port_rozladunku', 'Statek',
  ].join(','))

  const productLines: ProductLine[] = shipment.productLines ?? []

  for (const line of productLines) {
    const classification = classifications.find((c) => c.lineNumber === line.lineNumber)
    const hsCode = classification?.selectedHsCode ?? line.hsCodeFromInvoice ?? ''
    const dutyRate = classification?.selectedDutyRate ?? ''

    lines.push([
      String(line.lineNumber),
      escapeCSV(hsCode),
      escapeCSV(line.description),
      escapeCSV(line.countryOfOrigin ?? ''),
      String(line.netWeightKg ?? ''),
      String(line.grossWeightKg ?? ''),
      String(line.quantity),
      escapeCSV(line.unit),
      String(line.totalValue ?? ''),
      escapeCSV(line.currency ?? ''),
      escapeCSV(dutyRate),
      escapeCSV(line.incoterms ?? ''),
      escapeCSV(shipment.shipperName ?? ''),
      escapeCSV(shipment.consigneeName ?? ''),
      escapeCSV(shipment.invoiceNumber ?? ''),
      escapeCSV(shipment.blNumber ?? ''),
      escapeCSV(shipment.loadingPort ?? ''),
      escapeCSV(shipment.dischargePort ?? ''),
      escapeCSV(shipment.vessel ?? ''),
    ].join(','))
  }

  return lines.join('\r\n')
}

export async function GET(req: Request, context: { params: Record<string, string> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shipmentId = context.params.id
  const url = new URL(req.url)
  const format = url.searchParams.get('format')

  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  const findFilter: Record<string, unknown> = {
    id: shipmentId,
    tenantId: auth.tenantId,
  }
  if (auth.orgId) findFilter.organizationId = auth.orgId

  const shipment = await em.findOne(CustomsShipment, findFilter)

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
  }

  const classifications = await em.find(HsClassification, { shipment }, {
    orderBy: { lineNumber: 'asc' } as never,
  })

  // WinSAD CSV export
  if (format === 'winsad') {
    const csv = buildWinSADCSV(shipment, classifications)
    const fileName = `SAD_${shipment.blNumber ?? shipment.invoiceNumber ?? shipment.id.slice(0, 8)}.csv`
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  // Default JSON export
  const documents = await em.find(ParsedDocument, { shipment }, {
    fields: ['id', 'documentType', 'fileName', 'extracted', 'parseError'],
  })

  const checks = await em.find(ConsistencyCheck, { shipment })
  const mismatches = checks.filter((check) => check.status === 'mismatch')
  const missingFields = checks.filter((check) => check.status === 'missing')

  return NextResponse.json({
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    shipment: {
      id: shipment.id,
      status: shipment.status,
      blNumber: shipment.blNumber,
      invoiceNumber: shipment.invoiceNumber,
      shipperName: shipment.shipperName,
      consigneeName: shipment.consigneeName,
      loadingPort: shipment.loadingPort,
      dischargePort: shipment.dischargePort,
      vessel: shipment.vessel,
      shippedOnBoard: shipment.shippedOnBoard,
      productLines: shipment.productLines,
    },
    documents: documents.map((doc) => ({
      type: doc.documentType,
      fileName: doc.fileName,
      extracted: doc.extracted,
      parseError: doc.parseError,
    })),
    consistencySummary: {
      totalChecks: checks.length,
      mismatches: mismatches.length,
      missing: missingFields.length,
      ok: checks.length - mismatches.length - missingFields.length,
      details: checks.map((check) => ({
        field: check.field,
        label: check.label,
        status: check.status,
        value1: check.value1,
        value2: check.value2,
        discrepancy: check.discrepancy,
      })),
    },
    hsClassifications: classifications.map((classification) => ({
      lineNumber: classification.lineNumber,
      productDescription: classification.productDescription,
      selectedHsCode: classification.selectedHsCode,
      selectedDescription: classification.selectedDescription,
      selectedDutyRate: classification.selectedDutyRate,
      aiSuggestions: classification.aiSuggestions,
      isztar4Results: classification.isztar4Results,
    })),
  })
}
