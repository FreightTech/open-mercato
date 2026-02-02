import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
  buildChanges,
  requireId,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject, FmsProjectInvoice, type InvoiceLineItem, type InvoiceParty } from '../data/entities'
import {
  fmsProjectInvoiceCreateSchema,
  fmsProjectInvoiceUpdateSchema,
  fmsProjectInvoiceReviewSchema,
  type FmsProjectInvoiceCreateInput,
  type FmsProjectInvoiceUpdateInput,
  type FmsProjectInvoiceReviewInput,
} from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'
import type { InvoiceConfidenceLevel, InvoiceReviewStatus } from '../data/types'

const projectInvoiceCrudIndexer: CrudIndexerConfig<FmsProjectInvoice> = {
  entityType: E.fms_projects.fms_project_invoice,
}

type ProjectInvoiceSnapshot = {
  id: string
  projectId: string
  organizationId: string
  tenantId: string
  documentId: string
  invoiceNumber: string | null
  sellerName: string | null
  sellerNip: string | null
  sellerDetails: InvoiceParty | null
  buyerName: string | null
  buyerNip: string | null
  buyerDetails: InvoiceParty | null
  netAmount: string | null
  vatAmount: string | null
  grossAmount: string | null
  currencyCode: string
  invoiceDate: Date | null
  paymentDueDate: Date | null
  serviceDate: Date | null
  paymentMethod: string | null
  lineItems: InvoiceLineItem[] | null
  confidence: InvoiceConfidenceLevel
  extractionStrategies: string[] | null
  rawExtractionData: Record<string, any> | null
  status: InvoiceReviewStatus
  reviewedBy: string | null
  reviewedAt: Date | null
  reviewNotes: string | null
  createdAt: Date
  updatedAt: Date
}

type ProjectInvoiceUndoPayload = {
  before?: ProjectInvoiceSnapshot | null
  after?: ProjectInvoiceSnapshot | null
}

async function loadProjectInvoiceSnapshot(em: EntityManager, id: string): Promise<ProjectInvoiceSnapshot | null> {
  const invoice = await em.findOne(FmsProjectInvoice, { id, deletedAt: null }, { populate: ['project'] })
  if (!invoice) return null

  const projectId = typeof invoice.project === 'string' ? invoice.project : invoice.project?.id

  return {
    id: invoice.id,
    projectId: projectId ?? '',
    organizationId: invoice.organizationId,
    tenantId: invoice.tenantId,
    documentId: invoice.documentId,
    invoiceNumber: invoice.invoiceNumber ?? null,
    sellerName: invoice.sellerName ?? null,
    sellerNip: invoice.sellerNip ?? null,
    sellerDetails: invoice.sellerDetails ?? null,
    buyerName: invoice.buyerName ?? null,
    buyerNip: invoice.buyerNip ?? null,
    buyerDetails: invoice.buyerDetails ?? null,
    netAmount: invoice.netAmount ?? null,
    vatAmount: invoice.vatAmount ?? null,
    grossAmount: invoice.grossAmount ?? null,
    currencyCode: invoice.currencyCode,
    invoiceDate: invoice.invoiceDate ?? null,
    paymentDueDate: invoice.paymentDueDate ?? null,
    serviceDate: invoice.serviceDate ?? null,
    paymentMethod: invoice.paymentMethod ?? null,
    lineItems: invoice.lineItems ?? null,
    confidence: invoice.confidence as InvoiceConfidenceLevel,
    extractionStrategies: invoice.extractionStrategies ?? null,
    rawExtractionData: invoice.rawExtractionData ?? null,
    status: invoice.status as InvoiceReviewStatus,
    reviewedBy: invoice.reviewedBy ?? null,
    reviewedAt: invoice.reviewedAt ?? null,
    reviewNotes: invoice.reviewNotes ?? null,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  }
}

const createProjectInvoiceCommand: CommandHandler<FmsProjectInvoiceCreateInput, { invoiceId: string }> = {
  id: 'fms_projects.project_invoices.create',
  async execute(input, ctx) {
    const parsed = fmsProjectInvoiceCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const project = await em.findOne(FmsProject, { id: parsed.projectId, deletedAt: null })
    if (!project) {
      throw new (await import('@open-mercato/shared/lib/crud/errors')).CrudHttpError(404, { error: 'Project not found' })
    }

    ensureTenantScope(ctx, project.tenantId)
    ensureOrganizationScope(ctx, project.organizationId)

    const now = new Date()
    const invoice = em.create(FmsProjectInvoice, {
      project,
      organizationId: project.organizationId,
      tenantId: project.tenantId,
      documentId: parsed.documentId,
      invoiceNumber: parsed.invoiceNumber ?? null,
      sellerName: parsed.sellerName ?? null,
      sellerNip: parsed.sellerNip ?? null,
      sellerDetails: parsed.sellerDetails ?? null,
      buyerName: parsed.buyerName ?? null,
      buyerNip: parsed.buyerNip ?? null,
      buyerDetails: parsed.buyerDetails ?? null,
      netAmount: parsed.netAmount?.toString() ?? null,
      vatAmount: parsed.vatAmount?.toString() ?? null,
      grossAmount: parsed.grossAmount?.toString() ?? null,
      currencyCode: parsed.currencyCode ?? 'PLN',
      invoiceDate: parsed.invoiceDate ?? null,
      paymentDueDate: parsed.paymentDueDate ?? null,
      serviceDate: parsed.serviceDate ?? null,
      paymentMethod: parsed.paymentMethod ?? null,
      lineItems: parsed.lineItems ?? null,
      confidence: parsed.confidence ?? 'REVIEW',
      extractionStrategies: parsed.extractionStrategies ?? null,
      rawExtractionData: parsed.rawExtractionData ?? null,
      status: parsed.status ?? 'pending_review',
      reviewedBy: parsed.reviewedBy ?? null,
      reviewedAt: parsed.reviewedAt ?? null,
      reviewNotes: parsed.reviewNotes ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persistAndFlush(invoice)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: invoice,
      identifiers: { id: invoice.id, organizationId: invoice.organizationId, tenantId: invoice.tenantId },
      indexer: projectInvoiceCrudIndexer,
    })

    return { invoiceId: invoice.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadProjectInvoiceSnapshot(em, result.invoiceId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectInvoiceSnapshot(em, result.invoiceId)
    return {
      actionLabel: translate('fms_projects.audit.project_invoices.create', 'Create project invoice'),
      resourceKind: 'fms_projects.project_invoice',
      resourceId: result.invoiceId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: { undo: { after: snapshot } satisfies ProjectInvoiceUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const invoiceId = logEntry?.resourceId
    if (!invoiceId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(FmsProjectInvoice, { id: invoiceId })
    if (!invoice) return
    em.remove(invoice)
    await em.flush()
  },
}

const updateProjectInvoiceCommand: CommandHandler<FmsProjectInvoiceUpdateInput, { invoiceId: string }> = {
  id: 'fms_projects.project_invoices.update',
  async prepare(input, ctx) {
    const parsed = fmsProjectInvoiceUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectInvoiceSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsProjectInvoiceUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(FmsProjectInvoice, { id: parsed.id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Project invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.invoiceNumber !== undefined) record.invoiceNumber = parsed.invoiceNumber
    if (parsed.sellerName !== undefined) record.sellerName = parsed.sellerName
    if (parsed.sellerNip !== undefined) record.sellerNip = parsed.sellerNip
    if (parsed.sellerDetails !== undefined) record.sellerDetails = parsed.sellerDetails
    if (parsed.buyerName !== undefined) record.buyerName = parsed.buyerName
    if (parsed.buyerNip !== undefined) record.buyerNip = parsed.buyerNip
    if (parsed.buyerDetails !== undefined) record.buyerDetails = parsed.buyerDetails
    if (parsed.netAmount !== undefined) record.netAmount = parsed.netAmount?.toString() ?? null
    if (parsed.vatAmount !== undefined) record.vatAmount = parsed.vatAmount?.toString() ?? null
    if (parsed.grossAmount !== undefined) record.grossAmount = parsed.grossAmount?.toString() ?? null
    if (parsed.currencyCode !== undefined) record.currencyCode = parsed.currencyCode
    if (parsed.invoiceDate !== undefined) record.invoiceDate = parsed.invoiceDate
    if (parsed.paymentDueDate !== undefined) record.paymentDueDate = parsed.paymentDueDate
    if (parsed.serviceDate !== undefined) record.serviceDate = parsed.serviceDate
    if (parsed.paymentMethod !== undefined) record.paymentMethod = parsed.paymentMethod
    if (parsed.lineItems !== undefined) record.lineItems = parsed.lineItems
    if (parsed.confidence !== undefined) record.confidence = parsed.confidence
    if (parsed.extractionStrategies !== undefined) record.extractionStrategies = parsed.extractionStrategies
    if (parsed.rawExtractionData !== undefined) record.rawExtractionData = parsed.rawExtractionData
    if (parsed.status !== undefined) record.status = parsed.status
    if (parsed.reviewedBy !== undefined) record.reviewedBy = parsed.reviewedBy
    if (parsed.reviewedAt !== undefined) record.reviewedAt = parsed.reviewedAt
    if (parsed.reviewNotes !== undefined) record.reviewNotes = parsed.reviewNotes

    record.updatedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: { id: record.id, organizationId: record.organizationId, tenantId: record.tenantId },
      indexer: projectInvoiceCrudIndexer,
    })

    return { invoiceId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as ProjectInvoiceSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadProjectInvoiceSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'invoiceNumber', 'sellerName', 'sellerNip', 'buyerName', 'buyerNip',
      'netAmount', 'vatAmount', 'grossAmount', 'currencyCode',
      'invoiceDate', 'paymentDueDate', 'serviceDate', 'paymentMethod',
      'confidence', 'status', 'reviewedBy', 'reviewedAt', 'reviewNotes',
    ]
    const changes = afterSnapshot
      ? buildChanges(before as unknown as Record<string, unknown>, afterSnapshot as unknown as Record<string, unknown>, changeKeys)
      : {}

    return {
      actionLabel: translate('fms_projects.audit.project_invoices.update', 'Update project invoice'),
      resourceKind: 'fms_projects.project_invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: { undo: { before, after: afterSnapshot ?? null } satisfies ProjectInvoiceUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectInvoiceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let invoice = await em.findOne(FmsProjectInvoice, { id: before.id })
    if (!invoice) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      const now = new Date()
      invoice = em.create(FmsProjectInvoice, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        documentId: before.documentId,
        invoiceNumber: before.invoiceNumber,
        sellerName: before.sellerName,
        sellerNip: before.sellerNip,
        sellerDetails: before.sellerDetails,
        buyerName: before.buyerName,
        buyerNip: before.buyerNip,
        buyerDetails: before.buyerDetails,
        netAmount: before.netAmount,
        vatAmount: before.vatAmount,
        grossAmount: before.grossAmount,
        currencyCode: before.currencyCode,
        invoiceDate: before.invoiceDate,
        paymentDueDate: before.paymentDueDate,
        serviceDate: before.serviceDate,
        paymentMethod: before.paymentMethod,
        lineItems: before.lineItems,
        confidence: before.confidence,
        extractionStrategies: before.extractionStrategies,
        rawExtractionData: before.rawExtractionData,
        status: before.status,
        reviewedBy: before.reviewedBy,
        reviewedAt: before.reviewedAt,
        reviewNotes: before.reviewNotes,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(invoice)
    } else {
      Object.assign(invoice, {
        invoiceNumber: before.invoiceNumber,
        sellerName: before.sellerName,
        sellerNip: before.sellerNip,
        sellerDetails: before.sellerDetails,
        buyerName: before.buyerName,
        buyerNip: before.buyerNip,
        buyerDetails: before.buyerDetails,
        netAmount: before.netAmount,
        vatAmount: before.vatAmount,
        grossAmount: before.grossAmount,
        currencyCode: before.currencyCode,
        invoiceDate: before.invoiceDate,
        paymentDueDate: before.paymentDueDate,
        serviceDate: before.serviceDate,
        paymentMethod: before.paymentMethod,
        lineItems: before.lineItems,
        confidence: before.confidence,
        extractionStrategies: before.extractionStrategies,
        rawExtractionData: before.rawExtractionData,
        status: before.status,
        reviewedBy: before.reviewedBy,
        reviewedAt: before.reviewedAt,
        reviewNotes: before.reviewNotes,
      })
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: invoice,
      identifiers: { id: invoice.id, organizationId: invoice.organizationId, tenantId: invoice.tenantId },
      indexer: projectInvoiceCrudIndexer,
    })
  },
}

const deleteProjectInvoiceCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { invoiceId: string }> = {
  id: 'fms_projects.project_invoices.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Project invoice id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectInvoiceSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Project invoice id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(FmsProjectInvoice, { id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Project invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    record.deletedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: record,
      identifiers: { id: record.id, organizationId: record.organizationId, tenantId: record.tenantId },
      indexer: projectInvoiceCrudIndexer,
    })

    return { invoiceId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as ProjectInvoiceSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_projects.audit.project_invoices.delete', 'Delete project invoice'),
      resourceKind: 'fms_projects.project_invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: { undo: { before } satisfies ProjectInvoiceUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectInvoiceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let invoice = await em.findOne(FmsProjectInvoice, { id: before.id })
    if (!invoice) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      invoice = em.create(FmsProjectInvoice, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        documentId: before.documentId,
        invoiceNumber: before.invoiceNumber,
        sellerName: before.sellerName,
        sellerNip: before.sellerNip,
        sellerDetails: before.sellerDetails,
        buyerName: before.buyerName,
        buyerNip: before.buyerNip,
        buyerDetails: before.buyerDetails,
        netAmount: before.netAmount,
        vatAmount: before.vatAmount,
        grossAmount: before.grossAmount,
        currencyCode: before.currencyCode,
        invoiceDate: before.invoiceDate,
        paymentDueDate: before.paymentDueDate,
        serviceDate: before.serviceDate,
        paymentMethod: before.paymentMethod,
        lineItems: before.lineItems,
        confidence: before.confidence,
        extractionStrategies: before.extractionStrategies,
        rawExtractionData: before.rawExtractionData,
        status: before.status,
        reviewedBy: before.reviewedBy,
        reviewedAt: before.reviewedAt,
        reviewNotes: before.reviewNotes,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(invoice)
    } else {
      invoice.deletedAt = null
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: invoice,
      identifiers: { id: invoice.id, organizationId: invoice.organizationId, tenantId: invoice.tenantId },
      indexer: projectInvoiceCrudIndexer,
    })
  },
}

// Special review command
const reviewProjectInvoiceCommand: CommandHandler<FmsProjectInvoiceReviewInput, { invoiceId: string; status: 'approved' | 'rejected' }> = {
  id: 'fms_projects.project_invoices.review',
  async prepare(input, ctx) {
    const parsed = fmsProjectInvoiceReviewSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectInvoiceSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsProjectInvoiceReviewSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(FmsProjectInvoice, { id: parsed.id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Project invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    const rawUserId = ctx.auth?.userId ?? ctx.auth?.id ?? null
    const userId = typeof rawUserId === 'string' ? rawUserId : null

    record.status = parsed.status
    record.reviewedBy = userId
    record.reviewedAt = new Date()
    record.reviewNotes = parsed.reviewNotes ?? null
    record.updatedAt = new Date()

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: { id: record.id, organizationId: record.organizationId, tenantId: record.tenantId },
      indexer: projectInvoiceCrudIndexer,
    })

    return { invoiceId: record.id, status: parsed.status }
  },
  buildLog: async ({ result, snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as ProjectInvoiceSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadProjectInvoiceSnapshot(em, before.id)
    const actionLabel = result.status === 'approved'
      ? translate('fms_projects.audit.project_invoices.approve', 'Approve invoice')
      : translate('fms_projects.audit.project_invoices.reject', 'Reject invoice')

    return {
      actionLabel,
      resourceKind: 'fms_projects.project_invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes: {
        status: { from: before.status, to: result.status },
      },
      payload: { undo: { before, after: afterSnapshot ?? null } satisfies ProjectInvoiceUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectInvoiceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(FmsProjectInvoice, { id: before.id })
    if (!invoice) return

    invoice.status = before.status
    invoice.reviewedBy = before.reviewedBy
    invoice.reviewedAt = before.reviewedAt
    invoice.reviewNotes = before.reviewNotes

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: invoice,
      identifiers: { id: invoice.id, organizationId: invoice.organizationId, tenantId: invoice.tenantId },
      indexer: projectInvoiceCrudIndexer,
    })
  },
}

registerCommand(createProjectInvoiceCommand)
registerCommand(updateProjectInvoiceCommand)
registerCommand(deleteProjectInvoiceCommand)
registerCommand(reviewProjectInvoiceCommand)
