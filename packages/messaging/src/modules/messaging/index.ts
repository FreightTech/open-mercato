/**
 * Messaging Module
 *
 * Provides external messaging transport (NATS, Kafka, Redis Streams).
 * When enabled, registers a TransportDriver in DI that the event bus
 * uses for additive external forwarding.
 *
 * Also provides:
 * - Async inbound consumer for processing external events via JetStream
 * - Reply handlers for synchronous command execution via request-reply
 */

export const metadata = {
  id: 'messaging',
  name: 'Messaging',
  description: 'External messaging transport (NATS, Kafka, Redis Streams)',
}

// Export reply handler utilities for external use
export {
  registerCommandReplyHandlers,
  unregisterCommandReplyHandlers,
  getReplyHandlerStats,
  isReplyHandlersEnabled,
  INBOUND_PREFIX,
} from './reply-handlers'

// Export inbound consumer utilities (for backwards compatibility)
export { createInboundConsumer } from './command-routing'
export type { InboundConsumer, InboundConsumerOptions } from './command-routing'

// Export async event consumer utilities
export {
  createAsyncInboundConsumer,
  buildTenantEventSubject,
} from './async-events'
export type { AsyncInboundConsumer, AsyncInboundConsumerOptions, InboundStats } from './inbound-types'
