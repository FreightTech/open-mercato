import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

vi.mock('@open-mercato/shared/lib/commands', () => ({
  registerCommand: vi.fn(),
}))
vi.mock('@open-mercato/shared/lib/commands/helpers', () => ({
  emitCrudSideEffects: vi.fn().mockResolvedValue(undefined),
  emitCrudUndoSideEffects: vi.fn().mockResolvedValue(undefined),
  buildChanges: vi.fn().mockReturnValue({}),
  requireId: vi.fn((input: any) => input.id),
}))
vi.mock('../../events', () => ({
  emitFmsInvoicingEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@open-mercato/shared/modules/events', () => ({
  getGlobalEventBus: vi.fn().mockReturnValue(null),
}))

import { registerCommand } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'

const ORG_ID = 'a0000000-0000-4000-8000-000000000001'
const TENANT_ID = 'b0000000-0000-4000-8000-000000000002'
const USER_ID = 'c0000000-0000-4000-8000-000000000003'
const INVOICE_ID = 'd0000000-0000-4000-8000-000000000010'

function createMockEm() {
  const em = {
    create: vi.fn().mockImplementation((_Entity: unknown, data: Record<string, unknown>) => ({
      id: INVOICE_ID,
      ...data,
    })),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    nativeDelete: vi.fn().mockResolvedValue(0),
    fork: vi.fn(),
  }
  em.fork.mockReturnValue(em)
  return em
}

function createMockCtx(em: ReturnType<typeof createMockEm>) {
  return {
    container: {
      resolve: vi.fn((token: string) => {
        if (token === 'em') return em
        if (token === 'dataEngine') return { emitOrmEntityEvent: vi.fn() }
        return undefined
      }),
    },
    auth: {
      sub: USER_ID,
      tenantId: TENANT_ID,
      orgId: ORG_ID,
    },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    request: null,
  }
}

describe('invoice commands', () => {
  let commands: Map<string, { execute: (...args: any[]) => Promise<any> }>

  beforeAll(async () => {
    commands = new Map()
    vi.mocked(registerCommand).mockImplementation((cmd: any) => {
      commands.set(cmd.id, cmd)
    })

    // Import to trigger registration
    await import('../invoices')
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 5 invoice commands', () => {
    expect(commands.has('fms_invoicing.invoices.create')).toBe(true)
    expect(commands.has('fms_invoicing.invoices.update')).toBe(true)
    expect(commands.has('fms_invoicing.invoices.delete')).toBe(true)
    expect(commands.has('fms_invoicing.invoices.approve')).toBe(true)
    expect(commands.has('fms_invoicing.invoices.reject')).toBe(true)
  })

  describe('create', () => {
    it('creates an invoice with line items', async () => {
      const em = createMockEm()
      const ctx = createMockCtx(em)
      const cmd = commands.get('fms_invoicing.invoices.create')!

      const result = await cmd.execute(
        {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          invoiceNumber: 'FV/2026/03/001',
          sellerName: 'Seller',
          buyerName: 'Buyer',
          lineItems: [
            {
              lineNumber: 1,
              description: 'Service A',
              quantity: '2',
              unitPriceNet: '100.00',
              vatRate: '23',
              netAmount: '200.00',
              vatAmount: '46.00',
              grossAmount: '246.00',
            },
          ],
        },
        ctx
      )

      expect(result).toHaveProperty('id')
      expect(em.create).toHaveBeenCalled()
      expect(em.persist).toHaveBeenCalled()
      const createCalls = em.create.mock.calls
      expect(createCalls.length).toBeGreaterThanOrEqual(2)
      expect(em.flush).toHaveBeenCalled()
      expect(emitCrudSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'created' })
      )
    })

    it('creates an invoice without line items', async () => {
      const em = createMockEm()
      const ctx = createMockCtx(em)
      const cmd = commands.get('fms_invoicing.invoices.create')!

      const result = await cmd.execute(
        {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          invoiceNumber: 'DRAFT',
        },
        ctx
      )

      expect(result).toHaveProperty('id')
      expect(em.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('update with line items', () => {
    it('replaces line items and recalculates totals', async () => {
      const em = createMockEm()
      const ctx = createMockCtx(em)

      const existingInvoice = {
        id: INVOICE_ID,
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
        invoiceNumber: 'FV/001',
        status: 'draft',
        netAmount: '0',
        vatAmount: '0',
        grossAmount: '0',
        deletedAt: null,
      }
      em.findOne.mockResolvedValue(existingInvoice)

      const cmd = commands.get('fms_invoicing.invoices.update')!

      await cmd.execute(
        {
          id: INVOICE_ID,
          lineItems: [
            {
              lineNumber: 1,
              description: 'Item A',
              quantity: '1',
              unitPriceNet: '100.00',
              vatRate: '23',
              netAmount: '100.00',
              vatAmount: '23.00',
              grossAmount: '123.00',
            },
            {
              lineNumber: 2,
              description: 'Item B',
              quantity: '2',
              unitPriceNet: '50.00',
              vatRate: '8',
              netAmount: '100.00',
              vatAmount: '8.00',
              grossAmount: '108.00',
            },
          ],
        },
        ctx
      )

      expect(em.nativeDelete).toHaveBeenCalled()
      expect(em.create).toHaveBeenCalledTimes(2)
      expect(existingInvoice.netAmount).toBe('200.00')
      expect(existingInvoice.vatAmount).toBe('31.00')
      expect(existingInvoice.grossAmount).toBe('231.00')
    })

    it('updates fields without touching line items when not provided', async () => {
      const em = createMockEm()
      const ctx = createMockCtx(em)

      const existingInvoice = {
        id: INVOICE_ID,
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
        invoiceNumber: 'FV/001',
        sellerName: 'Old Seller',
        netAmount: '100.00',
        vatAmount: '23.00',
        grossAmount: '123.00',
        deletedAt: null,
      }
      em.findOne.mockResolvedValue(existingInvoice)

      const cmd = commands.get('fms_invoicing.invoices.update')!

      await cmd.execute(
        {
          id: INVOICE_ID,
          sellerName: 'New Seller',
        },
        ctx
      )

      expect(existingInvoice.sellerName).toBe('New Seller')
      expect(em.nativeDelete).not.toHaveBeenCalled()
      expect(existingInvoice.netAmount).toBe('100.00')
    })
  })

  describe('delete', () => {
    it('soft-deletes an invoice', async () => {
      const em = createMockEm()
      const ctx = createMockCtx(em)

      const existingInvoice = {
        id: INVOICE_ID,
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
        deletedAt: null,
      }
      em.findOne.mockResolvedValue(existingInvoice)

      const cmd = commands.get('fms_invoicing.invoices.delete')!

      await cmd.execute({ id: INVOICE_ID }, ctx)

      expect(existingInvoice.deletedAt).toBeInstanceOf(Date)
      expect(emitCrudSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deleted' })
      )
    })
  })
})
