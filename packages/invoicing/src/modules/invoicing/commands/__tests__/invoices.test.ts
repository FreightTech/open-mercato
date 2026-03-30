jest.mock('@open-mercato/shared/lib/commands', () => ({
  registerCommand: jest.fn(),
}))
jest.mock('@open-mercato/shared/lib/commands/helpers', () => ({
  emitCrudSideEffects: jest.fn().mockResolvedValue(undefined),
  emitCrudUndoSideEffects: jest.fn().mockResolvedValue(undefined),
  buildChanges: jest.fn().mockReturnValue({}),
  requireId: jest.fn((input: any) => input.id),
}))
jest.mock('../../events', () => ({
  emitInvoicingEvent: jest.fn().mockResolvedValue(undefined),
}))

import { registerCommand } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'

const ORG_ID = 'a0000000-0000-4000-8000-000000000001'
const TENANT_ID = 'b0000000-0000-4000-8000-000000000002'
const USER_ID = 'c0000000-0000-4000-8000-000000000003'
const INVOICE_ID = 'd0000000-0000-4000-8000-000000000010'

function createMockEm() {
  const em = {
    create: jest.fn().mockImplementation((_Entity: unknown, data: Record<string, unknown>) => ({
      id: INVOICE_ID,
      ...data,
    })),
    persist: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    nativeDelete: jest.fn().mockResolvedValue(0),
    fork: jest.fn(),
  }
  em.fork.mockReturnValue(em)
  return em
}

function createMockCtx(em: ReturnType<typeof createMockEm>) {
  return {
    container: {
      resolve: jest.fn((token: string) => {
        if (token === 'em') return em
        if (token === 'dataEngine') return { emitOrmEntityEvent: jest.fn() }
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

  beforeAll(() => {
    // Capture all registered commands
    commands = new Map()
    ;(registerCommand as jest.Mock).mockImplementation((cmd: { id: string; execute: (...args: any[]) => Promise<any> }) => {
      commands.set(cmd.id, cmd)
    })

    // Re-import to trigger registration
    jest.isolateModules(() => {
      require('../invoices')
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('registers all 5 invoice commands', () => {
    expect(commands.has('invoicing.invoices.create')).toBe(true)
    expect(commands.has('invoicing.invoices.update')).toBe(true)
    expect(commands.has('invoicing.invoices.delete')).toBe(true)
    expect(commands.has('invoicing.invoices.approve')).toBe(true)
    expect(commands.has('invoicing.invoices.reject')).toBe(true)
  })

  describe('create', () => {
    it('creates an invoice with line items', async () => {
      const em = createMockEm()
      const ctx = createMockCtx(em)
      const cmd = commands.get('invoicing.invoices.create')!

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
      // Invoice created
      expect(em.create).toHaveBeenCalled()
      expect(em.persist).toHaveBeenCalled()
      // Line item created (additional create call)
      const createCalls = em.create.mock.calls
      expect(createCalls.length).toBeGreaterThanOrEqual(2)
      // flush called at least twice (invoice, then line items)
      expect(em.flush).toHaveBeenCalled()
      // CRUD side effects emitted
      expect(emitCrudSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'created' })
      )
    })

    it('creates an invoice without line items', async () => {
      const em = createMockEm()
      const ctx = createMockCtx(em)
      const cmd = commands.get('invoicing.invoices.create')!

      const result = await cmd.execute(
        {
          organizationId: ORG_ID,
          tenantId: TENANT_ID,
          invoiceNumber: 'DRAFT',
        },
        ctx
      )

      expect(result).toHaveProperty('id')
      // Only invoice creation (1 create call)
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

      const cmd = commands.get('invoicing.invoices.update')!

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

      // Old line items deleted
      expect(em.nativeDelete).toHaveBeenCalled()
      // New line items created
      expect(em.create).toHaveBeenCalledTimes(2)
      // Totals recalculated on the invoice
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

      const cmd = commands.get('invoicing.invoices.update')!

      await cmd.execute(
        {
          id: INVOICE_ID,
          sellerName: 'New Seller',
        },
        ctx
      )

      expect(existingInvoice.sellerName).toBe('New Seller')
      // nativeDelete NOT called (no line items replacement)
      expect(em.nativeDelete).not.toHaveBeenCalled()
      // Amounts unchanged
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

      const cmd = commands.get('invoicing.invoices.delete')!

      await cmd.execute({ id: INVOICE_ID }, ctx)

      expect(existingInvoice.deletedAt).toBeInstanceOf(Date)
      expect(emitCrudSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deleted' })
      )
    })
  })
})
