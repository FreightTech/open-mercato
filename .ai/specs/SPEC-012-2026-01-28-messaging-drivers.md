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

The NATS driver provides built-in multi-tenant isolation by automatically prefixing NATS subjects with tenant IDs extracted from event payloads.

### Automatic Tenant Prefix

**Implementation:** `packages/messaging/src/drivers/nats/index.ts`

The NATS driver automatically prefixes ALL published subjects with the tenant ID:

1. **Tenant ID Extraction**: Extracts `tenantId` or `tenant_id` from the payload
   ```typescript
   function extractTenantId(payload: unknown): string | null {
     if (typeof payload === 'object' && payload !== null) {
       const obj = payload as Record<string, unknown>
       return obj.tenantId || obj.tenant_id || null
     }
     return null
   }
   ```

2. **Subject Prefixing**: Automatically applies tenant prefix during publish
   ```typescript
   async publish(subject: string, payload: unknown) {
     const tenantId = extractTenantId(payload)
     const natsSubject = tenantId ? `${tenantId}.${subject}` : subject
     // Publish to NATS with prefixed subject
   }
   ```

3. **Examples**:
   - With tenant: `{ tenantId: "acme-corp" }` + `"customers.people.created"` → `"acme-corp.customers.people.created"`
   - Without tenant: `"system.startup"` → `"system.startup"` (unprefixed)

**Key Points:**
- ✅ Automatic and transparent (no code changes required)
- ✅ Supports both `tenantId` (modern) and `tenant_id` (legacy) fields
- ✅ Events without tenant ID remain unprefixed (backward compatible)
- ✅ Complete tenant isolation at NATS level

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

**Example - Create Customer from n8n (Async Consumer with Inbound Prefix):**
```bash
# For async consumer (JetStream): Use inbound. prefix
nats pub "inbound.customers.people.create" '{
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

**Note:** The `inbound.` prefix is required for the async inbound consumer (JetStream-based). The consumer automatically strips this prefix before routing, so commands are executed with the original subject (`customers.people.create`).

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

### Inbound Event Validation

Inbound events from external systems are validated against the declared events registry before being forwarded to the event bus. This ensures only known, declared events can trigger internal handlers.

**How it works:**

1. External system publishes to NATS (e.g., `inbound.customers.people.created`)
2. Inbound consumer receives and routes the message
3. If subject matches a registered command → execute command (no event validation)
4. If subject is NOT a command → check `isEventDeclared(subject)`
   - **Declared** → forward to `eventBus.emit(subject, payload)`
   - **Undeclared** → reject with error, log warning

**Validation Flow:**

```
External System → NATS → Inbound Consumer
                              ↓
                  ┌───────────┴───────────┐
                  │ Is subject a command? │
                  │ commandRegistry.has() │
                  └───────────┬───────────┘
                        ↓ yes       ↓ no
              commandBus.execute()  ┌──────────────────┐
                                    │ isEventDeclared? │
                                    └────────┬─────────┘
                                       ↓ yes     ↓ no
                              eventBus.emit()  REJECT
                                               ↓
                              Log error + return failure
```

**Error Message Format:**

```
[messaging:inbound] Undeclared inbound event rejected: "foo.bar.baz".
The event must be declared in a module's events.ts file to be processed.
```

**Why Validation Matters:**

1. **Security**: Prevents external systems from triggering arbitrary internal handlers
2. **Discoverability**: Forces explicit declaration of events modules can receive
3. **Debugging**: Clear error messages when external integration is misconfigured
4. **Type Safety**: Declared events have known payload structures

**Declaring Events:**

Events must be declared in a module's `events.ts` file:

```typescript
// packages/core/src/modules/customers/events.ts
import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  { id: 'customers.people.created', label: 'Customer Created', category: 'crud' },
  { id: 'customers.people.updated', label: 'Customer Updated', category: 'crud' },
  // ... more events
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'customers',
  events,
})

export default eventsConfig
```

After adding events, run `yarn generate` to update `events.generated.ts`.

**Checking Declared Events:**

```bash
# List all declared events via API
curl http://localhost:3000/api/events | jq '.data[].id'

# Or check the generated file
cat apps/mercato/.mercato/generated/events.generated.ts
```

**Note:** Command routing is NOT affected by event validation. Commands are validated against the command registry (`commandRegistry.has()`), which is separate from the event declaration system.

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

1. Start the dev server and verify async inbound consumer starts with command routing:
   ```
   [nats] Connected to nats://localhost:4222
   [messaging] Connected to nats driver
   [messaging:async-inbound] Starting async inbound consumer with 1 workers...
   [messaging:async-inbound] Stream INBOUND_COMMANDS exists with 0 messages
   [messaging:async-inbound] Started with 1 worker(s)
   [messaging] Async inbound consumer started (command routing enabled)
   ```

2. Publish a command via NATS CLI (with `inbound.` prefix):
   ```bash
   nats pub "inbound.customers.people.create" '{
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
   [messaging:async-inbound] Worker 0: Processing message: customers.people.create (seq: 1)
   [messaging:inbound] Executing as command: customers.people.create
   [messaging:inbound] Command executed successfully: customers.people.create
   [messaging:async-inbound] Worker 0: Message processed successfully: customers.people.create
   ```

4. Verify the customer was created via API or database.

5. Check stream status to confirm message was processed:
   ```bash
   nats stream info INBOUND_COMMANDS
   # Messages should show 0 after processing (workqueue retention)
   ```

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

## Async Inbound Consumer (JetStream)

The async inbound consumer uses NATS JetStream's pull consumer for concurrent message processing with configurable worker pools, graceful shutdown, and built-in back-pressure handling.

### Architecture

```
                    NATS JetStream Stream
                    (INBOUND_COMMANDS)
                    subjects: ['inbound.>']
                           │
                           │ Pull (batch fetch)
                           ▼
┌──────────────────────────────────────────────────────┐
│              AsyncInboundConsumer                     │
│                                                       │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│   │Worker 1 │  │Worker 2 │  │Worker N │  (pool)     │
│   │ fetch   │  │ fetch   │  │ fetch   │             │
│   │ process │  │ process │  │ process │             │
│   │ ack/nack│  │ ack/nack│  │ ack/nack│             │
│   └─────────┘  └─────────┘  └─────────┘             │
│                      │                               │
│       Strip prefix: inbound.customers.people.create  │
│                   → customers.people.create          │
│                      │                               │
│                      ▼                               │
│   ┌─────────────────────────────────────────────┐   │
│   │ Message Router                               │   │
│   │  - commandRegistry.has() → commandBus.exec  │   │
│   │  - else → eventBus.emit                     │   │
│   └─────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Key Features

- **JetStream Durability**: Messages persist in JetStream stream until acknowledged
- **Pull-based Consumption**: Workers fetch messages when ready (built-in back-pressure)
- **Concurrent Processing**: Configurable worker pool for parallel message handling
- **Explicit Ack/Nack**: Messages are explicitly acknowledged or requeued
- **Automatic Retries**: Configurable retry with exponential backoff
- **Graceful Shutdown**: Waits for in-flight messages before stopping
- **Inbound Prefix**: Uses `inbound.>` subject pattern to namespace inbound events and prevent conflicts with NATS internal subjects

### Inbound Prefix Mechanism

To avoid conflicts with NATS internal subjects (like `$JS.>`), the async consumer uses an `inbound.` prefix for all captured messages:

1. **Stream subscribes to**: `inbound.>` (captures all messages prefixed with `inbound.`)
2. **External systems publish to**: `inbound.customers.people.create` (with prefix)
3. **Consumer strips prefix**: `inbound.customers.people.create` → `customers.people.create`
4. **Routing uses original subject**: `commandRegistry.has('customers.people.create')`

**Helper Functions:**

```typescript
import { INBOUND_PREFIX, toInboundSubject, fromInboundSubject } from '@open-mercato/messaging'

// Add prefix for publishing
const subject = toInboundSubject('customers.people.create')
// → 'inbound.customers.people.create'

// Strip prefix during processing
const original = fromInboundSubject('inbound.customers.people.create')
// → 'customers.people.create'

// Constant for the prefix
console.log(INBOUND_PREFIX) // → 'inbound.'
```

**Why the prefix is needed:**

Using a wildcard like `>` or `*.>` as a stream subject causes conflicts with NATS JetStream's internal subjects (`$JS.>`). The `inbound.` prefix provides a clean namespace that doesn't overlap with system subjects.

### Configuration

```bash
# Number of concurrent workers (default: 1)
MESSAGING_INBOUND_CONCURRENCY=5

# Ack timeout before redelivery (default: 30000ms)
MESSAGING_INBOUND_ACK_WAIT_MS=30000

# Max retry attempts before message is terminated (default: 3)
MESSAGING_INBOUND_MAX_RETRIES=3

# Shutdown drain timeout (default: 10000ms)
MESSAGING_INBOUND_DRAIN_TIMEOUT_MS=10000

# Enable debug logging
MESSAGING_DEBUG=true
```

**Note:** `MESSAGING_SUBSCRIBE_INCLUDE` is no longer required for the async inbound consumer. The consumer automatically listens to all `inbound.>` events.

### JetStream Stream Configuration

The async consumer automatically creates/updates a JetStream stream:

```typescript
const STREAM_CONFIG = {
  name: 'INBOUND_COMMANDS',
  subjects: ['inbound.>'],  // Captures all inbound-prefixed messages
  retention: RetentionPolicy.Workqueue, // Remove after ack
  storage: StorageType.File,
  max_age: nanos(24 * 60 * 60 * 1000), // 24 hours
}

const CONSUMER_CONFIG = {
  durable_name: 'async-processor',
  ack_policy: AckPolicy.Explicit,
  max_ack_pending: concurrency * 10,
  ack_wait: nanos(ackWaitMs),
  max_deliver: maxRetries + 1,
}
```

### Message Flow

1. External system publishes to NATS with **inbound prefix** (e.g., `inbound.customers.people.create`)
2. Message is stored in JetStream stream `INBOUND_COMMANDS`
3. Worker pulls message from stream
4. **Prefix is stripped**: `inbound.customers.people.create` → `customers.people.create`
5. Router checks: `commandRegistry.has('customers.people.create')`?
   - **Yes** → `commandBus.execute('customers.people.create', options)`
   - **No** → `eventBus.emit('customers.people.create', payload)`
6. On success: `msg.ack()` - removed from stream
7. On failure: `msg.nak()` or `msg.term()` based on retry count

**No Feedback Loop:** The stripped subject (e.g., `customers.people.create`) doesn't match the stream's `inbound.>` pattern, so events emitted during processing won't be re-captured by the inbound consumer.

### Graceful Shutdown

```typescript
async function stop(): Promise<void> {
  shouldStop = true

  // Wait for in-flight processing (with timeout)
  const deadline = Date.now() + drainTimeoutMs
  while (hasActiveWorkers() && Date.now() < deadline) {
    await sleep(100)
  }

  // Unacked messages remain in JetStream for redelivery
}
```

### API Reference

```typescript
// Inbound prefix constant and helpers
export const INBOUND_PREFIX = 'inbound.'

/** Add the inbound prefix to a subject */
function toInboundSubject(subject: string): string
// toInboundSubject('customers.people.create') → 'inbound.customers.people.create'

/** Strip the inbound prefix from a subject (if present) */
function fromInboundSubject(subject: string): string
// fromInboundSubject('inbound.customers.people.create') → 'customers.people.create'

// Create an async inbound consumer
function createAsyncInboundConsumer(
  driver: NatsDriverExtended,
  eventBus: EventBus,
  options?: AsyncInboundConsumerOptions
): AsyncInboundConsumer

interface AsyncInboundConsumerOptions {
  /** Number of concurrent workers (default: 1) */
  concurrency?: number
  /** Ack timeout in ms (default: 30000) */
  ackWaitMs?: number
  /** Max retry attempts (default: 3) */
  maxRetries?: number
  /** Shutdown drain timeout in ms (default: 10000) */
  drainTimeoutMs?: number
  /** Enable debug logging */
  debug?: boolean
  /** Subscribe filter patterns (exclude patterns only - consumer listens to all inbound.*) */
  filter?: PublishFilter
  /** Command bus for command routing */
  commandBus?: CommandBus
  /** DI container for command context */
  container?: AwilixContainer
}

interface AsyncInboundConsumer {
  start(): Promise<void>
  stop(): Promise<void>
  isActive(): boolean
  getStats(): InboundStats
}

interface InboundStats {
  active: boolean
  workerCount: number
  workers: WorkerState[]
  totalProcessed: number
  totalFailed: number
  inFlight: number
  startedAt?: Date
  jetstream?: {
    stream: string
    consumer: string
    numPending: number
    numWaiting: number
    numAckPending: number
  }
}
```

### Usage Example

```typescript
import { createAsyncInboundConsumer, toInboundSubject, INBOUND_PREFIX } from '@open-mercato/messaging'

// Create and start the consumer
const consumer = createAsyncInboundConsumer(natsDriver, eventBus, {
  concurrency: 5,
  commandBus,
  container,
})

await consumer.start()

// Check stats
const stats = consumer.getStats()
console.log(`Processed: ${stats.totalProcessed}, In-flight: ${stats.inFlight}`)

// Graceful shutdown
await consumer.stop()
```

### Publishing Commands via NATS CLI

External systems must use the `inbound.` prefix when publishing:

```bash
# Create a customer via NATS (note the inbound. prefix)
nats pub "inbound.customers.people.create" '{
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

# Bulk create 100 customers
for i in {1..100}; do
  nats pub "inbound.customers.people.create" "{
    \"input\": {
      \"email\": \"customer-${i}@example.com\",
      \"firstName\": \"Customer\",
      \"lastName\": \"${i}\",
      \"displayName\": \"Customer ${i}\",
      \"tenantId\": \"YOUR-TENANT-ID\",
      \"organizationId\": \"YOUR-ORG-ID\"
    },
    \"tenantId\": \"YOUR-TENANT-ID\",
    \"organizationId\": \"YOUR-ORG-ID\"
  }" --server=nats://localhost:4222
done
```

### Verify Stream Status

```bash
# Check stream info
nats stream info INBOUND_COMMANDS

# Should show:
# State:
#   Messages: 0 (after all processed)
#   Consumer Count: 1

# Check consumer info
nats consumer info INBOUND_COMMANDS async-processor

# Should show:
#   Num Pending: 0 (after all processed)
#   Num Ack Pending: 0
```

### Files

| File | Description |
|------|-------------|
| `packages/messaging/src/modules/messaging/async-inbound.ts` | Async inbound consumer implementation |
| `packages/messaging/src/modules/messaging/inbound-types.ts` | Type definitions for async consumer |
| `packages/messaging/src/modules/messaging/inbound.ts` | Shared routing logic and sync consumer |
| `packages/messaging/src/modules/messaging/di.ts` | DI registrar (auto-starts async consumer) |

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
│   │       ├── di.ts         # DI registrar (registers TransportDriver + async inbound consumer)
│   │       ├── inbound.ts    # Sync inbound consumer + shared routing logic
│   │       ├── async-inbound.ts  # Async JetStream-based inbound consumer
│   │       └── inbound-types.ts  # Type definitions for async consumer
│   ├── auth-callout/
│   │   ├── index.ts          # Auth callout handler
│   │   └── handler.ts        # HTTP handler wrapper
│   ├── drivers/
│   │   ├── index.ts          # Driver exports
│   │   ├── memory/
│   │   │   └── index.ts      # In-memory driver
│   │   └── nats/
│   │       ├── index.ts              # NATS messaging driver (with x-source header for loop prevention)
│   │       ├── queue-driver.ts       # NATS JetStream queue driver (QueueDriver interface)
│   │       ├── cache-driver.ts       # NATS KV cache driver (CacheDriver interface)
│   │       ├── object-store-driver.ts # NATS Object Store storage driver (StorageDriver interface)
│   │       └── __tests__/
│   │           └── object-store-driver.test.ts  # Unit tests (16 tests)
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
        ├── transport/
        │   ├── index.ts      # Exports TransportDriver, DI_TOKENS
        │   └── types.ts      # Abstract TransportDriver interface
        └── drivers/
            ├── index.ts      # Exports QueueDriver, CacheDriver, StorageDriver, DI_TOKENS
            └── types.ts      # QueueDriver, CacheDriver, StorageDriver interfaces

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
QUEUE_STRATEGY=local   → file-based (development)
QUEUE_STRATEGY=async   → distributed queue
                         ├── QUEUE_PROVIDER=bullmq (default) → BullMQ/Redis
                         └── QUEUE_PROVIDER=nats             → NATS JetStream
QUEUE_STRATEGY=custom  → DI-injected driver (see Custom Drivers section)
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

## Custom Queue, Cache & Storage Drivers (DI-Injected)

The messaging module provides **QueueDriver**, **CacheDriver**, and **StorageDriver** implementations that can be injected via DI when `QUEUE_STRATEGY=custom`, `CACHE_STRATEGY=custom`, or when NATS is enabled for file storage.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Application Bootstrap                                │
│                                                                          │
│  setQueueDIResolver(container.resolve)                                  │
│  setCacheDIResolver(container.resolve)                                  │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     createQueue('name', 'custom')                        │
│                     createCacheService({ strategy: 'custom' })           │
│                              │                                           │
│                              ▼                                           │
│              diResolver(DI_TOKENS.QUEUE_DRIVER)                         │
│              diResolver(DI_TOKENS.CACHE_DRIVER)                         │
│                              │                                           │
│                              ▼                                           │
│              ┌───────────────────────────────────┐                      │
│              │   Messaging Module DI Registration │                      │
│              │   (when MESSAGING_STRATEGY=nats)   │                      │
│              │                                    │                      │
│              │   QUEUE_DRIVER   → createNatsQueueDriver()               │
│              │   CACHE_DRIVER   → createNatsCacheDriver()              │
│              │   STORAGE_DRIVER → createNatsObjectStoreDriver()        │
│              └───────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Driver Interfaces

Defined in `packages/shared/src/lib/drivers/types.ts`:

```typescript
export interface QueueDriver {
  readonly id: string
  readonly name: string
  createQueue<T = unknown>(name: string, options?: QueueDriverOptions): QueueInterface<T>
  isAvailable?(): Promise<boolean> | boolean
}

export interface CacheDriver {
  readonly id: string
  readonly name: string
  createStrategy(options?: CacheDriverOptions): CacheStrategyInterface
  isAvailable?(): Promise<boolean> | boolean
}

export interface StorageDriver {
  readonly id: string
  readonly name: string
  writeFile(bucketKey: string, objectName: string, data: Buffer, metadata?: Record<string, string>): Promise<void>
  readFile(bucketKey: string, objectName: string): Promise<Buffer>
  deleteFile(bucketKey: string, objectName: string): Promise<void>
  fileExists(bucketKey: string, objectName: string): Promise<boolean>
  isAvailable?(): Promise<boolean> | boolean
}

export const DI_TOKENS = {
  QUEUE_DRIVER: 'queueDriver',
  CACHE_DRIVER: 'cacheDriver',
  STORAGE_DRIVER: 'storageDriver',
} as const
```

### Configuration

```bash
# Enable NATS messaging
MESSAGING_STRATEGY=nats
NATS_URL=nats://localhost:4222

# Use NATS for queue (via DI-injected driver)
QUEUE_STRATEGY=custom

# Use NATS for cache (via DI-injected driver)
CACHE_STRATEGY=custom
```

### NATS Queue Driver

Uses JetStream for distributed job queues:
- **File**: `packages/messaging/src/drivers/nats/queue-driver.ts`
- **ID**: `nats`
- **Name**: `NATS JetStream`
- Manages own NATS connection with shared state
- Creates streams with workqueue retention
- Supports configurable concurrency, ack wait, max deliveries

### NATS Cache Driver

Uses NATS KV for distributed caching:
- **File**: `packages/messaging/src/drivers/nats/cache-driver.ts`
- **ID**: `nats`
- **Name**: `NATS KV`
- Manages own NATS connection with shared state
- Supports TTL, tags, pattern-based key listing
- Base64url encoding for keys to handle special characters

### NATS Object Store Storage Driver

Uses NATS Object Store for distributed file/blob storage:
- **File**: `packages/messaging/src/drivers/nats/object-store-driver.ts`
- **Tests**: `packages/messaging/src/drivers/nats/__tests__/object-store-driver.test.ts`
- **ID**: `nats`
- **Name**: `NATS Object Store`
- Manages own NATS connection (shared state, or accepts external connection via `connection` option)
- Bucket cache (`Map<string, ObjectStore>`) avoids re-opening the same bucket on every call
- Bucket naming: `{prefix}-{bucketKey}` (default prefix: `attachments`)
- Uses NATS v2 Object Store API: `nc.jetstream().views.os(name)`
- `putBlob()` for writes, `getBlob()` → collect into Buffer for reads
- `delete()` for deletes, `info()` for existence checks (returns false for deleted objects)
- Debug logging with `[nats:objstore]` prefix
- No additional npm dependencies — `nats: ^2.0.0` already includes Object Store

#### StorageDriver Interface

The `StorageDriver` interface uses a **bucket + object key** model suitable for object stores:

```typescript
import type { StorageDriver } from '@open-mercato/shared/lib/drivers'

// Write a file
await driver.writeFile('invoices', 'inv-2026-001.pdf', pdfBuffer, {
  contentType: 'application/pdf',
  uploadedBy: 'user-123',
})

// Read a file
const data = await driver.readFile('invoices', 'inv-2026-001.pdf')

// Check existence
const exists = await driver.fileExists('invoices', 'inv-2026-001.pdf')

// Delete a file
await driver.deleteFile('invoices', 'inv-2026-001.pdf')
```

#### Configuration Options

```typescript
interface NatsObjectStoreDriverOptions {
  servers?: string | string[]     // Default: NATS_URL env or localhost:4222
  token?: string                  // Default: NATS_TOKEN env
  bucketPrefix?: string           // Default: 'attachments'
  debug?: boolean                 // Default: MESSAGING_DEBUG env
  connection?: NatsConnection     // External connection (skips internal management)
}
```

### DI Registration

The messaging module registers drivers when NATS is enabled (`packages/messaging/src/modules/messaging/di.ts`):

```typescript
if (strategy === 'nats') {
  container.register({
    [DI_TOKENS.QUEUE_DRIVER]: asFunction(() =>
      createNatsQueueDriver({ debug })
    ).singleton(),
  })

  container.register({
    [DI_TOKENS.CACHE_DRIVER]: asFunction(() =>
      createNatsCacheDriver({ debug })
    ).singleton(),
  })

  container.register({
    [DI_TOKENS.STORAGE_DRIVER]: asFunction(() =>
      createNatsObjectStoreDriver({ debug })
    ).singleton(),
  })
}
```

### Bootstrap Integration

DI resolvers are wired up in `packages/core/src/bootstrap.ts`:

```typescript
import { setQueueDIResolver } from '@open-mercato/queue'
import { setCacheDIResolver } from '@open-mercato/cache'

export async function bootstrap(container: AwilixContainer) {
  const resolver = <T>(token: string) => container.resolve<T>(token)
  setQueueDIResolver(resolver)
  setCacheDIResolver(resolver)
  // ...
}
```

### Usage

When both messaging and custom strategies are enabled:

```typescript
import { createQueue } from '@open-mercato/queue'
import { createCacheService } from '@open-mercato/cache'

// Queue uses NATS JetStream under the hood
const queue = createQueue<JobPayload>('my-queue', 'custom')
await queue.enqueue({ data: 'value' })
await queue.process(async (job) => { /* ... */ })

// Cache uses NATS KV under the hood
const cache = createCacheService({ strategy: 'custom' })
await cache.set('key', 'value', { ttl: 3600, tags: ['user:123'] })
await cache.get('key')
await cache.invalidateByTags(['user:123'])

// Storage uses NATS Object Store under the hood
// Resolve from DI:
const storageDriver = container.resolve<StorageDriver>(DI_TOKENS.STORAGE_DRIVER)
await storageDriver.writeFile('invoices', 'inv-001.pdf', pdfBuffer)
const data = await storageDriver.readFile('invoices', 'inv-001.pdf')
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
| Messaging module DI | ✅ Complete | Self-registers in DI, eager driver resolution |
| Event bus additive delivery | ✅ Complete | Local first, external forward |
| Outbound publishing | ✅ Complete | Events → NATS (with x-source header) |
| Inbound consumer (sync) | ✅ Complete | Legacy sync consumer, still available |
| Async inbound consumer | ✅ Complete | JetStream-based with worker pool + inbound prefix |
| Inbound prefix helpers | ✅ Complete | `INBOUND_PREFIX`, `toInboundSubject()`, `fromInboundSubject()` |
| Inbound event validation | ✅ Complete | Rejects undeclared events via `isEventDeclared()` |
| Subscribe filters | ⚠️ Simplified | Async consumer listens to all `inbound.>` events |
| Tenant prefix | ❌ Removed | Simplified for initial implementation |
| Publish filters | ❌ Removed | Simplified for initial implementation |
| Custom Queue Driver | ✅ Complete | `QUEUE_STRATEGY=custom` → NATS JetStream |
| Custom Cache Driver | ✅ Complete | `CACHE_STRATEGY=custom` → NATS KV |
| Custom Storage Driver | ✅ Complete | `STORAGE_DRIVER` → NATS Object Store |

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

### 2026-02-14 (NATS Object Store Storage Driver)
- **StorageDriver interface**: Added to `@open-mercato/shared/lib/drivers`
  - Bucket + object key model (`writeFile`, `readFile`, `deleteFile`, `fileExists`)
  - Optional metadata on writes, `isAvailable()` health check
  - `STORAGE_DRIVER` DI token added to `DI_TOKENS`
- **NATS Object Store driver**: `packages/messaging/src/drivers/nats/object-store-driver.ts`
  - Follows cache-driver.ts patterns (shared connection, lazy bucket resolution, debug logging)
  - Bucket cache (`Map<string, ObjectStore>`) avoids re-opening buckets
  - Configurable bucket prefix (default: `attachments`)
  - Accepts optional external NATS connection
  - Uses `putBlob()`/`getBlob()`/`delete()`/`info()` from NATS v2 Object Store API
  - No new npm dependencies
- **DI registration**: Registered in messaging module DI when `MESSAGING_STRATEGY=nats`
- **Unit tests**: 16 tests covering write/read/delete/exists, metadata, bucket caching, availability
- **Files changed**:
  - New: `packages/messaging/src/drivers/nats/object-store-driver.ts`
  - New: `packages/messaging/src/drivers/nats/__tests__/object-store-driver.test.ts`
  - Modified: `packages/shared/src/lib/drivers/types.ts` (StorageDriver + DI token)
  - Modified: `packages/shared/src/lib/drivers/index.ts` (export StorageDriver)
  - Modified: `packages/messaging/src/modules/messaging/di.ts` (register storage driver)

### 2026-02-01 (Inbound Event Validation)
- **Inbound event validation against declared events registry**:
  - Events forwarded to event bus must be declared in a module's `events.ts` file
  - Uses `isEventDeclared()` from `@open-mercato/shared/modules/events`
  - Undeclared events are rejected with descriptive error message
  - Command routing is NOT affected (commands use separate registry)
- **Modified files**:
  - `packages/messaging/src/modules/messaging/inbound.ts` - Added validation in `routeMessage()`
- **Validation behavior**:
  - Inbound events: Always validated, undeclared events rejected
  - Commands: Routed via command registry (no change)
  - Outbound events: No validation (pass-through to external systems)
- **Error format**: `[messaging:inbound] Undeclared inbound event rejected: "{subject}". The event must be declared in a module's events.ts file to be processed.`

### 2026-01-31 (Inbound Prefix Mechanism)
- **Inbound prefix for subject namespacing**:
  - Stream now subscribes to `inbound.>` instead of explicit patterns
  - External systems publish to `inbound.{subject}` (e.g., `inbound.customers.people.create`)
  - Consumer strips prefix before routing: `inbound.customers.people.create` → `customers.people.create`
  - Prevents conflicts with NATS internal subjects (`$JS.>`)
  - No feedback loop: stripped subjects don't match `inbound.>` pattern
- **New helper functions exported from `@open-mercato/messaging`**:
  - `INBOUND_PREFIX` constant (`'inbound.'`)
  - `toInboundSubject(subject)` - add prefix for publishing
  - `fromInboundSubject(subject)` - strip prefix during processing
- **Removed `MESSAGING_SUBSCRIBE_INCLUDE` requirement**:
  - Async consumer listens to all `inbound.>` events automatically
  - No explicit include filter needed
  - Exclude filter still available via `filter.exclude` option
- **Fixed tenantId/organizationId in command input**:
  - These values are now merged into the command input object for schema validation
  - Both outer wrapper (`tenantId`, `organizationId`) and inner `input` object receive the values
- **DI registration improvements**:
  - Eager resolution of transport driver via `setImmediate()` to trigger connection
  - Async inbound consumer starts automatically when NATS + JetStream is enabled
- **Verified with bulk testing**: Successfully processed 100 customer creation commands via NATS

### 2026-01-31 (Async Inbound Consumer)
- **Async Inbound Consumer with JetStream**:
  - Created `packages/messaging/src/modules/messaging/async-inbound.ts`
  - Uses JetStream pull consumer for durable message processing
  - Configurable worker pool for concurrent processing
  - Explicit ack/nack with automatic retries and exponential backoff
  - Graceful shutdown with drain timeout
  - Worker state tracking and statistics via `getStats()`
- **New configuration options**:
  - `MESSAGING_INBOUND_CONCURRENCY`: Number of concurrent workers (default: 1)
  - `MESSAGING_INBOUND_ACK_WAIT_MS`: Ack timeout before redelivery (default: 30000)
  - `MESSAGING_INBOUND_MAX_RETRIES`: Max retry attempts (default: 3)
  - `MESSAGING_INBOUND_DRAIN_TIMEOUT_MS`: Shutdown drain timeout (default: 10000)
- **Type definitions**: Created `packages/messaging/src/modules/messaging/inbound-types.ts`
  - `AsyncInboundConfig`, `AsyncInboundConsumerOptions`, `AsyncInboundConsumer`
  - `InboundStats`, `WorkerState`, `QueuedMessage`, `MessageProcessingResult`
- **Refactored inbound.ts for reuse**:
  - Exported `tryExecuteCommand()`, `routeMessage()`, `shouldProcessSubject()`, `subjectMatches()`
  - Added `MessageRouterContext` and `TryExecuteCommandResult` types
- **Extended NATS driver**:
  - Added `NatsDriverExtended` interface with JetStream access methods
  - `getJetStream()`, `getJetStreamManager()`, `getConnection()`, `getStringCodec()`
- **DI registration updated**: Always uses async consumer when JetStream is enabled
- **Package exports**: All new types and functions exported from `@open-mercato/messaging`

### 2026-01-31 (Earlier)
- **Custom DI-Injected Queue & Cache Drivers**:
  - Added `QueueDriver` and `CacheDriver` interfaces in `@open-mercato/shared/lib/drivers`
  - Added `custom` strategy to queue and cache packages
  - Created `createNatsQueueDriver()` in `packages/messaging/src/drivers/nats/queue-driver.ts`
  - Created `createNatsCacheDriver()` in `packages/messaging/src/drivers/nats/cache-driver.ts`
  - Messaging module registers drivers in DI when `MESSAGING_STRATEGY=nats`
  - Bootstrap wires up `setQueueDIResolver()` and `setCacheDIResolver()`
  - Removed NATS strategies from core queue/cache packages
  - NATS code now consolidated in messaging module
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
