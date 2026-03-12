import { createMessagingService, MessagingService } from '../service'
import { createMemoryDriver } from '../drivers/memory'
import type { MessagingDriver } from '../types'

describe('MessagingService', () => {
  describe('driver management', () => {
    it('should add and retrieve drivers', () => {
      const service = createMessagingService()
      const driver = createMemoryDriver()

      service.addDriver(driver)

      expect(service.getDriver('memory')).toBe(driver)
      expect(service.getDriverIds()).toContain('memory')
    })

    it('should set first driver as default', () => {
      const service = createMessagingService()
      const driver = createMemoryDriver()

      service.addDriver(driver)

      expect(service.getDefaultDriver()).toBe(driver)
    })

    it('should accept initial drivers', () => {
      const driver1 = createMemoryDriver()
      const service = createMessagingService({
        drivers: [driver1],
      })

      expect(service.getDriver('memory')).toBe(driver1)
      expect(service.getDefaultDriver()).toBe(driver1)
    })

    it('should throw when no default driver', () => {
      const service = createMessagingService()

      expect(() => service.getDefaultDriver()).toThrow('No default messaging driver configured')
    })

    it('should throw when driver not found', async () => {
      const service = createMessagingService({
        drivers: [createMemoryDriver()],
      })

      await service.connectAll()

      await expect(
        service.publish('test', {}, { driver: 'nonexistent' })
      ).rejects.toThrow('Messaging driver not found: nonexistent')
    })
  })

  describe('lifecycle', () => {
    it('should connect all drivers', async () => {
      const driver1 = createMemoryDriver()
      const driver2 = createMemoryDriver()

      // Mock the second driver with a different ID
      Object.defineProperty(driver2, 'id', { value: 'memory2' })

      const service = createMessagingService({
        drivers: [driver1, driver2],
      })

      await service.connectAll()

      expect(driver1.isConnected()).toBe(true)
      expect(driver2.isConnected()).toBe(true)
    })

    it('should disconnect all drivers', async () => {
      const driver = createMemoryDriver()
      const service = createMessagingService({
        drivers: [driver],
      })

      await service.connectAll()
      expect(driver.isConnected()).toBe(true)

      await service.disconnectAll()
      expect(driver.isConnected()).toBe(false)
    })

    it('should perform health check', async () => {
      const driver = createMemoryDriver()
      const service = createMessagingService({
        drivers: [driver],
      })

      await service.connectAll()

      const health = await service.healthCheck()
      expect(health.memory).toBe(true)

      await service.disconnectAll()

      const health2 = await service.healthCheck()
      expect(health2.memory).toBe(false)
    })
  })

  describe('operations', () => {
    let service: MessagingService
    let driver: MessagingDriver

    beforeEach(async () => {
      driver = createMemoryDriver()
      service = new MessagingService({
        drivers: [driver],
      })
      await service.connectAll()
    })

    afterEach(async () => {
      await service.disconnectAll()
    })

    it('should publish messages', async () => {
      const received: unknown[] = []

      await service.subscribe('test', async (msg) => {
        received.push(msg.payload)
      })

      await service.publish('test', { data: 'value' })

      await new Promise((r) => setImmediate(r))

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ data: 'value' })
    })

    it('should handle request-response', async () => {
      await service.reply<{ input: number }, { output: number }>(
        'double',
        async (msg) => ({
          output: msg.payload.input * 2,
        })
      )

      const response = await service.request<{ input: number }, { output: number }>(
        'double',
        { input: 5 }
      )

      expect(response.output).toBe(10)
    })

    it('should target specific driver', async () => {
      const driver2 = createMemoryDriver()
      Object.defineProperty(driver2, 'id', { value: 'memory2' })

      service.addDriver(driver2)
      await driver2.connect()

      const received1: unknown[] = []
      const received2: unknown[] = []

      await service.subscribe('test', async (msg) => {
        received1.push(msg.payload)
      }, { driver: 'memory' })

      await service.subscribe('test', async (msg) => {
        received2.push(msg.payload)
      }, { driver: 'memory2' })

      // Publish to memory
      await service.publish('test', { target: 'memory' }, { driver: 'memory' })
      await new Promise((r) => setImmediate(r))

      // Publish to memory2
      await service.publish('test', { target: 'memory2' }, { driver: 'memory2' })
      await new Promise((r) => setImmediate(r))

      expect(received1).toEqual([{ target: 'memory' }])
      expect(received2).toEqual([{ target: 'memory2' }])

      await driver2.disconnect()
    })
  })

  describe('class implementation', () => {
    it('should work with class-based instantiation', async () => {
      const service = new MessagingService({
        drivers: [createMemoryDriver()],
      })

      await service.connectAll()

      const received: unknown[] = []

      await service.subscribe('test', async (msg) => {
        received.push(msg.payload)
      })

      await service.publish('test', { class: 'based' })
      await new Promise((r) => setImmediate(r))

      expect(received).toHaveLength(1)

      await service.disconnectAll()
    })
  })
})
