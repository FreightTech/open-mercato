/**
 * Command Reply Handlers for Synchronous Request-Response
 *
 * IMPORTANT: This is for COMMANDS ONLY, not events.
 * Events should use tenant-prefixed subjects (see async-events.ts).
 *
 * Registers NATS reply handlers for all registered commands, enabling
 * external systems to execute commands synchronously via request-reply pattern.
 *
 * Subject Pattern:
 * - Commands: inbound.{commandId} (synchronous request-reply)
 * - Events: events.{tenantID}.{event_subject} (handled by async consumer)
 *
 * This complements the async inbound consumer by providing:
 * - Synchronous responses for commands that need immediate results
 * - Request-reply pattern via NATS (driver.request())
 * - Direct command execution without tenant prefix (tenant in payload)
 *
 * Example usage from external system (n8n, Zapier):
 * ```typescript
 * // For commands (synchronous):
 * const response = await natsDriver.request('inbound.customers.people.create', {
 *   input: { email: 'test@example.com', name: 'Test User' },
 *   tenantId: 'acme-corp',
 *   organizationId: 'org-123'
 * })
 * // response: { success: true, result: {...} }
 *
 * // For events (fire-and-forget):
 * await natsDriver.publish('events.acme-corp.customers.people.created', {
 *   id: '123',
 *   email: 'test@example.com',
 *   tenantId: 'acme-corp'
 * })
 * ```
 *
 * Configuration:
 * - MESSAGING_REPLY_HANDLERS_ENABLED: Enable reply handlers (default: true)
 * - MESSAGING_DEBUG: Enable debug logging
 */

import type { AwilixContainer } from 'awilix'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { commandRegistry } from '@open-mercato/shared/lib/commands/registry'
import type { MessagingDriver, Subscription } from '../../types'

/** Subject prefix for command reply handlers */
export const INBOUND_PREFIX = 'inbound.'

/** Tracked reply handler subscriptions for cleanup */
const replySubscriptions: Subscription[] = []

/**
 * Check if reply handlers are enabled via environment variable.
 */
export function isReplyHandlersEnabled(): boolean {
  const enabled = process.env.MESSAGING_REPLY_HANDLERS_ENABLED
  // Default to true if not specified
  return enabled !== 'false'
}

/**
 * Register reply handlers for all commands in the command registry.
 *
 * Each command gets a reply handler on subject: inbound.{commandId}
 * External systems can call driver.request() to execute commands synchronously.
 *
 * @param driver - The messaging driver (must be connected)
 * @param commandBus - The command bus for executing commands
 * @param container - The DI container for building command context
 * @returns Promise that resolves when all handlers are registered
 */
export async function registerCommandReplyHandlers(
  driver: MessagingDriver,
  commandBus: CommandBus,
  container: AwilixContainer
): Promise<void> {
  if (!isReplyHandlersEnabled()) {
    console.log('[messaging:reply] Reply handlers disabled via MESSAGING_REPLY_HANDLERS_ENABLED=false')
    return
  }

  if (!driver.isConnected()) {
    throw new Error('Cannot register reply handlers: driver not connected')
  }

  const debug = process.env.MESSAGING_DEBUG === 'true'
  const commandIds = commandRegistry.list()

  if (commandIds.length === 0) {
    console.warn('[messaging:reply] No commands registered, skipping reply handlers')
    return
  }

  console.log(`[messaging:reply] Registering reply handlers for ${commandIds.length} command(s)...`)

  let registered = 0
  let failed = 0

  for (const commandId of commandIds) {
    const subject = `${INBOUND_PREFIX}${commandId}`

    try {
      const subscription = await driver.reply(
        subject,
        async (msg) => {
          if (debug) {
            console.log(`[messaging:reply] Received request for ${commandId}`)
          }

          try {
            // Parse payload - expect { input, tenantId, organizationId }
            const payload = msg.payload as {
              input?: unknown
              tenantId?: string
              organizationId?: string
            }

            const rawInput = payload.input ?? payload // Allow { input: {...} } or direct payload
            const tenantId = payload.tenantId ?? null
            const organizationId = payload.organizationId ?? null

            // Merge tenantId and organizationId into input for command validation
            const input = typeof rawInput === 'object' && rawInput !== null
              ? { ...rawInput, tenantId, organizationId }
              : rawInput

            // Build command context
            const ctx = {
              container,
              auth: tenantId ? {
                tenantId,
                sub: null,
                orgId: organizationId,
              } as any : null,
              organizationScope: null,
              selectedOrganizationId: organizationId,
              organizationIds: organizationId ? [organizationId] : null,
            }

            // Execute command
            const executeResult = await commandBus.execute(commandId, {
              input,
              ctx,
              metadata: {
                tenantId,
                organizationId,
              },
            })

            if (debug) {
              console.log(`[messaging:reply] Command ${commandId} executed successfully`)
            }

            // Return success response
            return {
              success: true,
              result: executeResult.result,
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            console.error(`[messaging:reply] Command ${commandId} execution failed:`, error)

            // Return error response
            return {
              success: false,
              error,
              errorMsg,
              code: (error as any)?.code,
            }
          }
        }
      )

      replySubscriptions.push(subscription)
      registered++

      if (debug) {
        console.log(`[messaging:reply] Registered handler for ${subject}`)
      }
    } catch (error) {
      console.error(`[messaging:reply] Failed to register handler for ${subject}:`, error)
      failed++
    }
  }

  console.log(`[messaging:reply] Registered ${registered} reply handler(s)${failed > 0 ? `, ${failed} failed` : ''}`)
}

/**
 * Unregister all reply handlers and clean up subscriptions.
 *
 * @returns Promise that resolves when all handlers are cleaned up
 */
export async function unregisterCommandReplyHandlers(): Promise<void> {
  if (replySubscriptions.length === 0) {
    return
  }

  console.log(`[messaging:reply] Unregistering ${replySubscriptions.length} reply handler(s)...`)

  await Promise.allSettled(
    replySubscriptions.map(async (sub) => {
      try {
        await sub.drain()
      } catch (error) {
        // Ignore drain errors
        console.warn(`[messaging:reply] Failed to drain subscription ${sub.id}:`, error)
      }
    })
  )

  replySubscriptions.length = 0
  console.log('[messaging:reply] Reply handlers unregistered')
}

/**
 * Get statistics about registered reply handlers.
 */
export function getReplyHandlerStats() {
  return {
    enabled: isReplyHandlersEnabled(),
    registered: replySubscriptions.length,
    subscriptions: replySubscriptions.map((sub) => ({
      id: sub.id,
      subject: sub.subject,
    })),
  }
}
