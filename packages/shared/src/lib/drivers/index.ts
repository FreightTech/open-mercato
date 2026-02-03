/**
 * Driver Abstraction Layer
 *
 * Provides package-agnostic interfaces for queue and cache drivers.
 * External packages (e.g., messaging) implement these interfaces and register via DI.
 * The queue/cache packages resolve them lazily when `strategy: 'custom'` is configured.
 */

export type {
  QueueDriver,
  QueueDriverOptions,
  QueueInterface,
  QueuedJobInterface,
  JobContextInterface,
  CacheDriver,
  CacheDriverOptions,
  CacheStrategyInterface,
} from './types'

export { DI_TOKENS } from './types'
