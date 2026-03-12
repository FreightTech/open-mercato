/**
 * Transport Abstraction Layer
 *
 * Provides package-agnostic interfaces for external messaging transport.
 * The messaging package implements these interfaces and registers via DI.
 * The events package resolves them lazily for additive forwarding.
 */

export type {
  TransportDriver,
  TransportSubscription,
  TransportMessage,
  TransportMessageHandler,
} from './types'

export { DI_TOKENS } from './types'
