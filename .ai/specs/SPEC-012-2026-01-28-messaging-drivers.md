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

## Additive External Transport Architecture

The event bus uses an **additive delivery model** where local in-memory delivery is the PRIMARY path that ALWAYS executes, and external transport forwarding is a SECONDARY, optional layer.

### Problem with Loop-Back Model

The original implementation had a critical flaw:

```typescript
// PROBLEMATIC: Old behavior
async function deliver(event: string, payload: EventPayload): Promise<void> {
  if (driver) {
    await driver.publish(event, payload)  // Only publishes to driver
    return  // Local handlers miss event if driver filters it!
  }
  await deliverToLocalHandlers(event, payload)
}
```

This caused:
- Local handlers missed events when publish filters excluded them
- Reliability depended on external system availability
- Tight coupling between events and messaging packages

### Additive Delivery Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         emit(event, payload)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│   LOCAL DELIVERY        │     │   EXTERNAL FORWARD (optional)   │
│   (ALWAYS happens)      │     │   (if driver registered in DI)  │
│                         │     │                                 │
│   deliverToLocalHandlers│     │   driver.publish(event, payload)│
│   - sync/immediate      │     │   - fire-and-forget             │
│   - no external deps    │     │   - filtered by publish rules   │
└─────────────────────────┘     └─────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              EXTERNAL INBOUND (if driver + subscribe filter)    │
│                                                                  │
│   driver.subscribe('pattern.>') → deliverToLocalHandlers        │
│   - brings external events into local bus                       │
│   - filtered by subscribe rules (MESSAGING_SUBSCRIBE_INCLUDE)   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Local delivery is PRIMARY**: `deliverToLocalHandlers()` always executes first
2. **External forward is ADDITIVE**: Happens after local delivery, fire-and-forget
3. **No loop-back dependency**: Local handlers never depend on external systems
4. **Graceful degradation**: External failures don't affect local delivery

### Implementation

```typescript
// packages/events/src/bus.ts
async function deliver(event: string, payload: EventPayload): Promise<void> {
  // PRIMARY: Always deliver to local handlers first
  await deliverToLocalHandlers(event, payload)

  // SECONDARY: Additionally forward to external transport (fire-and-forget)
  forwardToExternalTransport(event, payload).catch((error) => {
    console.warn(`[events] External transport error for "${event}":`, error)
  })
}

async function forwardToExternalTransport(event: string, payload: EventPayload): Promise<void> {
  const driver = getTransportDriver()
  if (!driver || !driver.isConnected()) return

  try {
    await driver.publish(event, payload)
  } catch (error) {
    // Log but don't fail - external forward is best-effort
    console.warn(`[events] External forward failed for "${event}":`, error)
  }
}
```

### Package Decoupling via Abstract Interface

The events package does not directly depend on the messaging package. Instead:

1. **Shared interface**: `packages/shared/src/lib/transport/types.ts` defines `TransportDriver`
2. **Lazy DI resolution**: Events package resolves driver from DI at runtime
3. **Messaging self-registers**: Messaging module registers its driver via DI

```typescript
// packages/shared/src/lib/transport/types.ts
export interface TransportDriver {
  readonly id: string
  readonly name: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  isHealthy(): Promise<boolean>
  publish(subject: string, payload: unknown, options?: Record<string, unknown>): Promise<string>
  subscribe(subject: string, handler: TransportMessageHandler, options?: Record<string, unknown>): Promise<TransportSubscription>
}

export const DI_TOKENS = {
  TRANSPORT_DRIVER: 'transportDriver',
} as const
```

```typescript
// packages/events/src/bus.ts - Lazy resolution
function getTransportDriver(): TransportDriver | null {
  if (transportDriver === undefined) {
    try {
      transportDriver = opts.resolve<TransportDriver>(DI_TOKENS.TRANSPORT_DRIVER)
    } catch {
      transportDriver = null  // Not registered - no external transport
    }
  }
  return transportDriver
}
```

```typescript
// packages/messaging/src/modules/messaging/di.ts - Self-registration
export function register(container: AwilixContainer): void {
  const strategy = getMessagingStrategyFromEnv()
  if (strategy === 'memory') return  // No external transport needed

  container.register({
    [DI_TOKENS.TRANSPORT_DRIVER]: asFunction(() => {
      if (!driverInstance) {
        driverInstance = createMessagingDriverFromEnv()
        driverInstance.connect().catch(err => {
          console.warn(`[messaging] Driver connection failed: ${err?.message}`)
        })
      }
      return driverInstance as TransportDriver
    }).singleton(),
  })
}
```

### Behavior Comparison

| Scenario | Before (Loop-back) | After (Additive) |
|----------|-------------------|------------------|
| No messaging configured | Local delivery only | Local delivery only (unchanged) |
| NATS configured, event matches filter | Driver publish only, loop-back for local | Local delivery + external forward |
| NATS configured, event filtered out | Local handlers miss event! | Local delivery still works |
| NATS connection fails | Falls back to local | Local delivery unaffected |
| External event from n8n | Delivered via subscription | Delivered via subscription (unchanged) |

### Module Registration

The messaging module must be enabled in `apps/mercato/src/modules.ts`:

```typescript
export const enabledModules: ModuleEntry[] = [
  // ... other modules
  { id: 'events', from: '@open-mercato/events' },
  { id: 'messaging', from: '@open-mercato/messaging' },  // Registers TransportDriver
  // ...
]
```

After adding, run `yarn generate` to regenerate `di.generated.ts`.

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

## Inbound Consumer

The inbound consumer enables external systems (n8n, Zapier, custom integrations) to:
1. **Execute commands directly** - If the NATS subject matches a registered command ID, execute it
2. **Trigger event handlers** - Otherwise, forward to the local event bus

### Architecture

```
OUTBOUND (unchanged):
emit() → local handlers + forward via TransportDriver (with x-source header)

INBOUND (with command routing):
External System (n8n) → NATS → Inbound Consumer
                                     ↓
                        ┌────────────┴────────────┐
                        │ Is subject a command?   │
                        │ (commandRegistry.has()) │
                        └────────────┬────────────┘
                              ↓ yes       ↓ no
                    commandBus.execute()  eventBus.emit()
                              ↓               ↓
                    Command Handler     Local Handlers
```

### Command Routing

When a message subject matches a registered command ID, the inbound consumer executes the command directly instead of emitting an event. This is based on the actual command registry - no heuristics or regex patterns.

**How it works:**
1. External system publishes to NATS with subject = command ID (e.g., `customers.people.create`)
2. Inbound consumer checks `commandRegistry.has(subject)`
3. If true → execute via `commandBus.execute(subject, options)`
4. If false → emit via `eventBus.emit(subject, payload)`

**Command Message Format:**

Commands require `tenantId` and `organizationId` in **both** the outer wrapper (for auth context) and inside `input` (for command schema validation):

```json
{
  "input": {
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "displayName": "John Doe",
    "tenantId": "tenant-uuid",
    "organizationId": "org-uuid"
  },
  "tenantId": "tenant-uuid",
  "organizationId": "org-uuid"
}
```

The outer `tenantId`/`organizationId` are used to build the command runtime context (`ctx.auth`). The inner values are validated by the command's schema.

**Example - Create Customer from n8n:**
```bash
nats pub "customers.people.create" '{
  "input": {
    "email": "external@example.com",
    "firstName": "External",
    "lastName": "User",
    "displayName": "External User",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "organizationId": "660e8400-e29b-41d4-a716-446655440000"
  },
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "organizationId": "660e8400-e29b-41d4-a716-446655440000"
}' --server=nats://localhost:4222
```

**Available Commands:**
Commands are registered at startup. Common CRUD commands follow the pattern `<module>.<entity>.<action>`:
- `customers.people.create`, `customers.people.update`, `customers.people.delete`
- `customers.companies.create`, `customers.companies.update`, `customers.companies.delete`
- `customers.deals.create`, `customers.deals.update`, `customers.deals.delete`
- `sales.orders.create`, `sales.orders.update`, etc.

### Loop Prevention

The system prevents infinite loops using the `x-source` header:

```
1. n8n publishes to NATS (no x-source header)
2. Inbound consumer receives it → calls eventBus.emit()
3. eventBus forwards back to NATS (with x-source: open-mercato)
4. NATS driver receives it again → SKIPPED (has x-source header)
```

The loop prevention is handled by the NATS driver at `packages/messaging/src/drivers/nats/index.ts:182`:

```typescript
function isOwnMessage(headers?: NatsHeaders): boolean {
  if (!headers) return false
  const source = headers.get(SOURCE_HEADER)
  return source === SOURCE_VALUE  // 'open-mercato'
}

// In processSubscription():
if (isOwnMessage(msg.headers)) {
  log(`Skipping own message on ${msg.subject}`)
  continue  // Skip our own messages
}
```

### Design Decision: Why Not Use Wildcards in Event Bus?

**Question:** Can we remove the TransportDriver from event bus and handle outbound in messaging module via `eventBus.on('*')`?

**Answer: No** - The event bus does NOT support wildcard subscriptions.

```typescript
// Current implementation - exact string match only
function on(event: string, handler: SubscriberHandler): void {
  listeners.set(event, new Set())  // Map<string, Set>
}

// At emit time - direct map lookup
const handlers = listeners.get(event)  // O(1) exact match
```

**To remove driver from event bus, we'd need:**
1. Add wildcard support (`on('*')` or `on('>')`) to event bus
2. This requires O(n) pattern matching on every emit()
3. Would require changes to event bus - contradicts goal of keeping changes in messaging module

**Conclusion:** Keep current outbound approach (driver in event bus). It's cleaner and more performant than adding wildcards.

### Implementation

The inbound consumer is implemented in `packages/messaging/src/modules/messaging/inbound.ts`:

```typescript
import { createInboundConsumer, parseSubscribeFilterFromEnv } from '@open-mercato/messaging'

// Create and start inbound consumer with command routing
const consumer = createInboundConsumer(driver, eventBus, {
  debug: true,
  filter: { include: ['customers.>', 'sales.>'] },
  commandBus,   // Optional: enables command routing
  container,    // Required when commandBus is provided
})

await consumer.start()

// Later, to stop:
await consumer.stop()
```

### Automatic Startup via DI

The inbound consumer starts automatically when:
1. `MESSAGING_STRATEGY` is not `memory`
2. `MESSAGING_SUBSCRIBE_INCLUDE` is configured

The DI registrar (`packages/messaging/src/modules/messaging/di.ts`) handles this:

```typescript
// After driver connects:
connectionPromise = driverInstance.connect()
  .then(() => {
    console.log(`[messaging] Connected to ${strategy} driver`)

    // Start inbound consumer if subscribe filter is configured
    startInboundConsumerDeferred(container)
  })

// Deferred startup ensures eventBus and commandBus are registered in DI
function startInboundConsumerDeferred(container: AwilixContainer): void {
  const subscribeFilter = parseSubscribeFilterFromEnv()

  // Only start if include filter is configured
  if (!subscribeFilter?.include || subscribeFilter.include.length === 0) {
    return
  }

  // Defer to ensure all dependencies are registered
  setImmediate(async () => {
    const eventBus = container.resolve<EventBus>('eventBus')

    // Try to resolve command bus (optional - enables command routing)
    let commandBus: CommandBus | undefined
    try {
      commandBus = container.resolve<CommandBus>('commandBus')
    } catch {
      // Command bus not available - command routing will be disabled
    }

    inboundConsumer = createInboundConsumer(driverInstance, eventBus, {
      filter: subscribeFilter,
      commandBus,
      container: commandBus ? container : undefined,
    })
    await inboundConsumer.start()
    console.log(`[messaging] Inbound consumer started${commandBus ? ' (command routing enabled)' : ''}`)
  })
}
```

### Configuration

```bash
# Required to enable inbound consumer
MESSAGING_SUBSCRIBE_INCLUDE=customers.>,sales.>,catalog.>

# Optional: exclude specific patterns
MESSAGING_SUBSCRIBE_EXCLUDE=*.internal

# Debug logging
MESSAGING_DEBUG=true
```

### Pattern Matching

The consumer uses NATS-style wildcards:
- `*` matches exactly one token (e.g., `customers.*` matches `customers.created`)
- `>` matches one or more tokens (e.g., `customers.>` matches `customers.deal.created`)

### Verification

#### Testing Event Forwarding

1. Start NATS subscriber to monitor all events:
   ```bash
   nats sub ">" --server=nats://localhost:4222
   ```

2. Publish an external event (simulating n8n):
   ```bash
   nats pub "example.test.inbound" '{"source":"external","message":"hello"}' --server=nats://localhost:4222
   ```

3. Check app logs for:
   ```
   [messaging:inbound] Received external message: example.test.inbound
   [messaging:inbound] Forwarded to event bus: example.test.inbound
   ```

#### Testing Command Routing (Verified 2026-01-31)

1. Start the dev server and verify inbound consumer starts with command routing:
   ```
   [nats] Connected to nats://localhost:4222
   [messaging] Connected to nats driver
   [messaging:inbound] Starting inbound consumer...
   [messaging:inbound] Subscribing to patterns: customers.>, catalog.>, sales.>, example.>
   [messaging] Inbound consumer started (command routing enabled)
   ```

2. Publish a command via NATS CLI:
   ```bash
   nats pub "customers.people.create" '{
     "input": {
       "email": "from-nats@example.com",
       "firstName": "NATS",
       "lastName": "Command",
       "displayName": "NATS Command Test",
       "tenantId": "YOUR-TENANT-ID",
       "organizationId": "YOUR-ORG-ID"
     },
     "tenantId": "YOUR-TENANT-ID",
     "organizationId": "YOUR-ORG-ID"
   }' --server=nats://localhost:4222
   ```

3. Verify in app logs:
   ```
   [messaging:inbound] Received external message: customers.people.create
   [messaging:inbound] Executing as command: customers.people.create
   [messaging:inbound] Command executed successfully: customers.people.create
   ```

4. Verify the customer was created via API or database.

#### Loop Prevention Verification

When a command executes successfully, it emits side-effect events that are forwarded to NATS:
```
[events] Forwarding to external transport: "query_index.vectorize_one"
[events] Forwarding to external transport: "search.index_record"
[events] Forwarding to external transport: "query_index.upsert_one"
```

These events have `x-source: open-mercato` header, so if they match the subscribe pattern, the inbound consumer will skip them (preventing infinite loops).

### Files

| File | Description |
|------|-------------|
| `packages/messaging/src/modules/messaging/inbound.ts` | Inbound consumer implementation |
| `packages/messaging/src/modules/messaging/di.ts` | DI registrar with automatic startup |
| `packages/messaging/src/index.ts` | Package exports |

### API Reference

```typescript
// Create an inbound consumer
function createInboundConsumer(
  driver: MessagingDriver,
  eventBus: EventBus,
  options?: InboundConsumerOptions
): InboundConsumer

interface InboundConsumerOptions {
  /** Enable debug logging */
  debug?: boolean
  /** Subscribe filter patterns */
  filter?: PublishFilter
  /** Command bus for executing commands (enables command routing) */
  commandBus?: CommandBus
  /** DI container for building command runtime context (required when commandBus is provided) */
  container?: AwilixContainer
}

interface InboundConsumer {
  start(): Promise<void>
  stop(): Promise<void>
  isActive(): boolean
}

// Parse filter from environment
function parseSubscribeFilterFromEnv(): PublishFilter | undefined
```

When `commandBus` and `container` are provided, the inbound consumer will:
1. Check if incoming message subject matches a registered command (`commandRegistry.has(subject)`)
2. If yes: execute via `commandBus.execute(subject, { input, ctx, metadata })`
3. If no: forward to `eventBus.emit(subject, payload)`

## Package Structure

```
packages/messaging/
├── src/
│   ├── index.ts              # Package exports
│   ├── types.ts              # Core interfaces
│   ├── service.ts            # MessagingService implementation
│   ├── factory.ts            # Driver factory
│   ├── bridge.ts             # EventBus bridge
│   ├── di.ts                 # DI registration (legacy)
│   ├── modules/
│   │   └── messaging/
│   │       ├── index.ts      # Module metadata
│   │       ├── di.ts         # DI registrar (registers TransportDriver + inbound consumer)
│   │       └── inbound.ts    # Inbound consumer (NATS → event bus)
│   ├── auth-callout/
│   │   ├── index.ts          # Auth callout handler
│   │   └── handler.ts        # HTTP handler wrapper
│   ├── drivers/
│   │   ├── index.ts          # Driver exports
│   │   ├── memory/
│   │   │   └── index.ts      # In-memory driver
│   │   └── nats/
│   │       └── index.ts      # NATS driver (with x-source header for loop prevention)
│   └── __tests__/
│       ├── memory.test.ts    # Memory driver tests
│       ├── service.test.ts   # Service tests
│       └── bridge.test.ts    # Bridge tests
├── package.json
├── tsconfig.json
├── build.mjs
└── jest.config.cjs

packages/shared/
└── src/
    └── lib/
        └── transport/
            ├── index.ts      # Exports TransportDriver, DI_TOKENS
            └── types.ts      # Abstract TransportDriver interface

packages/events/
└── src/
    ├── bus.ts               # EventBus with additive delivery
    └── types.ts             # CreateBusOptions (no driver param)
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

## Verification Checklist

### Infrastructure Setup

- [ ] NATS server running (`docker compose up -d nats`)
- [ ] Environment variables configured in both `.env` and `apps/mercato/.env`:
  ```bash
  MESSAGING_STRATEGY=nats
  NATS_URL=nats://localhost:4222
  NATS_JETSTREAM_ENABLED=true
  MESSAGING_DEBUG=true
  ```

### Build & Generate

- [ ] Packages built: `yarn build:packages`
- [ ] DI registrars generated: `yarn generate`
- [ ] Messaging module enabled in `apps/mercato/src/modules.ts`:
  ```typescript
  { id: 'messaging', from: '@open-mercato/messaging' },
  ```

### Runtime Verification

- [ ] App logs show NATS connection:
  ```
  [nats] Connecting...
  [nats] Connected to nats://localhost:4222
  [messaging] Connected to nats driver
  ```

- [ ] Transport driver resolves from DI:
  ```
  [events] Transport driver resolved: nats
  ```

- [ ] Events forwarded to NATS on create/update/delete:
  ```
  [events] Forwarding to external transport: "customers.person.created"
  [nats] Publishing to customers.person.created
  ```

### NATS CLI Verification

```bash
# Subscribe to all events (run in separate terminal)
nats sub ">"

# Or via Docker if nats CLI not installed locally
docker exec -it nats nats sub ">"
```

When creating a customer/product/order, you should see the event published to NATS.

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| TransportDriver interface | ✅ Complete | `@open-mercato/shared/lib/transport` |
| NATS driver | ✅ Complete | With x-source header for loop prevention |
| Memory driver | ✅ Complete | For testing |
| Messaging module DI | ✅ Complete | Self-registers in DI |
| Event bus additive delivery | ✅ Complete | Local first, external forward |
| Outbound publishing | ✅ Complete | Events → NATS (with x-source header) |
| Inbound consumer | ✅ Complete | NATS → Events (via messaging module) |
| Subscribe filters | ✅ Complete | MESSAGING_SUBSCRIBE_INCLUDE/EXCLUDE |
| Tenant prefix | ❌ Removed | Simplified for initial implementation |
| Publish filters | ❌ Removed | Simplified for initial implementation |

## Known Issues

1. **Next.js dev mode hot reloading**: Multiple event bus instances may be created on hot reload, each resolving the transport driver separately. This is expected in dev mode and doesn't affect production.

2. **Async driver connection**: The NATS driver connects asynchronously in the DI registrar. First few events after startup may fail `isConnected()` check until connection completes.

3. **Inbound consumer uses setImmediate**: The inbound consumer starts via `setImmediate()` to ensure the event bus is registered in DI. This means there's a brief window after driver connection where inbound events might be missed.

## Next Steps

### Phase 1: Verify Outbound Publishing (Current)

1. Start NATS subscriber: `nats sub ">"`
2. Create a record via API or MCP
3. Confirm event appears in NATS

### Phase 2: Inbound Consumer ✅ Implemented

The inbound consumer enables external events from NATS (e.g., from n8n, Zapier) to flow into the local event bus.

See [Inbound Consumer](#inbound-consumer) section for details.

### Phase 3: Re-add Filters (Optional)

Once basic flow is verified, re-add filtering:

1. Publish filters: Control which events go to NATS
2. Subscribe filters: Control which external events come in
3. Tenant prefix: Multi-tenant isolation

### Phase 4: Production Hardening

1. Connection retry with backoff
2. Health check endpoint
3. Metrics/observability
4. Dead letter queue for failed deliveries
5. Message schema validation

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

### 2026-01-31
- **Command Routing in Inbound Consumer**: External systems can now execute commands directly via NATS
  - If message subject matches a registered command ID, execute via `commandBus.execute()`
  - Uses `commandRegistry.has(subject)` - no heuristics or regex patterns
  - Falls back to `eventBus.emit()` for non-command subjects
  - Message format: `{ input: {...}, tenantId: "...", organizationId: "..." }`
  - Example: `nats pub "customers.people.create" '{"input": {...}, "tenantId": "..."}'`
- **Implemented Inbound Consumer**: External events from NATS now flow into local event bus
  - Created `packages/messaging/src/modules/messaging/inbound.ts`
  - Consumer subscribes to patterns from `MESSAGING_SUBSCRIBE_INCLUDE`
  - Forwards external messages to `eventBus.emit()`
  - Loop prevention via existing `x-source` header (NATS driver skips own messages)
- **Automatic inbound startup via DI**: Inbound consumer starts automatically when:
  - `MESSAGING_STRATEGY` is not `memory`
  - `MESSAGING_SUBSCRIBE_INCLUDE` is configured
  - Uses `setImmediate()` to defer until event bus and command bus are registered in DI
  - Logs "(command routing enabled)" when commandBus is available
- **Graceful shutdown**: `disconnect()` now stops inbound consumer before disconnecting driver
- **Exported inbound types**: `createInboundConsumer`, `parseSubscribeFilterFromEnv`, `InboundConsumer`, `InboundConsumerOptions`
- **Design decision documented**: Why wildcards in event bus won't work (O(n) pattern matching on every emit)
- **Added verification checklist and next steps**: Documentation for testing and future phases
- **Added current status table**: Track implementation progress

### 2026-01-30
- **Additive External Transport Architecture**: Refactored event bus delivery model
  - Local in-memory delivery is now PRIMARY and ALWAYS executes
  - External transport forwarding is SECONDARY and fire-and-forget
  - Local handlers no longer miss events when publish filters exclude them
  - External system failures don't affect local delivery
- **Package decoupling via abstract interface**:
  - Created `TransportDriver` interface in `@open-mercato/shared/lib/transport`
  - Events package resolves driver lazily from DI (no direct messaging dependency)
  - Messaging package self-registers via module DI registrar
- **Messaging module for auto-discovery**:
  - Created `packages/messaging/src/modules/messaging/` with `index.ts` and `di.ts`
  - Module registers `transportDriver` in DI container when strategy != 'memory'
  - Must be enabled in `apps/mercato/src/modules.ts`
- **Removed driver from CreateBusOptions**: Event bus no longer accepts driver parameter
- **Bootstrap cleanup**: Removed direct messaging imports from `packages/core/src/bootstrap.ts`

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
