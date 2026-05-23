import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, ParsedDocument, ConsistencyCheck } from '../../../../data/entities'
import { DocumentParserService } from '../../../../services/document-parser.service'
import { ConsistencyCheckerService } from '../../../../services/consistency-checker.service'
import type { DocumentType, NormalizedDocument } from '../../../../data/entities'
import { batchUploadOpenApi } from '../../../../api/openapi'
import {
  detectDocumentType,
  autoAssignGroups,
  smartGroupByIdentifiers,
  mergeWeightsFromPackingList,
  type FileWithIdentifiers,
  type DocumentIdentifiers,
  type FileGroupResult,
} from '../../../../services/batch-utils'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customs.manage'] },
}

export const openApi = batchUploadOpenApi

interface FileGroup {
  groupId: string
  bl: File | null
  invoice: File | null
  packingList: File | null
}

function groupFilesLegacy(
  files: Array<{ file: File; groupId: string; docType: DocumentType | null }>,
): FileGroup[] {
  const groups = new Map<string, FileGroup>()

  for (const { file, groupId, docType } of files) {
    if (!groups.has(groupId)) {
      groups.set(groupId, { groupId, bl: null, invoice: null, packingList: null })
    }
    const group = groups.get(groupId)!

    if (docType === 'bill_of_lading') {
      group.bl = file
    } else if (docType === 'commercial_invoice') {
      group.invoice = file
    } else if (docType === 'packing_list') {
      group.packingList = file
    }
  }

  return Array.from(groups.values())
}

/**
 * Convert smart grouping results back to FileGroup[] with actual File objects.
 */
function resolveGroupResults(
  results: FileGroupResult[],
  fileMap: Map<string, File>,
): FileGroup[] {
  return results.map((r) => ({
    groupId: r.groupId,
    bl: r.bl ? fileMap.get(r.bl) ?? null : null,
    invoice: r.invoice ? fileMap.get(r.invoice) ?? null : null,
    packingList: r.packingList ? fileMap.get(r.packingList) ?? null : null,
  }))
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const form = await req.formData()

  // Parse structured batch data from form
  // Expected format: files named "file_0", "file_1", etc.
  // With metadata: "meta_0", "meta_1", etc. (JSON: { groupId, docType })
  const allFiles: Array<{ file: File; groupId: string; docType: DocumentType | null }> = []
  let index = 0

  while (true) {
    const file = form.get(`file_${index}`) as File | null
    if (!file) break

    const metaRaw = form.get(`meta_${index}`) as string | null
    let groupId = '0'
    let docType: DocumentType | null = null

    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw) as { groupId?: string; docType?: string }
        groupId = meta.groupId ?? '0'
        docType = (meta.docType as DocumentType) ?? null
      } catch {
        // ignore parse errors, use defaults
      }
    }

    // Auto-detect type from filename if not explicitly provided
    if (!docType) {
      docType = detectDocumentType(file.name)
    }

    allFiles.push({ file, groupId, docType })
    index++
  }

  if (allFiles.length === 0) {
    return NextResponse.json(
      { error: 'No files provided' },
      { status: 400 },
    )
  }

  // For files where filename detection failed, use AI to detect type AND identifiers
  const unclassified = allFiles.filter((f) => !f.docType)
  const identifiersByName = new Map<string, DocumentIdentifiers>()

  if (unclassified.length > 0) {
    const parserService = new DocumentParserService()
    const detectionResults = await Promise.all(
      unclassified.map(async (entry) => {
        const buffer = Buffer.from(await entry.file.arrayBuffer())
        const base64 = buffer.toString('base64')
        const detected = await parserService.detectDocumentTypeAndIdentifiers(base64)
        return { entry, detected }
      }),
    )

    for (const { entry, detected } of detectionResults) {
      if (detected) {
        entry.docType = detected.type
        identifiersByName.set(entry.file.name, detected)
      }
    }
  }

  // For files that were already classified (by filename or user), we still need identifiers for smart grouping
  const classifiedWithoutIdentifiers = allFiles.filter((f) => f.docType && !identifiersByName.has(f.file.name))
  if (classifiedWithoutIdentifiers.length > 0 && allFiles.some((f) => f.groupId === '0')) {
    const parserService = new DocumentParserService()
    const detectionResults = await Promise.all(
      classifiedWithoutIdentifiers.map(async (entry) => {
        const buffer = Buffer.from(await entry.file.arrayBuffer())
        const base64 = buffer.toString('base64')
        const detected = await parserService.detectDocumentTypeAndIdentifiers(base64)
        return { entry, detected }
      }),
    )

    for (const { entry, detected } of detectionResults) {
      if (detected) {
        identifiersByName.set(entry.file.name, { ...detected, type: entry.docType as DocumentType })
      }
    }
  }

  // Filter to only files with a known type
  const fileEntries = allFiles.filter((f) => f.docType)

  if (fileEntries.length === 0) {
    return NextResponse.json(
      { error: 'Could not determine document types. Please assign types manually or use descriptive filenames (e.g., bl_01.pdf, invoice_01.pdf, packing_01.pdf).' },
      { status: 400 },
    )
  }

  // Build file lookup map for resolving group results back to File objects
  const fileMap = new Map<string, File>()
  for (const entry of fileEntries) {
    fileMap.set(entry.file.name, entry.file)
  }

  // Determine grouping strategy
  const needsRegrouping = fileEntries.every((f) => f.groupId === '0')
  let validGroups: FileGroup[]

  // Log extracted identifiers for debugging
  console.log('[customs] Batch grouping — identifiers extracted:')
  for (const [name, ids] of identifiersByName.entries()) {
    console.log(`  ${name}: type=${ids.type}, bl=${ids.blNumber ?? '-'}, inv=${ids.invoiceNumber ?? '-'}, shipper=${ids.shipperName ?? '-'}, vessel=${ids.vessel ?? '-'}`)
  }

  if (needsRegrouping && fileEntries.length > 1 && identifiersByName.size > 0) {
    // Smart grouping: use AI-extracted identifiers to match documents
    const filesWithIds: FileWithIdentifiers[] = fileEntries
      .filter((f): f is typeof f & { docType: DocumentType } => f.docType !== null)
      .map((f) => ({
        name: f.file.name,
        docType: f.docType,
        identifiers: identifiersByName.get(f.file.name) ?? { type: f.docType },
      }))

    const smartResults = smartGroupByIdentifiers(filesWithIds)

    // Log grouping results
    console.log('[customs] Batch grouping — smart group results:')
    for (const g of smartResults) {
      console.log(`  Group ${g.groupId}: bl=${g.bl ?? '-'}, inv=${g.invoice ?? '-'}, pl=${g.packingList ?? '-'}`)
    }

    validGroups = resolveGroupResults(smartResults, fileMap).filter(
      (g) => g.bl || g.invoice || g.packingList,
    )
  } else if (needsRegrouping && fileEntries.length > 1) {
    // Fallback: round-robin grouping when no identifiers available
    const regrouped = autoAssignGroups(
      fileEntries.map((f) => ({ name: f.file.name, docType: f.docType })),
    )
    for (let idx = 0; idx < fileEntries.length; idx++) {
      fileEntries[idx].groupId = regrouped[idx].groupId
    }
    validGroups = groupFilesLegacy(fileEntries).filter(
      (g) => g.bl || g.invoice || g.packingList,
    )
  } else {
    // User-provided groupIds or single file — use as-is
    validGroups = groupFilesLegacy(fileEntries).filter(
      (g) => g.bl || g.invoice || g.packingList,
    )
  }

  if (validGroups.length === 0) {
    return NextResponse.json(
      { error: 'No valid document groups found' },
      { status: 400 },
    )
  }

  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  const createdShipments: Array<{ id: string; groupId: string; fileCount: number }> = []

  for (const group of validGroups) {
    const now = new Date()
    const shipment = em.create(CustomsShipment, {
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      status: 'uploading',
      createdAt: now,
      updatedAt: now,
    })
    await em.persist(shipment).flush()

    const docEntries: Array<{ file: File; type: DocumentType }> = []
    if (group.bl) docEntries.push({ file: group.bl, type: 'bill_of_lading' })
    if (group.invoice) docEntries.push({ file: group.invoice, type: 'commercial_invoice' })
    if (group.packingList) docEntries.push({ file: group.packingList, type: 'packing_list' })

    for (const entry of docEntries) {
      const buffer = Buffer.from(await entry.file.arrayBuffer())
      const base64 = buffer.toString('base64')

      em.create(ParsedDocument, {
        shipment,
        documentType: entry.type,
        fileName: entry.file.name || `${entry.type}.pdf`,
        fileData: base64,
        tenantId: auth.tenantId,
        organizationId: auth.orgId,
        createdAt: new Date(),
      })
    }
    await em.flush()

    shipment.status = 'parsing'
    await em.flush()

    createdShipments.push({
      id: shipment.id,
      groupId: group.groupId,
      fileCount: docEntries.length,
    })

    // Background parsing (fire and forget)
    parseAndCheck(shipment.id, auth.tenantId, auth.orgId).catch((error) => {
      console.error(`[customs] Batch parsing failed for shipment ${shipment.id}:`, error)
    })
  }

  return NextResponse.json({
    ok: true,
    shipments: createdShipments,
    totalGroups: validGroups.length,
  }, { status: 201 })
}

async function parseAndCheck(
  shipmentId: string,
  tenantId: string,
  orgId: string,
): Promise<void> {
  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager
  const parserService = new DocumentParserService()
  const checkerService = new ConsistencyCheckerService()

  const shipment = await em.findOneOrFail(CustomsShipment, { id: shipmentId })
  const documents = await em.find(ParsedDocument, { shipment }, { populate: ['fileData'] })

  let hasError = false
  const extractedByType: Record<string, NormalizedDocument | null> = {}

  for (const doc of documents) {
    const { extracted, parseError } = await parserService.parseDocument(
      doc.fileData,
      doc.documentType,
    )
    doc.extracted = extracted
    doc.parseError = parseError
    extractedByType[doc.documentType] = extracted ?? null

    if (parseError) {
      hasError = true
    }
  }

  await em.flush()

  const blData = extractedByType['bill_of_lading']
  const invoiceData = extractedByType['commercial_invoice']

  if (blData) {
    shipment.blNumber = blData.documentNumber ?? null
    shipment.shipperName = blData.shipperName ?? null
    shipment.consigneeName = blData.consigneeName ?? null
    shipment.loadingPort = blData.loadingPort ?? null
    shipment.dischargePort = blData.dischargePort ?? null
    shipment.vessel = blData.vessel ?? null
    shipment.shippedOnBoard = blData.shippedOnBoard ?? null
  }

  if (invoiceData) {
    shipment.invoiceNumber = invoiceData.documentNumber ?? null
    shipment.productLines = mergeWeightsFromPackingList(invoiceData, extractedByType['packing_list'] ?? null) ?? invoiceData.productLines ?? null
  }

  const blDoc = extractedByType['bill_of_lading'] ?? null
  const invDoc = extractedByType['commercial_invoice'] ?? null
  const plDoc = extractedByType['packing_list'] ?? null

  const checkResults = checkerService.runChecks(blDoc, invDoc, plDoc)

  const oldChecks = await em.find(ConsistencyCheck, { shipment })
  for (const old of oldChecks) {
    em.remove(old)
  }

  for (const result of checkResults) {
    em.create(ConsistencyCheck, {
      shipment,
      field: result.field,
      label: result.label,
      sourceDoc1: result.sourceDoc1,
      sourceDoc2: result.sourceDoc2,
      value1: result.value1,
      value2: result.value2,
      status: result.status,
      discrepancy: result.discrepancy,
      tenantId,
      organizationId: orgId,
      createdAt: new Date(),
    })
  }

  shipment.status = hasError ? 'error' : 'ready'
  await em.flush()
}
