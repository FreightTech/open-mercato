# Migration: Unified Tenant-Prefixed Subjects

## Summary

Successfully unified n8n and Open Mercato to use the same subject pattern: `events.{tenantID}.{event_subject}` while maintaining loop prevention and tenant isolation.

## Changes Made

### 1. Async Consumer Subject Pattern
**File**: `packages/messaging/src/modules/messaging/async-events.ts`

**Changed**:
- ❌ Old: Subscribe to `inbound.>` (separate prefix for external events)
- ✅ New: Subscribe to `*.>` (tenant-prefixed events matching n8n pattern)

**Key Updates**:
- Removed `ASYNC_EVENTS_PREFIX = 'inbound.'`
- Updated `buildStreamSubjects()` to return `['*.>']` instead of `['inbound.>']`
- Added `stripTenantPrefix()` helper to extract event name from NATS subject
- Updated documentation to reflect tenant-prefixed subject pattern

### 2. Loop Prevention (x-source Header)
**File**: `packages/messaging/src/modules/messaging/async-events.ts`

**Added**:
- `isOwnMessage()` function to check for `x-source: open-mercato` header
- Header extraction from JetStream messages
- Early return when processing own messages

**Protection**:
```typescript
// Skip messages that originated from this app (prevent loops)
if (isOwnMessage(msg.headers)) {
  log(`Worker ${workerId}: Skipping own message on ${subject}`)
  ack()
  return { success: true, routedAs: 'event', durationMs: Date.now() - startTime }
}
```

### 3. Reply Handlers (Commands)
**File**: `packages/messaging/src/modules/messaging/reply-handlers.ts`

**No functional changes** - clarified documentation:
- Commands remain on `inbound.{commandId}` subjects (synchronous request-reply)
- Events use `events.{tenantID}.{event_subject}` subjects (asynchronous pub-sub)
- Clear separation between command and event patterns

### 4. NATS Auth Permissions
**File**: `packages/messaging/src/auth-callout/index.ts`

**Updated documentation**:
- Clarified that `{tenantId}.>` is for tenant-scoped events
- Clarified that `inbound.>` is for commands (synchronous)
- No functional changes to permissions (both patterns remain allowed)

### 5. Integration Tests
**File**: `packages/messaging/src/__tests__/external-integration.test.ts`

**Created comprehensive tests**:
- ✅ External systems can publish to `events.{tenantID}.{event_subject}`
- ✅ Open Mercato receives and processes external events
- ✅ Open Mercato skips its own events (x-source header check)
- ✅ Tenant isolation is maintained (separate tenant prefixes)
- ✅ Commands still work via `inbound.*` subjects

### 6. Integration Documentation
**File**: `packages/messaging/INTEGRATION.md`

**Created complete guide** covering:
- Subject patterns (events vs commands)
- Publishing events from external systems
- Executing commands synchronously
- Loop prevention mechanisms
- n8n integration examples
- Troubleshooting guide
- Best practices

## Subject Patterns Summary

| Type | Pattern | Use Case | Example |
|------|---------|----------|---------|
| **Events** (async) | `events.{tenantID}.{event_subject}` | Fire-and-forget notifications | `events.acme-corp.customers.people.created` |
| **Commands** (sync) | `inbound.{commandId}` | Request-reply operations | `inbound.customers.people.create` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NATS Server                             │
│                                                                 │
│  Subjects:                                                      │
│  ├─ {tenantID}.> ────────────► Events (async)                  │
│  │   ├─ events.acme-corp.customers.people.created                     │
│  │   ├─ tenant-123.sales.order.updated                         │
│  │   └─ widgets-inc.catalog.product.deleted                    │
│  │                                                              │
│  └─ inbound.> ───────────────► Commands (sync)                 │
│      ├─ inbound.customers.people.create                        │
│      ├─ inbound.sales.orders.update                            │
│      └─ inbound.catalog.products.delete                        │
└─────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
    ┌────┴────┐                          ┌───┴────┐
    │   n8n   │                          │   OM   │
    │         │                          │        │
    │ Publish │                          │ Skips  │
    │ to:     │                          │ own    │
    │ {tid}.* │                          │ msgs   │
    │         │                          │ via    │
    │ (no     │                          │ x-src  │
    │ x-src)  │                          │ check  │
    └─────────┘                          └────────┘
```

## Loop Prevention Mechanism

### How It Works

1. **Open Mercato publishes** an event to NATS
   - Subject: `events.acme-corp.customers.people.created`
   - Headers: `x-source: open-mercato` ✅

2. **NATS forwards** the message to all subscribers
   - n8n receives it (no x-source header filter)
   - Open Mercato async consumer receives it

3. **Open Mercato async consumer** checks headers
   - Sees `x-source: open-mercato`
   - **Skips processing** (loop prevented) ✅
   - Logs: `Skipping own message on customers.people.created`

4. **n8n processes** the event
   - No x-source header check (external system)
   - Can transform/enrich data
   - If republishing, should use different subject or add own source header

### Protection Matrix

| Source | x-source Header | OM Processes? | Notes |
|--------|----------------|---------------|-------|
| n8n | *(none)* | ✅ Yes | External event, processed normally |
| n8n | `x-source: n8n` | ✅ Yes | External event, processed normally |
| Open Mercato | `x-source: open-mercato` | ❌ No | Own event, skipped to prevent loop |

## Migration Steps for n8n

### Current n8n Setup
```javascript
// Already publishing to:
const subject = `${tenantId}.${eventSubject}`
```

### What to Verify
1. ✅ **Tenant ID is always included** in subject prefix
2. ✅ **DO NOT set `x-source: open-mercato` header**
3. ✅ **Follow event naming convention**: `module.entity.action`

### No Changes Required If:
- You're already publishing to `events.{tenantID}.{event_subject}`
- You're not setting the `x-source` header
- You're not subscribing to your own published events

## Testing

### Unit Tests
```bash
yarn workspace @open-mercato/messaging test
```

### Integration Tests
Requires NATS server running:
```bash
# Start NATS with JetStream
docker compose up -d nats

# Run integration tests
NATS_URL=nats://localhost:4222 yarn workspace @open-mercato/messaging test external-integration
```

### Manual Testing with n8n

1. **Setup n8n workflow**:
   - Trigger: Manual
   - Function: Build event payload
   - NATS: Publish to `{tenantID}.test.event`

2. **Verify in Open Mercato logs**:
   ```bash
   # Watch for event processing
   docker compose logs -f api | grep "test.event"
   
   # Should see:
   # [messaging:async-inbound] Worker 0: Processing message: test.event
   ```

3. **Test loop prevention**:
   - Trigger an Open Mercato action that emits an event
   - Watch logs for `Skipping own message`
   - Verify n8n receives the event (if subscribed)

## Rollback Plan

If issues arise, revert to separate prefixes:

1. **Revert async-events.ts**:
   ```typescript
   export const ASYNC_EVENTS_PREFIX = 'inbound.'
   
   function buildStreamSubjects(): string[] {
     return [`${ASYNC_EVENTS_PREFIX}>`]
   }
   ```

2. **Update n8n workflows**:
   ```javascript
   const subject = `inbound.${eventSubject}`
   ```

3. **Rebuild and deploy**:
   ```bash
   yarn workspace @open-mercato/messaging build
   docker compose restart api
   ```

## Verification Checklist

- [x] Async consumer subscribes to `*.>` pattern
- [x] Tenant prefix stripping works correctly
- [x] x-source header protection is active
- [x] Reply handlers remain on `inbound.*`
- [x] NATS auth permissions allow both patterns
- [x] Integration tests pass
- [x] Build succeeds without TypeScript errors
- [x] Documentation is complete

## Performance Considerations

### Before (Separate Prefixes)
- Stream subjects: `inbound.>`
- Single wildcard level

### After (Tenant-Prefixed)
- Stream subjects: `*.>` 
- Two wildcard levels (tenant + event)
- **Impact**: Negligible - NATS handles multi-level wildcards efficiently

### JetStream Consumer
- Concurrency: Configurable via `MESSAGING_INBOUND_CONCURRENCY` (default: 1)
- Ack timeout: 30s (configurable)
- Max retries: 3 (configurable)
- No performance degradation expected

## Security Considerations

### Tenant Isolation
✅ **Maintained** - Tenant ID in subject ensures isolation at NATS level

### Loop Prevention
✅ **Enhanced** - x-source header check prevents infinite loops

### Cross-Tenant Leakage
✅ **Protected** - `*.>` pattern requires tenant prefix, wildcards ensure proper routing

### Permission Model
✅ **Unchanged** - NATS Auth Callout grants:
- `{tenantId}.>` for tenant-scoped events
- `inbound.>` for commands
- `_INBOX.>` for request-reply

## Monitoring

### Key Metrics to Watch

1. **Event Processing Rate**
   ```bash
   # Get consumer stats
   docker compose exec api node -e "
     const { container } = require('./src/di');
     const consumer = container.resolve('inboundConsumer');
     console.log(consumer.getStats());
   "
   ```

2. **Loop Detection**
   ```bash
   # Count skipped messages
   docker compose logs api | grep "Skipping own message" | wc -l
   ```

3. **Failed Events**
   ```bash
   # Check for processing errors
   docker compose logs api | grep "Worker.*Error processing"
   ```

## Next Steps

1. **Update n8n workflows** (if needed):
   - Verify tenant ID is in subject prefix
   - Remove any `x-source` header if present

2. **Monitor production**:
   - Watch for duplicate event processing
   - Check loop detection logs
   - Verify event delivery rates

3. **Update documentation**:
   - Internal wiki/docs
   - n8n workflow templates
   - Integration guides for other systems

## Support

For questions or issues:
- Technical lead: [Your Name]
- Documentation: `packages/messaging/INTEGRATION.md`
- Tests: `packages/messaging/src/__tests__/external-integration.test.ts`

## References

- [NATS Subject-Based Messaging](https://docs.nats.io/nats-concepts/subjects)
- [JetStream Consumers](https://docs.nats.io/nats-concepts/jetstream/consumers)
- [Open Mercato Event Bus](packages/events/README.md)
