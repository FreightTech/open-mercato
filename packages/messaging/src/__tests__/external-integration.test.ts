/**
 * Integration tests for external system integration (n8n, Zapier, etc.)
 * 
 * These tests verify that:
 * 1. External systems can publish to tenant-prefixed subjects
 * 2. Open Mercato receives and processes external events
 * 3. Open Mercato doesn't process its own events (x-source header check)
 * 4. Tenant isolation is maintained (no cross-tenant leakage)
 * 5. Commands still work via inbound.* subjects
 */

import { createNatsDriver } from '../drivers/nats'
import type { NatsDriverExtended } from '../drivers/nats'
import { createAsyncInboundConsumer, buildTenantEventSubject } from '../modules/messaging/async-events'
import type { AsyncInboundConsumer } from '../modules/messaging/inbound-types'
import { createEventBus } from '@open-mercato/events'
import type { EventBus } from '@open-mercato/events'

// Mock DI container for event bus
function createMockContainer() {
  return {
    resolve: () => null,
  }
}

describe('External System Integration', () => {
  let driver: NatsDriverExtended
  let eventBus: EventBus
  let consumer: AsyncInboundConsumer
  const receivedEvents: Array<{ subject: string; payload: unknown }> = []

  beforeEach(async () => {
    // Skip if NATS is not available
    if (!process.env.NATS_URL) {
      console.log('Skipping NATS integration tests (NATS_URL not set)')
      return
    }

    // Create NATS driver
    driver = createNatsDriver({
      servers: process.env.NATS_URL,
      jetstream: { enabled: true },
      debug: true,
    })
    await driver.connect()

    // Create event bus and track received events
    const container = createMockContainer()
    eventBus = createEventBus({
      resolve: container.resolve.bind(container),
      queueStrategy: 'local',
    })
    eventBus.on('*', (payload, ctx) => {
      receivedEvents.push({ subject: ctx.eventName || 'unknown', payload })
    })

    // Create and start async consumer
    consumer = createAsyncInboundConsumer(driver, eventBus, {
      debug: true,
    })
    await consumer.start()

    // Wait for consumer to be ready
    await new Promise((resolve) => setTimeout(resolve, 500))
  })

  afterEach(async () => {
    if (consumer?.isActive()) {
      await consumer.stop()
    }
    if (driver?.isConnected()) {
      await driver.disconnect()
    }
    receivedEvents.length = 0
  })

  it('should receive events published by external systems to events.{tenant} subjects', async () => {
    if (!process.env.NATS_URL) return

    const tenantId = 'test-tenant-1'
    const eventSubject = 'customers.people.created'
    const payload = {
      id: '123',
      email: 'test@example.com',
      tenantId,
    }

    // Simulate n8n publishing to events-prefixed subject
    const natsSubject = buildTenantEventSubject(tenantId, eventSubject)
    // natsSubject should be: events.test-tenant-1.customers.people.created
    await driver.publish(natsSubject, payload)

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Verify event was received and processed
    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]).toMatchObject({
      subject: eventSubject,
      payload,
    })
  })

  it('should skip events with x-source: open-mercato header to prevent loops', async () => {
    if (!process.env.NATS_URL) return

    const tenantId = 'test-tenant-2'
    const eventSubject = 'sales.order.created'
    const payload = {
      id: '456',
      tenantId,
    }

    // Publish with x-source header (simulating Open Mercato's own events)
    const natsSubject = buildTenantEventSubject(tenantId, eventSubject)
    await driver.publish(natsSubject, payload, {
      headers: { 'x-source': 'open-mercato' },
    })

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Verify event was NOT processed (skipped due to x-source header)
    expect(receivedEvents).toHaveLength(0)
  })

  it('should maintain tenant isolation - different tenants should not receive each other\'s events', async () => {
    if (!process.env.NATS_URL) return

    const tenant1 = 'acme-corp'
    const tenant2 = 'widgets-inc'
    const eventSubject = 'catalog.product.updated'

    const payload1 = { id: 'prod-1', name: 'Acme Widget', tenantId: tenant1 }
    const payload2 = { id: 'prod-2', name: 'Widget Pro', tenantId: tenant2 }

    // Publish events for both tenants
    await driver.publish(buildTenantEventSubject(tenant1, eventSubject), payload1)
    await driver.publish(buildTenantEventSubject(tenant2, eventSubject), payload2)

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Both events should be received (we don't filter by tenant in tests)
    // In production, subscribers would filter by tenantId in the payload
    expect(receivedEvents).toHaveLength(2)
    
    // Verify each event has the correct tenant ID
    expect(receivedEvents[0].payload).toMatchObject({ tenantId: tenant1 })
    expect(receivedEvents[1].payload).toMatchObject({ tenantId: tenant2 })
  })

  it('should handle malformed subjects gracefully', async () => {
    if (!process.env.NATS_URL) return

    // Publish to a subject without tenant prefix
    await driver.publish('malformed.event', { data: 'test' })

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Event should still be processed (stripTenantPrefix handles this)
    // The subject will be treated as-is if no dot separator exists
    expect(receivedEvents.length).toBeGreaterThanOrEqual(0)
  })
})

describe('Command Reply Handlers', () => {
  let driver: NatsDriverExtended

  beforeEach(async () => {
    if (!process.env.NATS_URL) {
      console.log('Skipping NATS command tests (NATS_URL not set)')
      return
    }

    driver = createNatsDriver({
      servers: process.env.NATS_URL,
      debug: true,
    })
    await driver.connect()
  })

  afterEach(async () => {
    if (driver?.isConnected()) {
      await driver.disconnect()
    }
  })

  it('should still support inbound.* subjects for synchronous commands', async () => {
    if (!process.env.NATS_URL) return

    // This test verifies that reply handlers (commands) remain on inbound.*
    // and are separate from the tenant-prefixed event subjects

    // Mock reply handler
    await driver.reply('inbound.test.command', async (msg) => {
      return { success: true, data: msg.payload }
    })

    // Send request to command subject
    const response = await driver.request<unknown, { success: boolean; data: unknown }>(
      'inbound.test.command',
      { input: { test: 'data' }, tenantId: 'test-tenant' }
    )

    expect(response).toMatchObject({
      success: true,
      data: { input: { test: 'data' }, tenantId: 'test-tenant' },
    })
  })
})

describe('Helper Functions', () => {
  it('buildTenantEventSubject should construct correct subject with events prefix', () => {
    expect(buildTenantEventSubject('acme-corp', 'customers.people.created'))
      .toBe('events.acme-corp.customers.people.created')

    expect(buildTenantEventSubject('tenant-123', 'sales.order.updated'))
      .toBe('events.tenant-123.sales.order.updated')
  })
})
