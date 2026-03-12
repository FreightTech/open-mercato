import { createEventBusBridge } from '../bridge'
import { createMessagingService } from '../service'
import { createMemoryDriver } from '../drivers/memory'
import { createEventBus } from '@open-mercato/events'

describe('EventBusBridge', () => {
  let eventBus: ReturnType<typeof createEventBus>
  let messagingService: ReturnType<typeof createMessagingService>

  beforeEach(async () => {
    // Create a mock resolve function
    const resolve = <T>(name: string): T => {
      throw new Error(`Mock resolver: ${name} not available`)
    }

    eventBus = createEventBus({ resolve })

    const driver = createMemoryDriver()
    messagingService = createMessagingService({
      drivers: [driver],
    })

    await messagingService.connectAll()
  })

  afterEach(async () => {
    await messagingService.disconnectAll()
  })

  describe('bridgeInbound', () => {
    it('should bridge external messages to internal events', async () => {
      const bridge = createEventBusBridge(eventBus, messagingService)

      const receivedEvents: unknown[] = []
      eventBus.on('internal.order.created', async (payload) => {
        receivedEvents.push(payload)
      })

      await bridge.bridgeInbound('external.orders.created', 'internal.order.created')

      // Publish to external subject
      await messagingService.publish('external.orders.created', { orderId: '123' })

      // Wait for async processing
      await new Promise((r) => setImmediate(r))

      expect(receivedEvents).toHaveLength(1)
      expect(receivedEvents[0]).toEqual({ orderId: '123' })

      await bridge.cleanup()
    })

    it('should transform payloads during inbound bridging', async () => {
      const bridge = createEventBusBridge(eventBus, messagingService)

      const receivedEvents: unknown[] = []
      eventBus.on('internal.order', async (payload) => {
        receivedEvents.push(payload)
      })

      await bridge.bridgeInbound('external.order', 'internal.order', {
        transform: (payload) => ({
          ...(payload as object),
          source: 'external',
        }),
      })

      await messagingService.publish('external.order', { orderId: '456' })
      await new Promise((r) => setImmediate(r))

      expect(receivedEvents).toHaveLength(1)
      expect(receivedEvents[0]).toEqual({ orderId: '456', source: 'external' })

      await bridge.cleanup()
    })
  })

  describe('bridgeOutbound', () => {
    it('should bridge internal events to external messages', async () => {
      const bridge = createEventBusBridge(eventBus, messagingService)

      const receivedMessages: unknown[] = []
      await messagingService.subscribe('external.notifications', async (msg) => {
        receivedMessages.push(msg.payload)
      })

      bridge.bridgeOutbound('internal.user.created', 'external.notifications')

      // Emit internal event
      await eventBus.emit('internal.user.created', { userId: '789' })

      // Wait for async processing
      await new Promise((r) => setImmediate(r))

      expect(receivedMessages).toHaveLength(1)
      expect(receivedMessages[0]).toEqual({ userId: '789' })

      await bridge.cleanup()
    })

    it('should transform payloads during outbound bridging', async () => {
      const bridge = createEventBusBridge(eventBus, messagingService)

      const receivedMessages: unknown[] = []
      await messagingService.subscribe('external.events', async (msg) => {
        receivedMessages.push(msg.payload)
      })

      bridge.bridgeOutbound('internal.event', 'external.events', {
        transform: (payload) => ({
          data: payload,
          timestamp: 'fixed',
        }),
      })

      await eventBus.emit('internal.event', { type: 'test' })
      await new Promise((r) => setImmediate(r))

      expect(receivedMessages).toHaveLength(1)
      expect(receivedMessages[0]).toEqual({
        data: { type: 'test' },
        timestamp: 'fixed',
      })

      await bridge.cleanup()
    })
  })

  describe('bridgeRequestReply', () => {
    it('should bridge external requests to internal processing', async () => {
      const bridge = createEventBusBridge(eventBus, messagingService)

      // Set up internal handler that responds
      eventBus.on('pricing.request', async (payload: unknown) => {
        const req = payload as { sku: string; correlationId: string }
        // Emit response event
        await eventBus.emit('pricing.request.response', {
          correlationId: req.correlationId,
          payload: { price: req.sku === 'ABC' ? 10.99 : 5.99 },
        })
      })

      await bridge.bridgeRequestReply('external.pricing', 'pricing.request', {
        timeout: 5000,
      })

      // Send request from external system
      const response = await messagingService.request<{ sku: string }, { price: number }>(
        'external.pricing',
        { sku: 'ABC' }
      )

      expect(response.price).toBe(10.99)

      await bridge.cleanup()
    })
  })

  describe('cleanup', () => {
    it('should unsubscribe from all bridges', async () => {
      const bridge = createEventBusBridge(eventBus, messagingService)

      const receivedEvents: unknown[] = []
      eventBus.on('test.event', async (payload) => {
        receivedEvents.push(payload)
      })

      const subscription = await bridge.bridgeInbound('test.subject', 'test.event')

      await messagingService.publish('test.subject', { n: 1 })
      await new Promise((r) => setImmediate(r))

      expect(receivedEvents).toHaveLength(1)

      // Cleanup
      await bridge.cleanup()

      // Should no longer receive
      await messagingService.publish('test.subject', { n: 2 })
      await new Promise((r) => setImmediate(r))

      expect(receivedEvents).toHaveLength(1)
    })
  })
})
