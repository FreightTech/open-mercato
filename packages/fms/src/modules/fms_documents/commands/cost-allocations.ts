import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsInvoice, FmsInvoiceLineItem, FmsInvoiceCostAllocation } from '../data/entities'
import { FmsProjectLine } from '../../fms_projects/data/entities'
import { saveAllocationsSchema, removeAllocationSchema } from '../data/invoice-validators'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  assertRecordFound,
  getUserIdFromAuth,
} from './invoice-shared'
import type { z } from 'zod'

// ========================================
// Save Cost Allocations Command
// ========================================

type SaveAllocationsInput = z.infer<typeof saveAllocationsSchema> & { invoiceId: string }

const saveCostAllocationsCommand: CommandHandler<SaveAllocationsInput, { saved: number }> = {
  id: 'fms_documents.cost_allocations.save',
  async execute(rawInput, ctx) {
    const input = { invoiceId: rawInput.invoiceId, ...saveAllocationsSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(FmsInvoice, { id: input.invoiceId, deletedAt: null })
    const record = assertRecordFound(invoice, 'Invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    const userId = getUserIdFromAuth(ctx)
    const now = new Date()
    const affectedProjectLineIds = new Set<string>()

    for (const entry of input.allocations) {
      // Verify line item belongs to this invoice
      const lineItem = await em.findOne(FmsInvoiceLineItem, {
        id: entry.lineItemId,
        invoice: record,
      })
      assertRecordFound(lineItem, `Line item ${entry.lineItemId} not found on this invoice`)

      // Check if allocation already exists for this line item
      let allocation = await em.findOne(FmsInvoiceCostAllocation, {
        invoice: record,
        invoiceLineItem: lineItem!,
      })

      if (allocation) {
        // Update existing allocation
        allocation.projectId = entry.projectId
        allocation.projectLineId = entry.projectLineId
        allocation.amount = entry.amount
        allocation.currencyCode = entry.currencyCode
        allocation.status = 'saved'
        allocation.allocatedBy = userId
        allocation.allocatedAt = now
      } else {
        // Create new allocation
        allocation = em.create(FmsInvoiceCostAllocation, {
          organizationId: record.organizationId,
          tenantId: record.tenantId,
          invoice: record,
          invoiceLineItem: lineItem!,
          projectId: entry.projectId,
          projectLineId: entry.projectLineId,
          amount: entry.amount,
          currencyCode: entry.currencyCode,
          status: 'saved',
          allocatedBy: userId,
          allocatedAt: now,
        })
        em.persist(allocation)
      }

      affectedProjectLineIds.add(entry.projectLineId)
    }

    await em.flush()

    // Update invoicedCost on each affected project line
    for (const projectLineId of affectedProjectLineIds) {
      await recalculateProjectLineInvoicedCost(em, projectLineId)
    }

    return { saved: input.allocations.length }
  },
}

// ========================================
// Remove Cost Allocation Command
// ========================================

type RemoveAllocationInput = z.infer<typeof removeAllocationSchema> & { invoiceId: string }

const removeCostAllocationCommand: CommandHandler<RemoveAllocationInput, { id: string }> = {
  id: 'fms_documents.cost_allocations.remove',
  async execute(rawInput, ctx) {
    const input = removeAllocationSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const allocation = await em.findOne(FmsInvoiceCostAllocation, {
      id: input.allocationId,
    })
    const record = assertRecordFound(allocation, 'Allocation not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    const projectLineId = record.projectLineId

    em.remove(record)
    await em.flush()

    // Recalculate affected project line
    await recalculateProjectLineInvoicedCost(em, projectLineId)

    return { id: input.allocationId }
  },
}

/**
 * Recalculate the invoicedCost on a project line
 * by summing all saved allocations targeting it.
 */
async function recalculateProjectLineInvoicedCost(
  em: EntityManager,
  projectLineId: string
): Promise<void> {
  const allocations = await em.find(FmsInvoiceCostAllocation, {
    projectLineId,
    status: 'saved',
  })

  const total = allocations.reduce(
    (sum, a) => sum + parseFloat(a.amount || '0'),
    0
  )

  const projectLine = await em.findOne(FmsProjectLine, { id: projectLineId })
  if (projectLine) {
    projectLine.invoicedCost = total > 0 ? total.toFixed(4) : null
    await em.flush()
  }
}

registerCommand(saveCostAllocationsCommand)
registerCommand(removeCostAllocationCommand)

export {
  saveCostAllocationsCommand,
  removeCostAllocationCommand,
}
