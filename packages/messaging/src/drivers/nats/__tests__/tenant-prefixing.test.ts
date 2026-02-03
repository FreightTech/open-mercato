import { createNatsDriver } from '../index'
import type { Message } from '../../../types'

// Mock nats.connect to avoid real NATS connection in tests
jest.mock('nats', () => ({
  connect: jest.fn(),
  headers: jest.fn(() => ({
    append: jest.fn(),
    set: jest.fn(),
  })),
  StringCodec: jest.fn(() => ({
    encode: (s: string) => new TextEncoder().encode(s),
    decode: (b: Uint8Array) => new TextDecoder().decode(b),
  })),
}))

describe('NATS Driver - Tenant Prefixing', () => {
  let mockNatsClient: any
  let publishedMessages: Array<{ subject: string; payload: unknown; headers?: any }>

  beforeEach(() => {
    publishedMessages = []

    // Create mock NATS client
    mockNatsClient = {
      publish: jest.fn((subject: string, data: Uint8Array, options?: any) => {
        const payload = JSON.parse(new TextDecoder().decode(data))
        publishedMessages.push({ subject, payload, headers: options?.headers })
      }),
      subscribe: jest.fn(() => ({
        unsubscribe: jest.fn(),
        drain: jest.fn(),
      })),
      request: jest.fn(),
      close: jest.fn(),
      isClosed: jest.fn(() => false),
      status: jest.fn(() => ({
        type: 'connect',
      })),
      [Symbol.asyncIterator]: function* () {
        // Empty iterator
      },
    }

    // Mock nats.connect to return our mock client
    const nats = require('nats')
    nats.connect.mockResolvedValue(mockNatsClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('extractTenantId', () => {
    it('should extract tenantId from payload', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('test.event', { tenantId: 'tenant-a', data: 'value' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('tenant-a.test.event')
    })

    it('should extract tenant_id (snake_case) from payload', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('test.event', { tenant_id: 'tenant-b', data: 'value' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('tenant-b.test.event')
    })

    it('should prefer tenantId over tenant_id when both present', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('test.event', {
        tenantId: 'tenant-camelCase',
        tenant_id: 'tenant-snake_case',
        data: 'value',
      })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('tenant-camelCase.test.event')
    })

    it('should return null for non-object payload', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('test.event', 'string-payload')

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('test.event')
    })

    it('should return null for null payload', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('test.event', null)

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('test.event')
    })

    it('should return null when tenantId is empty string', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('test.event', { tenantId: '', data: 'value' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('test.event')
    })

    it('should return null when tenantId is not a string', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('test.event', { tenantId: 123, data: 'value' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('test.event')
    })

    it('should return null when payload has no tenant fields', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('test.event', { data: 'value', userId: 'user-123' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('test.event')
    })
  })

  describe('buildTenantPrefixedSubject', () => {
    it('should prefix subject when tenant ID exists', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('customers.people.created', {
        tenantId: 'acme-corp',
        id: 'person-123',
      })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('acme-corp.customers.people.created')
    })

    it('should not prefix subject when no tenant ID', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('system.startup', { timestamp: Date.now() })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('system.startup')
    })

    it('should handle complex subject paths', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('sales.orders.items.added', {
        tenantId: 'shop-xyz',
        orderId: 'order-123',
        itemId: 'item-456',
      })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('shop-xyz.sales.orders.items.added')
    })

    it('should handle single-segment subjects', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      await driver.publish('ping', { tenantId: 'tenant-1' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('tenant-1.ping')
    })
  })

  describe('multi-tenant isolation', () => {
    it('should isolate events for different tenants', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      // Publish events for different tenants
      await driver.publish('customers.people.created', {
        tenantId: 'tenant-a',
        id: 'person-1',
      })

      await driver.publish('customers.people.created', {
        tenantId: 'tenant-b',
        id: 'person-2',
      })

      await driver.publish('customers.people.created', {
        tenantId: 'tenant-c',
        id: 'person-3',
      })

      expect(publishedMessages).toHaveLength(3)
      expect(publishedMessages[0]!.subject).toBe('tenant-a.customers.people.created')
      expect(publishedMessages[1]!.subject).toBe('tenant-b.customers.people.created')
      expect(publishedMessages[2]!.subject).toBe('tenant-c.customers.people.created')

      // Verify payloads are correct
      expect((publishedMessages[0]!.payload as any).id).toBe('person-1')
      expect((publishedMessages[1]!.payload as any).id).toBe('person-2')
      expect((publishedMessages[2]!.payload as any).id).toBe('person-3')
    })

    it('should handle mixed tenant and non-tenant events', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      // System event (no tenant)
      await driver.publish('system.startup', { timestamp: Date.now() })

      // Tenant event
      await driver.publish('customers.people.created', {
        tenantId: 'tenant-a',
        id: 'person-1',
      })

      // Another system event
      await driver.publish('system.health.check', { status: 'ok' })

      // Another tenant event
      await driver.publish('sales.orders.created', {
        tenantId: 'tenant-b',
        orderId: 'order-1',
      })

      expect(publishedMessages).toHaveLength(4)
      expect(publishedMessages[0]!.subject).toBe('system.startup')
      expect(publishedMessages[1]!.subject).toBe('tenant-a.customers.people.created')
      expect(publishedMessages[2]!.subject).toBe('system.health.check')
      expect(publishedMessages[3]!.subject).toBe('tenant-b.sales.orders.created')
    })
  })

  describe('real-world scenarios', () => {
    it('should handle typical customer creation event', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      const event = {
        tenantId: 'acme-corp',
        organizationId: 'org-123',
        id: 'person-uuid-456',
        email: 'john@example.com',
        name: 'John Doe',
        createdAt: new Date().toISOString(),
      }

      await driver.publish('customers.people.created', event)

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('acme-corp.customers.people.created')
      expect(publishedMessages[0]!.payload).toEqual(event)
    })

    it('should handle order creation with line items', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      const event = {
        tenantId: 'shop-xyz',
        organizationId: 'org-456',
        orderId: 'order-789',
        customerId: 'customer-111',
        total: 150.5,
        currency: 'USD',
        lines: [
          { sku: 'PROD-001', quantity: 2, price: 50.25 },
          { sku: 'PROD-002', quantity: 1, price: 50.0 },
        ],
      }

      await driver.publish('sales.orders.created', event)

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('shop-xyz.sales.orders.created')
      expect((publishedMessages[0]!.payload as any).lines).toHaveLength(2)
    })

    it('should handle audit log events', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      const event = {
        tenant_id: 'tenant-audit-123', // Using snake_case
        userId: 'user-456',
        action: 'user.login',
        ipAddress: '192.168.1.1',
        timestamp: Date.now(),
        metadata: {
          userAgent: 'Mozilla/5.0...',
          sessionId: 'session-789',
        },
      }

      await driver.publish('audit_logs.action', event)

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('tenant-audit-123.audit_logs.action')
    })

    it('should handle events with nested objects', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      const event = {
        tenantId: 'complex-tenant',
        data: {
          nested: {
            deeply: {
              value: 'test',
            },
          },
          array: [1, 2, 3],
        },
        metadata: {
          source: 'api',
          version: '1.0.0',
        },
      }

      await driver.publish('test.complex.event', event)

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('complex-tenant.test.complex.event')
      expect((publishedMessages[0]!.payload as any).data.nested.deeply.value).toBe('test')
    })
  })

  describe('edge cases', () => {
    it('should handle UUID tenant IDs', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      const tenantId = '550e8400-e29b-41d4-a716-446655440000'

      await driver.publish('test.event', { tenantId, data: 'value' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe(
        '550e8400-e29b-41d4-a716-446655440000.test.event'
      )
    })

    it('should handle tenant IDs with special characters', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      // NATS subjects support alphanumeric + hyphens + underscores
      const tenantId = 'tenant-abc_123'

      await driver.publish('test.event', { tenantId, data: 'value' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('tenant-abc_123.test.event')
    })

    it('should handle very long tenant IDs', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      const tenantId = 'a'.repeat(100) // 100 character tenant ID

      await driver.publish('test.event', { tenantId, data: 'value' })

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe(`${'a'.repeat(100)}.test.event`)
    })

    it('should handle payload with many fields including tenantId', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      const payload = {
        tenantId: 'tenant-1',
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
        field4: { nested: true },
        field5: [1, 2, 3],
        field6: null,
        field7: undefined,
        field8: true,
        field9: 42,
        field10: 3.14159,
      }

      await driver.publish('test.event', payload)

      expect(publishedMessages).toHaveLength(1)
      expect(publishedMessages[0]!.subject).toBe('tenant-1.test.event')
    })
  })

  describe('backward compatibility', () => {
    it('should not break existing non-tenant events', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      // Old-style events without tenant ID
      await driver.publish('legacy.event', { data: 'value' })
      await driver.publish('system.event', { status: 'ok' })
      await driver.publish('global.notification', { message: 'Hello' })

      expect(publishedMessages).toHaveLength(3)
      expect(publishedMessages[0]!.subject).toBe('legacy.event')
      expect(publishedMessages[1]!.subject).toBe('system.event')
      expect(publishedMessages[2]!.subject).toBe('global.notification')
    })

    it('should handle events migrating from non-tenant to tenant', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      // Same event type, but one with tenant, one without
      await driver.publish('users.login', { userId: 'user-1' })
      await driver.publish('users.login', { tenantId: 'tenant-a', userId: 'user-2' })

      expect(publishedMessages).toHaveLength(2)
      expect(publishedMessages[0]!.subject).toBe('users.login')
      expect(publishedMessages[1]!.subject).toBe('tenant-a.users.login')
    })
  })

  describe('performance', () => {
    it('should handle rapid-fire events efficiently', async () => {
      const driver = createNatsDriver({ servers: 'nats://localhost:4222' })
      await driver.connect()

      const startTime = Date.now()

      // Publish 1000 events rapidly
      const promises: Promise<any>[] = []
      for (let i = 0; i < 1000; i++) {
        promises.push(
          driver.publish('test.performance', {
            tenantId: `tenant-${i % 10}`, // 10 different tenants
            iteration: i,
          })
        )
      }

      await Promise.all(promises)

      const duration = Date.now() - startTime

      expect(publishedMessages).toHaveLength(1000)
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second

      // Verify subjects are correctly prefixed
      expect(publishedMessages[0]!.subject).toBe('tenant-0.test.performance')
      expect(publishedMessages[15]!.subject).toBe('tenant-5.test.performance')
      expect(publishedMessages[999]!.subject).toBe('tenant-9.test.performance')
    })
  })
})
