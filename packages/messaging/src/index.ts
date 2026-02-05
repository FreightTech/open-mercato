/**
 * @open-mercato/messaging
 *
 * Pluggable messaging driver system for external system integration.
 * Supports NATS, Kafka, Redis Streams, and in-memory (testing) drivers.
 *
 * @example
 * ```typescript
 * import { createMessagingService, createMemoryDriver } from '@open-mercato/messaging'
 *
 * // Create a messaging service with memory driver
 * const service = createMessagingService({
 *   drivers: [createMemoryDriver()],
 * })
 *
 * await service.connectAll()
 *
 * // Subscribe to messages
 * await service.subscribe('orders.*', async (msg) => {
 *   console.log('Received:', msg.payload)
 * })
 *
 * // Publish a message
 * await service.publish('orders.created', { orderId: '123' })
 *
 * // Request-response
 * const response = await service.request('inventory.check', { sku: 'ABC' })
 * ```
 */

// Core types
export * from './types'

// Service
export { createMessagingService, MessagingService } from './service'

// Factory
export {
  createMessagingDriver,
  createMessagingDriverFromEnv,
  getMessagingStrategyFromEnv,
  type MessagingStrategyType,
} from './factory'

// Drivers
export { createMemoryDriver } from './drivers/memory'
export { createNatsDriver, type NatsDriverExtended } from './drivers/nats'

// Bridge
export {
  createEventBusBridge,
  EventBusBridgeClass,
  type EventBusBridge,
  type BridgeOptions,
  type RequestReplyBridgeOptions,
} from './bridge'

// DI
export {
  registerMessagingModule,
  addMessagingDriver,
  getMessagingBridge,
  type MessagingContainer,
  type MessagingModuleOptions,
} from './di'

// Auth Callout
export {
  createAuthCalloutHandler,
  createApiKeyAuthCallout,
  createAuthCalloutHttpHandler,
  type AuthCalloutRequest,
  type AuthCalloutResponse,
  type AuthCalloutOptions,
  type AuthCalloutHttpHandlerOptions,
  type TenantInfo,
  type NatsPermissions,
} from './auth-callout'

// Inbound Consumer (sync - for backwards compatibility)
export {
  createInboundConsumer,
  parseSubscribeFilterFromEnv,
  subjectMatches,
  shouldProcessSubject,
  tryExecuteCommand,
  routeMessage,
  type InboundConsumer,
  type InboundConsumerOptions,
  type MessageRouterContext,
  type TryExecuteCommandResult,
} from './modules/messaging/command-routing'

// Async Inbound Consumer (JetStream-based)
export {
  createAsyncInboundConsumer,
  parseAsyncInboundConfigFromEnv,
  buildTenantEventSubject,
} from './modules/messaging/async-events'

// Async Inbound Types
export type {
  AsyncInboundConfig,
  AsyncInboundConsumer,
  AsyncInboundConsumerOptions,
  InboundStats,
  WorkerState,
  QueuedMessage,
  MessageProcessingResult,
} from './modules/messaging/inbound-types'
