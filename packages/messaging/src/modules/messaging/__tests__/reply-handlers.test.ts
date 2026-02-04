/**
 * Tests for command reply handlers
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { asValue, createContainer } from 'awilix'
import type { AwilixContainer } from 'awilix'
import { createMemoryDriver } from '../../../drivers/memory'
import type { MessagingDriver } from '../../../types'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { commandRegistry } from '@open-mercato/shared/lib/commands/registry'
import type { CommandHandler } from '@open-mercato/shared/lib/commands/types'
import {
  registerCommandReplyHandlers,
  unregisterCommandReplyHandlers,
  getReplyHandlerStats,
  INBOUND_PREFIX,
} from '../reply-handlers'

describe('Command Reply Handlers', () => {
  let driver: MessagingDriver
  let commandBus: CommandBus
  let container: AwilixContainer

  // Test command handlers
  const echoCommand: CommandHandler<{ message: string }, { echo: string }> = {
    id: 'test.echo',
    async prepare(input) {
      return null
    },
    async execute(input) {
      return { echo: input.message }
    },
  }

  const failCommand: CommandHandler<{ shouldFail: boolean }, { success: boolean }> = {
    id: 'test.fail',
    async prepare(input) {
      return null
    },
    async execute(input) {
      if (input.shouldFail) {
        throw new Error('Command failed as requested')
      }
      return { success: true }
    },
  }

  beforeEach(async () => {
    // Create fresh driver and connect
    driver = createMemoryDriver()
    await driver.connect()

    // Create command bus and container
    commandBus = new CommandBus()
    container = createContainer()
    container.register({
      commandBus: asValue(commandBus),
    })

    // Register test commands
    commandRegistry.register(echoCommand)
    commandRegistry.register(failCommand)
  })

  afterEach(async () => {
    // Clean up in correct order
    await unregisterCommandReplyHandlers()
    
    // Unregister all test commands
    const commands = ['test.echo', 'test.fail', 'test.context']
    for (const cmd of commands) {
      if (commandRegistry.has(cmd)) {
        commandRegistry.unregister(cmd)
      }
    }
    
    await driver.disconnect()
  })

  it('registers reply handlers for all commands', async () => {
    await registerCommandReplyHandlers(driver, commandBus, container)

    const stats = getReplyHandlerStats()
    expect(stats.registered).toBe(2) // echo + fail
    expect(stats.subscriptions).toHaveLength(2)
    expect(stats.subscriptions.some((s) => s.subject === `${INBOUND_PREFIX}test.echo`)).toBe(true)
    expect(stats.subscriptions.some((s) => s.subject === `${INBOUND_PREFIX}test.fail`)).toBe(true)
  })

  it('executes commands via request-reply successfully', async () => {
    await registerCommandReplyHandlers(driver, commandBus, container)

    const response = await driver.request<
      { input: { message: string } },
      { success: boolean; result: { echo: string } }
    >(`${INBOUND_PREFIX}test.echo`, {
      input: { message: 'Hello World' },
    })

    expect(response.success).toBe(true)
    expect(response.result.echo).toBe('Hello World')
  })

  it('handles command execution errors gracefully', async () => {
    await registerCommandReplyHandlers(driver, commandBus, container)

    const response = await driver.request<
      { input: { shouldFail: boolean } },
      { success: boolean; error?: string }
    >(`${INBOUND_PREFIX}test.fail`, {
      input: { shouldFail: true },
    })

    expect(response.success).toBe(false)
    expect(response.error).toContain('Command failed as requested')
  })

  it('supports direct payload format (without input wrapper)', async () => {
    await registerCommandReplyHandlers(driver, commandBus, container)

    // Send payload directly without { input: ... } wrapper
    const response = await driver.request<
      { message: string },
      { success: boolean; result: { echo: string } }
    >(`${INBOUND_PREFIX}test.echo`, {
      message: 'Direct payload',
    })

    expect(response.success).toBe(true)
    expect(response.result.echo).toBe('Direct payload')
  })

  it('includes tenantId and organizationId in command context', async () => {
    // Create a command that checks context
    const contextCommand: CommandHandler<
      { tenantId?: string; organizationId?: string },
      { receivedContext: any }
    > = {
      id: 'test.context',
      async prepare(input) {
        return null
      },
      async execute(input, ctx) {
        return {
          receivedContext: {
            tenantId: ctx.auth?.tenantId,
            organizationId: ctx.selectedOrganizationId,
          },
        }
      },
    }

    commandRegistry.register(contextCommand)

    await registerCommandReplyHandlers(driver, commandBus, container)

    const response = await driver.request<
      { input: {}; tenantId: string; organizationId: string },
      { success: boolean; result: { receivedContext: any } }
    >(`${INBOUND_PREFIX}test.context`, {
      input: {},
      tenantId: 'tenant-123',
      organizationId: 'org-456',
    })

    expect(response.success).toBe(true)
    expect(response.result.receivedContext.tenantId).toBe('tenant-123')
    expect(response.result.receivedContext.organizationId).toBe('org-456')

    commandRegistry.unregister('test.context')
  })

  it('unregisters all handlers on cleanup', async () => {
    await registerCommandReplyHandlers(driver, commandBus, container)

    let stats = getReplyHandlerStats()
    expect(stats.registered).toBe(2)

    await unregisterCommandReplyHandlers()

    stats = getReplyHandlerStats()
    expect(stats.registered).toBe(0)
    expect(stats.subscriptions).toHaveLength(0)
  })

  it('handles empty command registry gracefully', async () => {
    // Unregister all commands
    commandRegistry.unregister('test.echo')
    commandRegistry.unregister('test.fail')

    // Should not throw
    await expect(registerCommandReplyHandlers(driver, commandBus, container)).resolves.not.toThrow()

    const stats = getReplyHandlerStats()
    expect(stats.registered).toBe(0)
  })

  it('requires connected driver', async () => {
    await driver.disconnect()

    await expect(registerCommandReplyHandlers(driver, commandBus, container)).rejects.toThrow(
      'Cannot register reply handlers: driver not connected'
    )
  })

  it('respects MESSAGING_REPLY_HANDLERS_ENABLED=false', async () => {
    const originalEnv = process.env.MESSAGING_REPLY_HANDLERS_ENABLED
    process.env.MESSAGING_REPLY_HANDLERS_ENABLED = 'false'

    await registerCommandReplyHandlers(driver, commandBus, container)

    const stats = getReplyHandlerStats()
    expect(stats.enabled).toBe(false)
    expect(stats.registered).toBe(0)

    // Restore
    if (originalEnv !== undefined) {
      process.env.MESSAGING_REPLY_HANDLERS_ENABLED = originalEnv
    } else {
      delete process.env.MESSAGING_REPLY_HANDLERS_ENABLED
    }
  })
})
