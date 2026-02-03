# @open-mercato/messaging

Pluggable messaging driver system for external system integration. Enables two-way communication between Open Mercato's EventBus and external messaging systems like NATS, Kafka, and Redis Streams.

## Architecture

```
@open-mercato/messaging          @open-mercato/events
┌─────────────────────┐          ┌─────────────────────┐
│  MessagingDriver    │          │     EventBus        │
│  ├── memory         │◄─────────│  (uses driver)      │
│  ├── nats           │          │                     │
│  ├── kafka (future) │          │  emit() → publish() │
│  └── redis (future) │          │  on()   → subscribe()│
└─────────────────────┘          └─────────────────────┘
```

When a driver is configured:
- `eventBus.emit('event.name', payload)` → publishes to external messaging system
- `eventBus.on('event.name', handler)` → subscribes via driver, receives from internal AND external publishers
- External systems can publish/subscribe to the same subjects natively

## Installation

The package is included in the monorepo. Add as dependency:

```json
{
  "dependencies": {
    "@open-mercato/messaging": "workspace:*"
  }
}
```

## Configuration

### Environment Variables

```bash
# Driver selection
MESSAGING_STRATEGY=nats  # nats | kafka | redis-streams | memory (default)

# NATS configuration
NATS_URL=nats://localhost:4222
NATS_TOKEN=secret  # optional
NATS_JETSTREAM_ENABLED=false  # optional, enables durable streams

# Debug logging
MESSAGING_DEBUG=true
```

### Bootstrap Integration

The messaging driver is automatically configured in `packages/core/src/bootstrap.ts`:

```typescript
import { createMessagingDriverFromEnv, getMessagingStrategyFromEnv } from '@open-mercato/messaging'

// Create driver based on MESSAGING_STRATEGY env var
const messagingStrategy = getMessagingStrategyFromEnv()
if (messagingStrategy !== 'memory') {
  const driver = createMessagingDriverFromEnv()
  await driver.connect()
}

// Pass to EventBus
const eventBus = createEventBus({
  resolve: container.resolve,
  driver: messagingDriver,
})
```

## Available Drivers

### Memory Driver (Default)

In-memory pub/sub for testing and development. No external dependencies.

```typescript
import { createMemoryDriver } from '@open-mercato/messaging'

const driver = createMemoryDriver()
```

### NATS Driver

Production-ready driver for [NATS](https://nats.io/) messaging system.

```typescript
import { createNatsDriver } from '@open-mercato/messaging'

const driver = createNatsDriver({
  servers: 'nats://localhost:4222',
  token: 'optional-auth-token',
  jetstream: { enabled: true },  // for durable streams
})

await driver.connect()
```

### Kafka Driver (Planned)

```typescript
// Not yet implemented
const driver = createMessagingDriver('kafka', {
  brokers: ['localhost:9092'],
  clientId: 'open-mercato',
})
```

### Redis Streams Driver (Planned)

```typescript
// Not yet implemented
const driver = createMessagingDriver('redis-streams', {
  url: 'redis://localhost:6379',
})
```

## Event Subjects

When connected to NATS, Open Mercato publishes events with these subject patterns:

| Pattern | Example | Description |
|---------|---------|-------------|
| `{module}.{entity}.created` | `customers.customer_deal.created` | Entity created |
| `{module}.{entity}.updated` | `catalog.catalog_product.updated` | Entity updated |
| `{module}.{entity}.deleted` | `customers.customer_person_profile.deleted` | Entity deleted |
| `search.index_record` | - | Search indexing event |
| `query_index.*` | `query_index.vectorize_one` | Query index operations |

### Example Event Payload

```json
{
  "entityType": "customers:customer_deal",
  "recordId": "a5f8f50f-2efe-4c98-89a7-661975db2b0b",
  "organizationId": "35429966-7411-4325-a9cd-e75eb7f74533",
  "tenantId": "7c2e080a-09bb-4e91-bd64-a839ea870126"
}
```

## External Integration

### Subscribing from External Systems

Any NATS client can subscribe to Open Mercato events:

```bash
# Using NATS CLI
nats sub "customers.>" --server nats://localhost:4222

# Subscribe to all events
nats sub ">" --server nats://localhost:4222
```

### Publishing to Open Mercato

External systems can publish events that Open Mercato handlers will receive:

```bash
nats pub "custom.event" '{"data":"hello"}' --server nats://localhost:4222
```

### n8n Integration

1. Install NATS nodes in n8n (e.g., `n8n-nodes-synadia`)
2. Configure NATS connection: `nats://nats:4222` (Docker) or `nats://localhost:4222`
3. Use NATS Trigger with subject patterns like `customers.>` or `>`
4. Activate workflow to receive real events

## Docker Setup

Add NATS to your docker-compose.yml:

```yaml
services:
  nats:
    image: nats:2.10-alpine
    command: -js -sd /data -m 8222 --name mercato-nats
    ports:
      - "4222:4222"   # Client connections
      - "8222:8222"   # Monitoring
    volumes:
      - nats_data:/data
    networks:
      - mercato-network

volumes:
  nats_data:
```

### Monitoring Endpoints

```bash
curl http://localhost:8222/varz    # Server info
curl http://localhost:8222/connz   # Connections
curl http://localhost:8222/subsz   # Subscriptions
curl http://localhost:8222/jsz     # JetStream status
```

## API Reference

### MessagingDriver Interface

```typescript
interface MessagingDriver {
  readonly id: string
  readonly name: string

  // Lifecycle
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  isHealthy(): Promise<boolean>

  // Messaging
  publish(subject: string, payload: unknown, options?: PublishOptions): Promise<string>
  subscribe(subject: string, handler: MessageHandler, options?: SubscribeOptions): Promise<Subscription>
  request<Req, Resp>(subject: string, payload: Req, options?: RequestOptions): Promise<Resp>
  reply<Req, Resp>(subject: string, handler: ReplyHandler<Req, Resp>, options?: SubscribeOptions): Promise<Subscription>
}
```

### Factory Functions

```typescript
// Create driver by strategy type
createMessagingDriver(strategy: 'nats' | 'kafka' | 'redis-streams' | 'memory', options?)

// Create driver from environment variables
createMessagingDriverFromEnv(): MessagingDriver

// Get strategy from environment
getMessagingStrategyFromEnv(): MessagingStrategyType
```

## Behavior Summary

| Scenario | emit() | on() |
|----------|--------|------|
| No driver (default) | In-memory delivery | In-memory subscription |
| With NATS driver | NATS publish | NATS subscribe + local handlers |

## Troubleshooting

### Connection Issues

```bash
# Check NATS is running
curl http://localhost:8222/healthz

# Check connections
curl http://localhost:8222/connz
```

### Debug Logging

Set `MESSAGING_DEBUG=true` to enable verbose logging:

```
[nats] Connecting...
[nats] Connected to nats://localhost:4222
[nats] Subscribing to customers.customer_deal.created (id: nats-sub-1)
```

### Multiple Subscriptions in Dev

Seeing duplicate subscriptions is normal in development due to:
- Hot module reloading
- Multiple Next.js workers

In production with a single process, you'll see one connection with unique subscriptions.
