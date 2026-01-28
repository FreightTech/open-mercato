import { createMemoryDriver } from '../drivers/memory'
import type { Message, MessageContext } from '../types'

describe('Memory Driver', () => {
  describe('lifecycle', () => {
    it('should connect and disconnect', async () => {
      const driver = createMemoryDriver()

      expect(driver.isConnected()).toBe(false)

      await driver.connect()
      expect(driver.isConnected()).toBe(true)
      expect(await driver.isHealthy()).toBe(true)

      await driver.disconnect()
      expect(driver.isConnected()).toBe(false)
      expect(await driver.isHealthy()).toBe(false)
    })

    it('should have correct id and name', () => {
      const driver = createMemoryDriver()

      expect(driver.id).toBe('memory')
      expect(driver.name).toBe('In-Memory (Testing)')
    })
  })

  describe('publish/subscribe', () => {
    it('should deliver published messages to subscribers', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      const received: unknown[] = []

      await driver.subscribe('orders.created', async (msg) => {
        received.push(msg.payload)
      })

      await driver.publish('orders.created', { orderId: '123' })

      // Wait for async delivery
      await new Promise((r) => setImmediate(r))

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ orderId: '123' })

      await driver.disconnect()
    })

    it('should support wildcard subscriptions with *', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      const received: string[] = []

      await driver.subscribe('orders.*', async (msg) => {
        received.push(msg.subject)
      })

      await driver.publish('orders.created', {})
      await driver.publish('orders.updated', {})
      await driver.publish('orders.deleted', {})
      await driver.publish('customers.created', {})

      await new Promise((r) => setImmediate(r))

      expect(received).toEqual(['orders.created', 'orders.updated', 'orders.deleted'])

      await driver.disconnect()
    })

    it('should support wildcard subscriptions with >', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      const received: string[] = []

      await driver.subscribe('orders.>', async (msg) => {
        received.push(msg.subject)
      })

      await driver.publish('orders.created', {})
      await driver.publish('orders.items.added', {})
      await driver.publish('orders.items.updated', {})

      await new Promise((r) => setImmediate(r))

      expect(received).toEqual(['orders.created', 'orders.items.added', 'orders.items.updated'])

      await driver.disconnect()
    })

    it('should unsubscribe correctly', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      const received: unknown[] = []

      const subscription = await driver.subscribe('test', async (msg) => {
        received.push(msg.payload)
      })

      await driver.publish('test', { n: 1 })
      await new Promise((r) => setImmediate(r))

      await subscription.unsubscribe()

      await driver.publish('test', { n: 2 })
      await new Promise((r) => setImmediate(r))

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ n: 1 })

      await driver.disconnect()
    })

    it('should include message metadata', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      let receivedMsg: Message | null = null

      await driver.subscribe('test', async (msg) => {
        receivedMsg = msg
      })

      await driver.publish('test', { data: 'value' }, {
        headers: { 'x-custom': 'header' },
        correlationId: 'corr-123',
      })

      await new Promise((r) => setImmediate(r))

      expect(receivedMsg).not.toBeNull()
      expect(receivedMsg!.subject).toBe('test')
      expect(receivedMsg!.payload).toEqual({ data: 'value' })
      expect(receivedMsg!.headers).toEqual({ 'x-custom': 'header' })
      expect(receivedMsg!.metadata.source).toBe('memory')
      expect(receivedMsg!.metadata.timestamp).toBeDefined()

      await driver.disconnect()
    })
  })

  describe('request/reply', () => {
    it('should handle request-response pattern', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      await driver.reply<{ sku: string }, { available: boolean }>(
        'inventory.check',
        async (msg) => {
          return { available: msg.payload.sku === 'ABC' }
        }
      )

      const response = await driver.request<{ sku: string }, { available: boolean }>(
        'inventory.check',
        { sku: 'ABC' }
      )

      expect(response).toEqual({ available: true })

      const response2 = await driver.request<{ sku: string }, { available: boolean }>(
        'inventory.check',
        { sku: 'XYZ' }
      )

      expect(response2).toEqual({ available: false })

      await driver.disconnect()
    })

    it('should timeout if no reply handler', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      await expect(
        driver.request('no.handler', { data: 'test' })
      ).rejects.toThrow('No reply handler for subject: no.handler')

      await driver.disconnect()
    })

    it('should support wildcard reply handlers', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      await driver.reply('math.*', async (msg) => {
        const payload = msg.payload as { a: number; b: number }
        if (msg.subject === 'math.add') {
          return { result: payload.a + payload.b }
        }
        if (msg.subject === 'math.multiply') {
          return { result: payload.a * payload.b }
        }
        return { result: 0 }
      })

      const addResult = await driver.request<{ a: number; b: number }, { result: number }>(
        'math.add',
        { a: 2, b: 3 }
      )
      expect(addResult.result).toBe(5)

      const mulResult = await driver.request<{ a: number; b: number }, { result: number }>(
        'math.multiply',
        { a: 2, b: 3 }
      )
      expect(mulResult.result).toBe(6)

      await driver.disconnect()
    })
  })

  describe('error handling', () => {
    it('should throw when not connected', async () => {
      const driver = createMemoryDriver()

      await expect(driver.publish('test', {})).rejects.toThrow('Driver not connected')
      await expect(driver.subscribe('test', async () => {})).rejects.toThrow('Driver not connected')
      await expect(driver.request('test', {})).rejects.toThrow('Driver not connected')
    })

    it('should handle handler errors gracefully', async () => {
      const driver = createMemoryDriver()
      await driver.connect()

      const received: number[] = []

      // Handler that throws
      await driver.subscribe('test', async () => {
        throw new Error('Handler error')
      })

      // Another handler that should still receive
      await driver.subscribe('test', async (msg) => {
        received.push((msg.payload as { n: number }).n)
      })

      // Should not throw, errors are logged
      await driver.publish('test', { n: 1 })
      await new Promise((r) => setImmediate(r))

      expect(received).toEqual([1])

      await driver.disconnect()
    })
  })

  describe('options', () => {
    it('should support debug mode', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const driver = createMemoryDriver({ debug: true })
      await driver.connect()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[memory]'), expect.anything())

      await driver.disconnect()
      consoleSpy.mockRestore()
    })
  })
})
