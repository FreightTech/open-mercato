/**
 * Inbound Consumer for External Events
 *
 * Subscribes to external events from NATS and routes them appropriately:
 * 1. If the subject matches a registered command ID, executes the command directly
 * 2. Otherwise, forwards the event to the local event bus
 *
 * This enables external systems (e.g., n8n, Zapier) to:
 * - Execute commands directly (e.g., `customers.people.create`)
 * - Trigger internal event handlers
 *
 * Loop prevention:
 * - NATS driver adds `x-source: open-mercato` header to all outbound messages
 * - When we receive a message with this header, we skip it (it originated from us)
 * - This prevents: emit() -> NATS -> inbound -> emit() infinite loops
 *
 * Configuration:
 * - MESSAGING_SUBSCRIBE_INCLUDE: Comma-separated patterns to include (e.g., "customers.>,sales.>")
 * - MESSAGING_SUBSCRIBE_EXCLUDE: Comma-separated patterns to exclude
 * - MESSAGING_DEBUG: Enable debug logging
 *
 * Command Message Format:
 * ```json
 * {
 *   "input": { ... },           // Command input payload
 *   "tenantId": "...",          // Required for scoped commands
 *   "organizationId": "..."     // Required for org-scoped commands
 * }
 * ```
 */

import type { MessagingDriver, Subscription, PublishFilter } from '../../types'
import type { EventBus } from '@open-mercato/events'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { commandRegistry } from '@open-mercato/shared/lib/commands/registry'
import type { AwilixContainer } from 'awilix'

/** Options for creating an inbound consumer */
export interface InboundConsumerOptions {
  /** Enable debug logging */
  debug?: boolean
  /** Subscribe filter patterns */
  filter?: PublishFilter
  /** Command bus for executing commands (enables command routing) */
  commandBus?: CommandBus
  /** DI container for building command runtime context */
  container?: AwilixContainer
}

/** Inbound consumer instance */
export interface InboundConsumer {
  /** Start consuming external events */
  start(): Promise<void>
  /** Stop consuming and clean up subscriptions */
  stop(): Promise<void>
  /** Check if consumer is active */
  isActive(): boolean
}

/**
 * Check if a subject matches a pattern (supports * and > wildcards).
 * - `*` matches a single token
 * - `>` matches one or more tokens (only at end)
 */
function subjectMatches(pattern: string, subject: string): boolean {
  const patternParts = pattern.split('.')
  const subjectParts = subject.split('.')

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]

    if (patternPart === '>') {
      // '>' matches rest of the subject
      return i < subjectParts.length
    }

    if (patternPart === '*') {
      // '*' matches exactly one token
      if (i >= subjectParts.length) return false
      continue
    }

    // Exact match required
    if (patternPart !== subjectParts[i]) return false
  }

  // All pattern parts matched, check subject length
  return patternParts.length === subjectParts.length
}

/**
 * Check if a subject should be processed based on include/exclude filters.
 */
function shouldProcessSubject(subject: string, filter?: PublishFilter): boolean {
  if (!filter) return true

  // If include is specified, subject must match at least one include pattern
  if (filter.include && filter.include.length > 0) {
    const matchesInclude = filter.include.some((pattern) => subjectMatches(pattern, subject))
    if (!matchesInclude) return false
  }

  // If exclude is specified, subject must not match any exclude pattern
  if (filter.exclude && filter.exclude.length > 0) {
    const matchesExclude = filter.exclude.some((pattern) => subjectMatches(pattern, subject))
    if (matchesExclude) return false
  }

  return true
}

/**
 * Parse filter configuration from environment variables.
 */
export function parseSubscribeFilterFromEnv(): PublishFilter | undefined {
  const include = process.env.MESSAGING_SUBSCRIBE_INCLUDE
  const exclude = process.env.MESSAGING_SUBSCRIBE_EXCLUDE

  if (!include && !exclude) {
    return undefined
  }

  return {
    include: include ? include.split(',').map((p) => p.trim()).filter(Boolean) : undefined,
    exclude: exclude ? exclude.split(',').map((p) => p.trim()).filter(Boolean) : undefined,
  }
}

/**
 * Creates an inbound consumer that routes external NATS messages.
 *
 * If commandBus is provided and the message subject matches a registered command,
 * the command is executed directly. Otherwise, the message is forwarded to the event bus.
 *
 * @param driver - The messaging driver (must be connected)
 * @param eventBus - The local event bus to emit events to
 * @param options - Consumer options (including optional commandBus for command routing)
 * @returns An InboundConsumer instance
 *
 * @example
 * ```typescript
 * // With command routing enabled
 * const consumer = createInboundConsumer(driver, eventBus, {
 *   debug: true,
 *   filter: { include: ['customers.>', 'sales.>'] },
 *   commandBus,
 *   container,
 * })
 * await consumer.start()
 *
 * // External system can now publish commands directly:
 * // Subject: customers.people.create
 * // Payload: { input: { email: "test@example.com" }, tenantId: "...", organizationId: "..." }
 * ```
 */
export function createInboundConsumer(
  driver: MessagingDriver,
  eventBus: EventBus,
  options?: InboundConsumerOptions
): InboundConsumer {
  const debug = options?.debug ?? process.env.MESSAGING_DEBUG === 'true'
  const filter = options?.filter
  const commandBus = options?.commandBus
  const container = options?.container

  // Track subscriptions for cleanup
  const subscriptions: Subscription[] = []
  let active = false

  function log(...args: unknown[]): void {
    if (debug) console.log('[messaging:inbound]', ...args)
  }

  /**
   * Attempts to execute the message as a command if:
   * 1. commandBus and container are provided
   * 2. The subject matches a registered command ID
   *
   * @returns true if handled as command, false otherwise
   */
  async function tryExecuteCommand(subject: string, payload: unknown): Promise<boolean> {
    // Skip if command routing is not enabled
    if (!commandBus || !container) {
      return false
    }

    // Check if subject matches a registered command
    if (!commandRegistry.has(subject)) {
      return false
    }

    log(`Executing as command: ${subject}`)

    // Parse payload - expect { input, tenantId, organizationId }
    const data = payload as Record<string, unknown> | null
    if (!data || typeof data !== 'object') {
      console.error(`[messaging:inbound] Invalid command payload for "${subject}": expected object`)
      return true // Handled (with error)
    }

    const input = data.input ?? data // Allow { input: {...} } or direct payload
    const tenantId = (data.tenantId as string) ?? null
    const organizationId = (data.organizationId as string) ?? null

    try {
      await commandBus.execute(subject, {
        input,
        ctx: {
          container,
          auth: tenantId ? { tenantId, sub: null, orgId: organizationId } as any : null,
          organizationScope: null,
          selectedOrganizationId: organizationId,
          organizationIds: organizationId ? [organizationId] : null,
        },
        metadata: {
          tenantId,
          organizationId,
        },
      })
      log(`Command executed successfully: ${subject}`)
    } catch (error) {
      console.error(`[messaging:inbound] Command execution failed for "${subject}":`, error)
    }

    return true // Handled as command
  }

  /**
   * Build subscription patterns from include filter.
   * If no include patterns are specified, subscribes to ">" (all events).
   */
  function getSubscriptionPatterns(): string[] {
    if (filter?.include && filter.include.length > 0) {
      return filter.include
    }
    // Default to all events if no include filter
    return ['>']
  }

  return {
    async start(): Promise<void> {
      if (active) {
        log('Consumer already active')
        return
      }

      if (!driver.isConnected()) {
        throw new Error('Messaging driver is not connected')
      }

      log('Starting inbound consumer...')
      active = true

      const patterns = getSubscriptionPatterns()
      log(`Subscribing to patterns: ${patterns.join(', ')}`)

      // Create subscriptions for each pattern
      for (const pattern of patterns) {
        try {
          const subscription = await driver.subscribe(pattern, async (message) => {
            const subject = message.subject

            // Apply exclude filter (include was already applied by subscription pattern)
            if (!shouldProcessSubject(subject, { exclude: filter?.exclude })) {
              log(`Skipping excluded event: ${subject}`)
              return
            }

            log(`Received external message: ${subject}`)

            // Try to execute as command first (if subject matches a registered command)
            const handledAsCommand = await tryExecuteCommand(subject, message.payload)
            if (handledAsCommand) {
              return
            }

            // Not a command - forward to local event bus
            // The event bus will then:
            // 1. Deliver to local handlers
            // 2. Forward back to NATS (with x-source header)
            // The NATS driver will skip our own messages via x-source check
            try {
              await eventBus.emit(subject, message.payload)
              log(`Forwarded to event bus: ${subject}`)
            } catch (error) {
              console.error(`[messaging:inbound] Failed to emit event "${subject}":`, error)
            }
          })

          subscriptions.push(subscription)
          log(`Subscribed to: ${pattern}`)
        } catch (error) {
          console.error(`[messaging:inbound] Failed to subscribe to "${pattern}":`, error)
        }
      }

      log(`Started with ${subscriptions.length} subscription(s)`)
    },

    async stop(): Promise<void> {
      if (!active) {
        return
      }

      log('Stopping inbound consumer...')
      active = false

      // Drain all subscriptions
      for (const subscription of subscriptions) {
        try {
          await subscription.drain()
        } catch {
          // Ignore drain errors
        }
      }

      subscriptions.length = 0
      log('Stopped')
    },

    isActive(): boolean {
      return active
    },
  }
}
