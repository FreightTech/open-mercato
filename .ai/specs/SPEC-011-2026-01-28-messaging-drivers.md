# SPEC-011: Messaging Drivers System

**Created:** 2026-01-28
**Status:** Implemented
**Package:** `@open-mercato/messaging`

## Overview

The messaging drivers system provides a **pluggable messaging infrastructure** that enables two-way communication with external systems (NATS, Kafka, Redis Streams, etc.) while maintaining consistency with existing patterns (search strategies, queue strategies).

### Use Cases

1. **External system integration**: Connect ERP, warehouse, payment systems via NATS/Kafka
2. **Request-response patterns**: Send order to external system, await confirmation
3. **Event sourcing**: Replay events from external streams
4. **Multi-system orchestration**: Coordinate workflows across services

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Application Code                                │
│                                                                          │
│   messagingService.send('orders.created', payload)                      │
│   messagingService.request('inventory.check', payload) → response       │
│   messagingService.subscribe('payments.*', handler)                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        MessagingService                                  │
│                  (packages/messaging/src/service.ts)                     │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  Driver Registry │  │ Correlation Mgr  │  │  Subscription Mgr │       │
│  │  Map<id, driver> │  │ pending requests │  │  active handlers  │       │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │
└───────────┼─────────────────────┼─────────────────────┼─────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Driver Interface                                 │
│                                                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │   NATS    │  │   Kafka   │  │   Redis   │  │  In-Memory │            │
│  │  Driver   │  │  Driver   │  │  Streams  │  │  (testing) │            │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘            │
└────────┼──────────────┼──────────────┼──────────────┼───────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────────┐
    │  NATS   │   │  Kafka  │   │  Redis  │   │  Local Map  │
    │ Server  │   │ Cluster │   │ Server  │   │  (in-proc)  │
    └─────────┘   └─────────┘   └─────────┘   └─────────────┘
```

## Core Interfaces

### MessagingDriver

```typescript
interface MessagingDriver {
  readonly id: MessagingDriverId
  readonly name: string

  // Lifecycle
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  isHealthy(): Promise<boolean>

  // One-way messaging
  publish(subject: string, payload: unknown, options?: PublishOptions): Promise<string>

  // Request-response
  request<Req, Resp>(subject: string, payload: Req, options?: RequestOptions): Promise<Resp>

  // Subscriptions
  subscribe(subject: string, handler: MessageHandler, options?: SubscribeOptions): Promise<Subscription>
  reply<Req, Resp>(subject: string, handler: ReplyHandler<Req, Resp>, options?: SubscribeOptions): Promise<Subscription>
}
```

### Message Structure

```typescript
interface Message<T = unknown> {
  id: string
  subject: string
  payload: T
  headers?: Record<string, string>
  metadata: {
    timestamp: string
    correlationId?: string
    replyTo?: string
    source?: MessagingDriverId
  }
}
```

## Available Drivers

| Driver | Status | Description |
|--------|--------|-------------|
| `memory` | ✅ Implemented | In-memory driver for testing |
| `nats` | ✅ Implemented | NATS + JetStream support |
| `kafka` | 🚧 Placeholder | Apache Kafka (not yet implemented) |
| `redis-streams` | 🚧 Placeholder | Redis Streams (not yet implemented) |

### Memory Driver

Full-featured in-memory implementation for testing:

```typescript
import { createMemoryDriver } from '@open-mercato/messaging'

const driver = createMemoryDriver({ debug: true })
await driver.connect()

// Supports wildcards (* and >)
await driver.subscribe('orders.*', async (msg) => {
  console.log('Received:', msg.payload)
})
```

### NATS Driver

Production-ready NATS driver with JetStream support:

```typescript
import { createNatsDriver } from '@open-mercato/messaging'

const driver = createNatsDriver({
  servers: 'nats://localhost:4222',
  jetstream: { enabled: true },
  debug: true,
})
await driver.connect()

// Persistent messages via JetStream
await driver.publish('orders.created', payload, { persistent: true })
```

## MessagingService

The service manages multiple drivers and provides a unified API:

```typescript
import { createMessagingService, createMemoryDriver, createNatsDriver } from '@open-mercato/messaging'

const service = createMessagingService({
  drivers: [createMemoryDriver(), createNatsDriver()],
  defaultDriver: 'nats',
})

await service.connectAll()

// Use default driver
await service.publish('orders.created', { orderId: '123' })

// Target specific driver
await service.publish('test.event', { data: 'value' }, { driver: 'memory' })

// Health check all drivers
const health = await service.healthCheck()
// { nats: true, memory: true }
```

## EventBus Bridge

Bidirectional bridging between internal EventBus and external messaging:

```typescript
import { createEventBusBridge } from '@open-mercato/messaging'

const bridge = createEventBusBridge(eventBus, messagingService)

// Inbound: External → Internal events
await bridge.bridgeInbound('erp.orders.*', 'sales.order.external')

// Outbound: Internal events → External
bridge.bridgeOutbound('sales.order.created', 'orders.new')

// Request-reply: External request → Internal processing → Response
await bridge.bridgeRequestReply('pricing.calculate', 'catalog.price.request')
```

## DI Registration

```typescript
import { registerMessagingModule } from '@open-mercato/messaging'

// Basic registration using environment variables
registerMessagingModule(container)

// With custom configuration
registerMessagingModule(container, {
  strategy: 'nats',
  debug: true,
  createBridge: true,
  autoConnect: true,
})
```

## Multi-Tenant Support

The NATS driver provides built-in multi-tenant isolation for external system integration (e.g., n8n workflows).

### Tenant Prefix

When `tenantPrefix` is enabled (default: true), the driver:

1. **On Publish**: Prefixes subjects with tenantId extracted from payload
   - `customers.deal.created` → `{tenantId}.customers.deal.created`

2. **On Subscribe**: Uses wildcard to catch all tenant-prefixed messages
   - Subscribes to `*.customers.deal.created` instead of `customers.deal.created`

3. **On Receive**: Strips prefix and injects tenantId into payload
   - Subject: `abc123.customers.deal.created` → `customers.deal.created`
   - Payload: `{ tenantId: "abc123", ...originalPayload }`

### Source Header (Loop Prevention)

To prevent infinite event loops when the app both publishes and subscribes:

1. **On Publish**: Adds `x-source: open-mercato` header
2. **On Receive**: Skips messages with our source header

```
App publishes: customers.deal.created
  ↓
NATS: abc123.customers.deal.created (headers: x-source: open-mercato)
  ↓
App receives own message → x-source present → SKIP (no loop)

n8n publishes: abc123.customers.deal.updated (no x-source header)
  ↓
App receives → no x-source → PROCESS ✓
```

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              NATS Server                                 │
│                                                                          │
│  Subject: abc123.customers.deal.created                                 │
│  Headers: { x-source: "open-mercato" }                                  │
└─────────────────────────────────────────────────────────────────────────┘
         ▲                                           ▲
         │ publish                                   │ publish
         │ (adds prefix + source header)             │ (prefix only, no source)
         │                                           │
┌────────┴────────┐                          ┌──────┴──────┐
│   Open Mercato  │                          │    n8n      │
│                 │                          │ (tenant-abc) │
│ subscribe to:   │                          │ subscribe:   │
│ *.customers.>   │                          │ abc123.>     │
│                 │                          │              │
│ receives:       │                          │ receives:    │
│ - own msg → skip│                          │ all events ✓ │
│ - n8n msg → ok  │                          │              │
└─────────────────┘                          └──────────────┘
```

### n8n Configuration

1. Create an API key scoped to a tenant in open-mercato
2. Configure n8n NATS credentials:
   - Server URL: `nats://nats:4222`
   - Authentication: Token
   - Token: `omk_xxxxxxxx.yyyyyyyyyyyy` (the API key)
3. Subscribe to tenant-prefixed subjects: `{tenantId}.>`

## Publish & Subscribe Filters

Separate filters control what events are published to NATS and what events the app subscribes to from external systems.

### Publish Filter

Controls what events the app sends OUT to NATS:

```bash
# Include only specific patterns (if set, only matching events are published)
MESSAGING_PUBLISH_INCLUDE=customers.>,catalog.>,sales.>

# Exclude patterns (matching events are NOT published)
MESSAGING_PUBLISH_EXCLUDE=query_index.>,search.>
```

### Subscribe Filter

Controls what events the app receives FROM external systems:

```bash
# Include patterns to subscribe to (REQUIRED - default is no subscriptions)
MESSAGING_SUBSCRIBE_INCLUDE=customers.>,sales.>

# Exclude patterns from subscription
MESSAGING_SUBSCRIBE_EXCLUDE=
```

**Important**: By default, if `MESSAGING_SUBSCRIBE_INCLUDE` is not set, the app creates NO NATS subscriptions. This means internal events stay internal, and only explicitly included patterns will listen for external messages.

### Pattern Syntax

Uses NATS-style wildcards:
- `*` matches one token (e.g., `customers.*` matches `customers.created`)
- `>` matches rest of subject (e.g., `customers.>` matches `customers.deal.created`)

### Example Configuration

```bash
# App publishes customer/sales events to NATS (for n8n)
# but excludes internal indexing events
MESSAGING_PUBLISH_EXCLUDE=query_index.>,search.>

# App only subscribes to events n8n might send back
MESSAGING_SUBSCRIBE_INCLUDE=customers.>,sales.>
```

## NATS Auth Callout

For dynamic multi-tenant authentication, the messaging package provides an Auth Callout handler.

### How It Works

1. Client (n8n) connects to NATS with API key as token
2. NATS forwards auth request to your auth callout endpoint
3. Endpoint validates API key, returns JWT with tenant-scoped permissions
4. Client can only pub/sub to subjects matching their tenant prefix

### Auth Callout Handler

```typescript
import { createAuthCalloutHttpHandler } from '@open-mercato/messaging'
import { findApiKeyBySecret } from '@open-mercato/core/modules/api_keys/services/apiKeyService'

const handler = createAuthCalloutHttpHandler({
  jwtSecret: process.env.JWT_SECRET!,
  debug: process.env.NATS_AUTH_DEBUG === 'true',
  validateApiKey: async (apiKey) => {
    const em = /* get entity manager */
    const key = await findApiKeyBySecret(em, apiKey)
    if (!key?.tenantId) return null
    return { tenantId: key.tenantId, organizationId: key.organizationId }
  },
})

// Mount as API route
export async function POST(req: Request) {
  return handler(req)
}
```

### NATS Server Configuration

```conf
authorization {
  auth_callout {
    issuer: "open-mercato"
    auth_users: ["auth_service"]
    account: $SYS
  }
}
```

### Returned Permissions

The auth callout returns a JWT with tenant-scoped permissions:

```json
{
  "nats": {
    "pub": { "allow": ["tenant-abc.>"] },
    "sub": { "allow": ["tenant-abc.>"] }
  }
}
```

This ensures n8n can only publish/subscribe to subjects prefixed with their tenant ID.

## Configuration

### Environment Variables

```bash
# Default messaging strategy
MESSAGING_STRATEGY=nats  # nats | kafka | redis-streams | memory

# NATS configuration
NATS_URL=nats://localhost:4222
NATS_TOKEN=secret
NATS_JETSTREAM_ENABLED=true

# Tenant prefix (default: true)
NATS_TENANT_PREFIX=true

# Publish filter - what events to send to NATS
MESSAGING_PUBLISH_EXCLUDE=query_index.>,search.>
MESSAGING_PUBLISH_INCLUDE=customers.>,catalog.>,sales.>

# Subscribe filter - what events to receive from external systems
MESSAGING_SUBSCRIBE_INCLUDE=customers.>,sales.>
MESSAGING_SUBSCRIBE_EXCLUDE=

# Auth callout
NATS_AUTH_JWT_SECRET=  # defaults to JWT_SECRET
NATS_AUTH_DEBUG=false

# Kafka configuration (when implemented)
KAFKA_BROKERS=localhost:9092,localhost:9093
KAFKA_CLIENT_ID=open-mercato

# Debug logging
MESSAGING_DEBUG=true
```

## EventBus Enhancement

The `once()` method was added to EventBus for single-shot event listeners:

```typescript
// Listen for one event then auto-unsubscribe
const unsubscribe = eventBus.once('response.received', (payload) => {
  console.log('Got response:', payload)
})

// Optionally cancel before event fires
unsubscribe()
```

## Package Structure

```
packages/messaging/
├── src/
│   ├── index.ts              # Package exports
│   ├── types.ts              # Core interfaces
│   ├── service.ts            # MessagingService implementation
│   ├── factory.ts            # Driver factory
│   ├── bridge.ts             # EventBus bridge
│   ├── di.ts                 # DI registration
│   ├── auth-callout/
│   │   ├── index.ts          # Auth callout handler
│   │   └── handler.ts        # HTTP handler wrapper
│   ├── drivers/
│   │   ├── index.ts          # Driver exports
│   │   ├── memory/
│   │   │   └── index.ts      # In-memory driver
│   │   └── nats/
│   │       └── index.ts      # NATS driver (with tenant prefix, filters)
│   └── __tests__/
│       ├── memory.test.ts    # Memory driver tests
│       ├── service.test.ts   # Service tests
│       └── bridge.test.ts    # Bridge tests
├── package.json
├── tsconfig.json
├── build.mjs
└── jest.config.cjs
```

## Comparison with Existing Patterns

| Aspect | Search Strategies | Queue Strategies | Messaging Drivers |
|--------|-------------------|------------------|-------------------|
| Interface | `SearchStrategy` | `Queue<T>` | `MessagingDriver` |
| Strategies | tokens, vector, fulltext | local, async | N/A |
| Providers | N/A | bullmq, nats | nats, kafka*, redis-streams*, memory |
| Service | `SearchService` | N/A (direct queue) | `MessagingService` |
| Selection | Per-search configurable | Strategy: env, Provider: env/code | Per-operation configurable |
| Bidirectional | No | No | **Yes** (request/reply) |
| External systems | No | No | **Yes** |
| DI registration | `registerSearchModule()` | Inline in bootstrap | `registerMessagingModule()` |

*\* Not yet implemented*

## Usage Examples

### Basic Publish/Subscribe

```typescript
// Publish to external system
await messagingService.publish('orders.created', {
  orderId: '123',
  items: [...]
})

// Subscribe to external messages
await messagingService.subscribe('inventory.updated', async (msg) => {
  await updateLocalInventory(msg.payload)
})
```

### Request-Response

```typescript
// Request inventory check from external system
const availability = await messagingService.request<CheckRequest, CheckResponse>(
  'inventory.check',
  { sku: 'PROD-001', quantity: 10 },
  { timeout: 5000 }
)

if (availability.inStock) {
  await reserveInventory(availability.reservationId)
}
```

### Event Bridge

```typescript
// Bridge external messages to internal events
await bridge.bridgeInbound('erp.orders.*', 'sales.order.external')

// Bridge internal events to external systems
bridge.bridgeOutbound('sales.order.shipped', 'notifications.shipping')

// Two-way: external request → internal handler → external response
await bridge.bridgeRequestReply('pricing.calculate', 'catalog.price.request')
```

## Queue Package: NATS Provider

The `@open-mercato/queue` package also supports NATS JetStream as a **provider** for the async queue strategy. This allows using NATS for internal job queues as an alternative to BullMQ/Redis.

### Architecture

```
QUEUE_STRATEGY=local  → file-based (development)
QUEUE_STRATEGY=async  → distributed queue
                        ├── QUEUE_PROVIDER=bullmq (default) → BullMQ/Redis
                        └── QUEUE_PROVIDER=nats             → NATS JetStream
```

### Configuration

```bash
# Use NATS as queue provider
QUEUE_STRATEGY=async
QUEUE_PROVIDER=nats
NATS_URL=nats://localhost:4222
```

### Usage

```typescript
import { createQueue } from '@open-mercato/queue'

// BullMQ provider (default)
const bullmqQueue = createQueue<{ userId: string }>('my-queue', 'async', {
  connection: { url: 'redis://localhost:6379' }
})

// NATS provider (explicit)
const natsQueue = createQueue<{ userId: string }>('my-queue', 'async', {
  provider: 'nats',
  connection: { servers: 'nats://localhost:4222' },
  concurrency: 5,
  streamConfig: { storage: 'file' }
})

// NATS provider (via environment: QUEUE_PROVIDER=nats)
const queue = createQueue<{ userId: string }>('my-queue', 'async')

// Enqueue and process jobs (same API regardless of provider)
await queue.enqueue({ userId: '123' })
await queue.process(async (job, ctx) => {
  console.log(`Processing job ${ctx.jobId}:`, job.payload)
})
```

### NATS JetStream Features

The NATS queue provider uses JetStream with:
- **Workqueue retention**: Messages removed after acknowledgment
- **Pull consumers**: Worker fetches batches with explicit acks
- **Durable subscriptions**: Survive restarts, track position
- **Deduplication**: Prevents duplicate job processing
- **Configurable retries**: `maxDeliver` option for redelivery attempts

### Provider-Specific Options

```typescript
// NATS provider options
{
  provider: 'nats',
  connection: {
    servers: string | string[],  // Default: NATS_URL or localhost:4222
    token?: string,              // Default: NATS_TOKEN
    user?: string,
    pass?: string,
  },
  concurrency?: number,          // Default: 1
  streamConfig?: {
    storage?: 'file' | 'memory', // Default: 'file'
    replicas?: number,           // Default: 1
    maxAge?: number,             // Nanoseconds
    maxMsgs?: number,
    maxBytes?: number,
  },
  ackWait?: number,              // Milliseconds, default: 30000
  maxDeliver?: number,           // Default: 3
}
```

## Future Enhancements

1. **Kafka Driver**: Full implementation with consumer groups
2. **Redis Streams Driver**: Leverage existing Redis connection
3. **Message Replay**: Support for replaying messages from streams
4. **Dead Letter Queue**: Automatic handling of failed messages
5. **Metrics**: Integration with monitoring systems
6. **Schema Registry**: Message schema validation
7. **Kafka Queue Provider**: Add Kafka as queue provider option

---

## Changelog

### 2026-01-29
- **Multi-tenant support**: Automatic tenant prefix on publish/subscribe
  - Subjects prefixed with tenantId: `{tenantId}.{subject}`
  - Wildcard subscriptions: `*.{subject}` to catch all tenant messages
  - TenantId extraction from subject and injection into payload
- **Source header for loop prevention**: `x-source: open-mercato`
  - Prevents infinite loops when app publishes and subscribes to same subjects
  - Own messages are skipped, external messages are processed
- **Separate publish/subscribe filters**:
  - `MESSAGING_PUBLISH_INCLUDE/EXCLUDE` - control outbound events
  - `MESSAGING_SUBSCRIBE_INCLUDE/EXCLUDE` - control inbound subscriptions
  - Default: no NATS subscriptions unless explicitly included
- **NATS Auth Callout handler**: Dynamic multi-tenant authentication
  - `createAuthCalloutHandler()` - low-level handler
  - `createAuthCalloutHttpHandler()` - ready-to-use HTTP handler
  - Validates API keys and returns tenant-scoped JWT permissions

### 2026-01-28
- Initial specification and implementation
- Memory driver with full wildcard support
- NATS driver with JetStream support
- MessagingService for driver management
- EventBusBridge for internal/external bridging
- DI registration module
- Added `once()` method to EventBus
- **Queue Package**: Added NATS JetStream as async queue provider
  - Provider abstraction: `QUEUE_PROVIDER=bullmq|nats`
  - Same `Queue<T>` interface regardless of provider
  - Workqueue retention for exactly-once processing
