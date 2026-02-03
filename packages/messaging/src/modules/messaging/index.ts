/**
 * Messaging Module
 *
 * Provides external messaging transport (NATS, Kafka, Redis Streams).
 * When enabled, registers a TransportDriver in DI that the event bus
 * uses for additive external forwarding.
 */

export const metadata = {
  id: 'messaging',
  name: 'Messaging',
  description: 'External messaging transport (NATS, Kafka, Redis Streams)',
}
