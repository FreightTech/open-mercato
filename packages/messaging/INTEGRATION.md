# External System Integration Guide

This guide explains how to integrate external systems (n8n, Zapier, custom services) with Open Mercato via NATS messaging.

## Table of Contents

- [Overview](#overview)
- [Subject Patterns](#subject-patterns)
- [Publishing Events](#publishing-events)
- [Executing Commands](#executing-commands)
- [Loop Prevention](#loop-prevention)
- [n8n Integration Example](#n8n-integration-example)
- [Troubleshooting](#troubleshooting)

## Overview

Open Mercato supports two types of external interactions via NATS:

1. **Events** (fire-and-forget): Publish events that trigger internal workflows
2. **Commands** (request-reply): Execute commands synchronously and get responses

## Subject Patterns

### Events (Asynchronous)

**Pattern**: `events.{tenantID}.{event_subject}`

**Example subjects**:
- `events.acme-corp.customers.people.created`
- `events.tenant-123.sales.order.updated`
- `widgets-inc.catalog.product.deleted`

**Use case**: Fire-and-forget notifications, triggering workflows, syncing data

### Commands (Synchronous)

**Pattern**: `inbound.{commandId}`

**Example subjects**:
- `inbound.customers.people.create`
- `inbound.sales.orders.update`
- `inbound.catalog.products.delete`

**Use case**: Execute operations and wait for results, data mutations with validation

## Publishing Events

Events are **tenant-scoped** and processed asynchronously.

### Basic Event Structure

```json
{
  "id": "resource-id",
  "tenantId": "acme-corp",
  "organizationId": "org-123",
  ...additionalFields
}
```

### Example: Publish Customer Created Event

```typescript
// NATS subject
const subject = 'events.acme-corp.customers.people.created'

// Payload
const payload = {
  id: 'person-456',
  email: 'john@example.com',
  name: 'John Doe',
  tenantId: 'acme-corp',
  organizationId: 'org-123',
}

// Publish
await natsConnection.publish(subject, JSON.stringify(payload))
```

### Important Rules

1. **Always include tenant ID** in both the subject prefix AND payload
2. **Do NOT set `x-source: open-mercato` header** (reserved for internal use)
3. **Follow event naming convention**: `{module}.{entity}.{action}`
   - ✅ `customers.people.created`
   - ✅ `sales.order.updated`
   - ❌ `customer_created` (wrong format)

## Executing Commands

Commands use **request-reply** pattern for synchronous execution.

### Command Payload Structure

```json
{
  "input": {
    // Command-specific input fields
  },
  "tenantId": "acme-corp",
  "organizationId": "org-123"
}
```

### Example: Create Customer (Synchronous)

```typescript
// NATS subject
const subject = 'inbound.customers.people.create'

// Payload
const payload = {
  input: {
    email: 'jane@example.com',
    name: 'Jane Smith',
    phone: '+1234567890',
  },
  tenantId: 'acme-corp',
  organizationId: 'org-123',
}

// Send request and wait for response
const response = await natsConnection.request(
  subject,
  JSON.stringify(payload),
  { timeout: 30000 } // 30 second timeout
)

// Parse response
const result = JSON.parse(response.data.toString())
// { success: true, result: { id: 'person-789', ... } }
```

### Response Format

**Success**:
```json
{
  "success": true,
  "result": { ... }
}
```

**Error**:
```json
{
  "success": false,
  "error": "Validation failed",
  "errorMsg": "Email is required",
  "code": "VALIDATION_ERROR"
}
```

## Loop Prevention

Open Mercato automatically prevents infinite loops by:

1. **Adding `x-source: open-mercato` header** to all outbound messages
2. **Skipping messages with this header** when consuming from NATS

### Important for External Systems

- **NEVER set `x-source: open-mercato` header** in your published messages
- If you subscribe to Open Mercato events, **do not republish them** unless:
  - You transform/enrich the data significantly
  - You publish to a different subject pattern
  - You have explicit loop prevention logic

### Detecting Loops

If you see the same event being processed multiple times:

1. Check if you're subscribing to events you also publish
2. Verify you're not setting the `x-source` header
3. Add logging to track event flow: `external system → NATS → Open Mercato → NATS → external system`

## n8n Integration Example

### Publishing Events from n8n

**Use Case**: When a webhook triggers in n8n, publish an event to Open Mercato

**n8n Workflow**:
1. **Webhook Trigger** - Receives external data
2. **Function Node** - Build event payload
3. **NATS Node** - Publish to Open Mercato

**Function Node Code**:
```javascript
// Extract data from webhook
const { customerId, email, name } = $json.body

// Get tenant ID from environment or workflow parameters
const tenantId = $env.TENANT_ID || 'acme-corp'
const organizationId = $env.ORG_ID || 'org-123'

// Build NATS subject
const eventSubject = 'customers.people.created'
const natsSubject = `events.${tenantId}.${eventSubject}`

// Build payload
const payload = {
  id: customerId,
  email,
  name,
  tenantId,
  organizationId,
  source: 'n8n',
  timestamp: new Date().toISOString(),
}

return {
  subject: natsSubject,
  payload: JSON.stringify(payload),
}
```

**NATS Node Configuration**:
- **Operation**: Publish
- **Subject**: `{{ $json.subject }}`
- **Message**: `{{ $json.payload }}`
- **Connection**: Your NATS server URL

### Executing Commands from n8n

**Use Case**: Create a customer in Open Mercato and wait for confirmation

**n8n Workflow**:
1. **Trigger** - Manual or scheduled
2. **Function Node** - Build command payload
3. **NATS Request Node** - Execute command synchronously

**Function Node Code**:
```javascript
const tenantId = $env.TENANT_ID || 'acme-corp'
const organizationId = $env.ORG_ID || 'org-123'

const payload = {
  input: {
    email: 'new-customer@example.com',
    name: 'New Customer',
  },
  tenantId,
  organizationId,
}

return {
  subject: 'inbound.customers.people.create',
  payload: JSON.stringify(payload),
}
```

**NATS Request Node Configuration**:
- **Operation**: Request
- **Subject**: `{{ $json.subject }}`
- **Message**: `{{ $json.payload }}`
- **Timeout**: 30000ms

**Handle Response**:
```javascript
// Parse NATS response
const response = JSON.parse($json.data)

if (response.success) {
  console.log('Customer created:', response.result.id)
  return response.result
} else {
  throw new Error(`Command failed: ${response.errorMsg}`)
}
```

## Authentication

If using NATS Auth Callout, provide your API key:

### n8n NATS Connection
- **URL**: `nats://your-nats-server:4222`
- **Token**: Your Open Mercato API key (starts with `omk_`)

### Programmatic Connection
```typescript
import { connect } from 'nats'

const nc = await connect({
  servers: 'nats://your-nats-server:4222',
  token: process.env.OPEN_MERCATO_API_KEY,
})
```

## Troubleshooting

### Events Not Being Received

1. **Check subject format**: Must be `events.{tenantID}.{event_subject}`
   ```bash
   # Correct
   events.acme-corp.customers.people.created
   
   # Incorrect
   customers.people.created  # Missing tenant prefix
   inbound.customers.people.created  # Wrong prefix (inbound is for commands)
   ```

2. **Verify tenant ID** matches the one in your Open Mercato instance

3. **Check NATS logs** for connection/authentication errors

4. **Enable debug logging**:
   ```bash
   MESSAGING_DEBUG=true
   ```

### Commands Timing Out

1. **Increase timeout**: Commands may take longer than default 5s
   ```typescript
   { timeout: 30000 } // 30 seconds
   ```

2. **Check command ID**: Must match registered command exactly
   ```bash
   # List available commands
   yarn mercato commands:list
   ```

3. **Verify payload structure**: Must include `input`, `tenantId`, `organizationId`

### Loop Detection

If you see `Skipping own message` in logs:

- ✅ **Good**: This is working as intended
- ❌ **Bad**: If you're an external system and seeing this, you're accidentally setting the `x-source` header

### Permission Denied

If NATS rejects your publish/subscribe:

1. **Check API key permissions**: Ensure your API key has access to the tenant
2. **Verify NATS Auth Callout** is configured correctly
3. **Check subject permissions**: Your key must allow `{tenantID}.>` and `inbound.>` subjects

## Available Event Subjects

Common event patterns:

| Module | Example Event |
|--------|---------------|
| Customers | `{tenant}.customers.people.created` |
| Sales | `{tenant}.sales.order.created` |
| Catalog | `{tenant}.catalog.product.updated` |
| Workflows | `{tenant}.workflows.instance.completed` |

**To discover all events**:
```bash
# List all declared events
curl http://your-api/api/events
```

## Available Commands

Common command patterns:

| Operation | Command Subject |
|-----------|-----------------|
| Create Customer | `inbound.customers.people.create` |
| Update Order | `inbound.sales.orders.update` |
| Delete Product | `inbound.catalog.products.delete` |

**To discover all commands**:
```bash
# List all registered commands
yarn mercato commands:list
```

## Best Practices

1. **Use events for notifications**, commands for mutations
2. **Always validate tenant ID** in your workflows
3. **Set reasonable timeouts** for commands (30s recommended)
4. **Log all NATS interactions** for debugging
5. **Monitor for failed deliveries** and implement retry logic
6. **Use JetStream** for guaranteed delivery (optional)
7. **Namespace your custom events** to avoid conflicts (e.g., `{tenant}.n8n.custom.event`)

## Support

For issues or questions:
- GitHub Issues: [open-mercato/om_ft](https://github.com/open-mercato/om_ft)
- Documentation: [https://open-mercato.com/docs](https://open-mercato.com/docs)
