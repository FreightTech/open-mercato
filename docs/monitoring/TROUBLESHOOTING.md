# HyperDX Monitoring Troubleshooting

Common issues and solutions for Open Mercato monitoring (CHAME-29).

## Table of Contents

- [Logs Not Appearing](#logs-not-appearing)
- [Metrics Missing](#metrics-missing)
- [Wrong Environment](#wrong-environment)
- [Health Check Failing](#health-check-failing)
- [Dashboard Widgets Empty](#dashboard-widgets-empty)
- [Alerts Not Firing](#alerts-not-firing)
- [High Memory Usage](#high-memory-usage)
- [AI Token Tracking Not Working](#ai-token-tracking-not-working)
- [Document Tracking Not Working](#document-tracking-not-working)
- [Performance Issues](#performance-issues)

---

## Logs Not Appearing

### Symptom
No logs visible in HyperDX after application starts.

### Diagnosis

1. Check environment variables:
```bash
grep HYPERDX .env
grep OTLP .env
```

Expected output:
```
OTLP_ENDPOINT=https://in-otel.hyperdx.io
HYPERDX_API_KEY=your-key-here
```

2. Check console for initialization:
```bash
yarn dev 2>&1 | grep logger
```

Expected output:
```
[logger] OTLP logging initialized
```

3. Test OTLP endpoint manually:
```bash
curl -v https://in-otel.hyperdx.io/v1/logs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": "log"}'
```

### Solutions

**Missing environment variables:**
```bash
# Add to .env
echo "OTLP_ENDPOINT=https://in-otel.hyperdx.io" >> .env
echo "HYPERDX_API_KEY=your-key-here" >> .env
```

**Invalid API key:**
1. Go to HyperDX Settings → API Keys
2. Generate new key
3. Update `.env` with new key
4. Restart application

**OTLP not initialized:**
1. Check `packages/logger/src/otel.ts` is imported
2. Verify initialization happens before first log
3. Check for errors in console during startup

**Network/firewall issues:**
```bash
# Test connectivity
curl -v https://in-otel.hyperdx.io

# If behind corporate firewall, you may need proxy:
export HTTPS_PROXY=http://proxy.company.com:8080
```

---

## Metrics Missing

### Symptom
Logs appear in HyperDX but metrics are missing from dashboard.

### Diagnosis

1. Check metrics initialization:
```bash
yarn dev 2>&1 | grep -i metric
```

Expected output:
```
[logger] Metrics provider initialized (60s interval)
[logger] Resource metrics started
```

2. Check if metrics are being created:
```typescript
// In your code, verify meter is resolved
const meter = getMeter('module_name')
console.log('Meter:', meter)
```

3. Check HyperDX Metrics Explorer:
- Navigate to Metrics in UI
- Search for: `system.cpu.percent`
- If not found, metrics aren't being exported

### Solutions

**Metrics not initialized:**

Verify `apps/mercato/src/app/api/[...slug]/route.ts` contains:
```typescript
import { initMetrics, startResourceMetrics } from '@open-mercato/logger'

// At application startup
await initMetrics()
await startResourceMetrics()
```

**Export interval too long:**

Metrics export every 60 seconds. Wait 2-3 minutes after startup before checking.

**OTLP metrics endpoint issue:**

Check if metrics use different endpoint:
```typescript
// packages/logger/src/metrics.ts
const metricExporter = new OTLPMetricExporter({
  url: `${process.env.OTLP_ENDPOINT}/v1/metrics`, // ← verify URL
  headers: {
    Authorization: `Bearer ${process.env.HYPERDX_API_KEY}`,
  },
})
```

**Meter not available:**

If `getMeter()` returns undefined:
1. Ensure `initMetrics()` was called before `getMeter()`
2. Check import order in files
3. Verify `@opentelemetry/sdk-metrics` is installed

**Metrics initialization failed:**

Check application logs for initialization retry attempts:
```
[api] Failed to initialize metrics (attempt 1/3): <error>
[api] Failed to initialize metrics (attempt 2/3): <error>
[api] Failed to initialize metrics (attempt 3/3): <error>
[api] Max metric initialization attempts reached, giving up
```

If you see max attempts reached:
1. Fix the configuration issue (check `OTLP_ENDPOINT`, `HYPERDX_API_KEY`)
2. Make another API request - initialization will NOT retry automatically after max attempts
3. Restart the application to reset the attempt counter

Metrics are initialized lazily on the first API request. If initialization fails:
- Application continues to work without metrics (graceful degradation)
- Up to 3 retry attempts will be made automatically
- After 3 failures, metrics are permanently disabled for that session
- Check logs for specific error messages about what failed

**Export interval configuration:**

Customize metrics export frequency via environment variable:
```bash
# .env
METRICS_EXPORT_INTERVAL=120000  # Export every 2 minutes (default: 60000)
```

Longer intervals reduce overhead but delay metric visibility.

---

## Wrong Environment

### Symptom
Logs show `environment: "production"` but you're running locally.

### Diagnosis

1. Check `APP_URL`:
```bash
grep APP_URL .env
```

2. Test environment detection:
```typescript
import { resolveEnvironment } from '@open-mercato/logger'
console.log('Environment:', resolveEnvironment())
```

### Solutions

**Fix APP_URL:**

```bash
# For local development
APP_URL=http://localhost:3000

# For staging
APP_URL=https://staging.yourdomain.com

# For production
APP_URL=https://yourdomain.com
```

**Environment detection logic:**
- URL contains `localhost`, `127.0.0.1`, `dev`, or `test` → `development`
- URL contains `staging` or `stage` → `staging`
- All other domains → `production`
- Detection is case-insensitive

**Override for testing:**

Temporarily override in code:
```typescript
// packages/logger/src/logger.ts
export function resolveEnvironment(): string {
  return 'development' // Force development
}
```

---

## Health Check Failing

### Symptom
`/api/health` endpoint returns `status: "degraded"` or times out.

### Diagnosis

1. Test health endpoint:
```bash
curl -v http://localhost:3000/api/health | jq
```

2. Check which service is failing:
```json
{
  "status": "degraded",
  "checks": {
    "database": { "status": "ok" },
    "redis": { "status": "degraded", "error": "Connection timeout" },
    "nats": { "status": "ok" },
    "meilisearch": { "status": "ok" }
  }
}
```

### Solutions

**Database degraded:**
```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT 1"

# Check connection string
grep DATABASE_URL .env

# Test connection
yarn db:ping
```

**Redis degraded:**
```bash
# Check Redis is running
redis-cli ping

# Expected: PONG

# Check connection
grep REDIS_URL .env

# Test connection
redis-cli -u $REDIS_URL ping
```

**NATS degraded:**
```bash
# Check NATS is running
curl http://localhost:4222

# Expected: HTTP 200

# Check connection
grep NATS_URL .env
```

**Meilisearch degraded:**
```bash
# Check Meilisearch is running
curl http://localhost:7700/health

# Expected: {"status":"available"}

# Check connection
grep MEILISEARCH_URL .env
```

**Timeout issues:**

If health check times out (>5s per check):
1. Check network latency to services
2. Verify services are on same network/VPC
3. Consider increasing timeout in `route.ts`:
```typescript
const timeout = 10000 // Increase to 10 seconds
```

---

## Dashboard Widgets Empty

### Symptom
Dashboard imported successfully but widgets show "No data".

### Diagnosis

1. Check if logs exist:
```
# In HyperDX Logs
*
```

2. Check widget query matches your logs:
```
# Try simplifying widget query
message:"fms.document.created"
# vs
fms.document.created
```

3. Check time range:
- Widget default: Last 1 hour
- If no recent activity, extend to 24 hours

### Solutions

**Generate test data:**

```bash
# Create document
curl -X POST http://localhost:3000/api/fms-documents/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test-document.pdf"

# Trigger AI chat
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# Check health
curl http://localhost:3000/api/health
```

**Fix widget queries:**

If queries don't match your log format, update dashboard:
1. Edit widget
2. Test query in Logs first
3. Update widget query
4. Save dashboard

**Check aggregations:**

Some widgets require specific fields:
- `sum` on `totalTokens` → requires numeric field
- `p95` on `durationMs` → requires numeric field
- `cardinality` on `userId` → requires field exists

---

## Alerts Not Firing

### Symptom
Condition met but no alert received.

### Diagnosis

1. Check alert is enabled:
   - HyperDX → Alerts
   - Find alert
   - Verify "Enabled" toggle is ON

2. Test alert query manually:
```
# In HyperDX Logs, run alert query
level:error
```

3. Check notification channels:
   - Settings → Notification Channels
   - Test each channel

4. Check alert history:
   - Open alert details
   - View "History" tab
   - Check if alert fired but delivery failed

### Solutions

**Alert not triggering:**

1. Verify condition threshold:
```yaml
# Too high?
condition:
  operator: '>'
  value: 1000  # Lower this
```

2. Verify time window:
```yaml
window: 5m  # Maybe too short, try 15m
```

3. Test with guaranteed trigger:
```yaml
# Temporary: trigger on any log
query: '*'
condition:
  type: count
  operator: '>'
  value: 0
```

**Notification not received:**

**Slack webhook:**
```bash
# Test webhook directly
curl -X POST YOUR_SLACK_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"text": "Test alert"}'
```

**PagerDuty:**
```bash
# Test integration key
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "YOUR_KEY",
    "event_action": "trigger",
    "payload": {
      "summary": "Test alert",
      "severity": "critical",
      "source": "test"
    }
  }'
```

**Email:**
- Check spam folder
- Verify email address is correct
- Test with different email

**Alert throttled:**

Alerts are throttled to prevent spam:
- Critical: Max 1 per 5 minutes
- Warning: Max 1 per 15 minutes
- Info: Max 1 per hour

Wait for throttle window to pass, then trigger again.

---

## High Memory Usage

### Symptom
Application memory usage grows continuously or spikes after enabling monitoring.

### Diagnosis

1. Check current memory:
```bash
# Check dashboard: "Memory Usage (MB)" widget
# Or query:
metric.name:"system.memory.used_mb"
```

2. Check metric cardinality:
```
# Count unique label combinations
metric.name:"ai.tokens.consumed"
# Group by: tenantId, organizationId, brandId, model
# If >1000 unique combinations, cardinality is high
```

3. Check log volume:
```
# Count logs per minute
* | stats count() by bin(timestamp, 1m)
```

### Solutions

**Reduce metric cardinality:**

```typescript
// Before: High cardinality (1000s of combinations)
meter.createCounter('ai.tokens.consumed').add(1, {
  tenantId: '...',
  organizationId: '...',
  brandId: '...',
  model: '...',
  userId: '...', // ← Remove this
  sessionId: '...', // ← Remove this
})

// After: Low cardinality (<100 combinations)
meter.createCounter('ai.tokens.consumed').add(1, {
  model: '...',
  type: 'total', // input/output/total
})
```

**Reduce log sampling:**

```typescript
// Sample 10% of high-volume logs
if (Math.random() < 0.1) {
  logger.info('high.volume.event', { ... })
}
```

**Increase export interval:**

```typescript
// packages/logger/src/metrics.ts
const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 120000, // Increase to 2 minutes
    }),
  ],
})
```

**Clear metric buffers:**

```typescript
// If memory leak suspected, restart metrics
import { shutdownMetrics, initMetrics } from '@open-mercato/logger'

await shutdownMetrics()
await initMetrics()
```

---

## AI Token Tracking Not Working

### Symptom
AI chat works but no `ai.tokens.consumed` logs appear.

### Diagnosis

1. Check logger is imported:
```typescript
// packages/ai-assistant/.../chat/route.ts
import { createLogger } from '@open-mercato/logger'
const logger = createLogger('ai_assistant')
```

2. Check SSE metadata handling:
```typescript
// Look for metadata event parsing
case 'metadata':
  const metadata = JSON.parse(event.data)
  // Log here
```

3. Test with debug logging:
```typescript
console.log('Metadata event:', metadata)
```

### Solutions

**Logger not initialized:**

Ensure logger is created before SSE loop:
```typescript
const logger = createLogger('ai_assistant')
const meter = getMeter('ai_assistant')

// Then in SSE loop...
```

**Metadata event not received:**

Check AI provider returns usage metadata:
```typescript
// Add debug logging
for await (const event of stream) {
  console.log('Event type:', event.type)
  if (event.type === 'metadata') {
    console.log('Metadata:', event.data)
  }
}
```

If metadata never appears, the AI provider might not send it.

**Metric not created:**

Verify counter exists:
```typescript
const counter = meter.createCounter('ai.tokens.consumed', {
  description: 'Number of AI tokens consumed',
  unit: '1',
})
console.log('Counter:', counter) // Should not be undefined
```

---

## Document Tracking Not Working

### Symptom
Documents uploaded but no `fms.document.created` logs.

### Diagnosis

1. Check document upload succeeds:
```bash
curl -v -X POST http://localhost:3000/api/fms-documents/upload \
  -F "file=@test.pdf"
# Should return 200
```

2. Check logger in upload route:
```typescript
// packages/fms/.../upload/route.ts
import { createLogger } from '@open-mercato/logger'
const logger = createLogger('fms_documents')
```

3. Check log after document creation:
```typescript
// After document is created
logger.info('fms.document.created', {
  documentId: document.id,
  category: document.category,
  // ...
})
```

### Solutions

**Logger not imported:**

Add to upload route:
```typescript
import { createLogger, getMeter } from '@open-mercato/logger'

const logger = createLogger('fms_documents')
const meter = getMeter('fms_documents')
```

**Logging in wrong place:**

Log AFTER document is successfully created and flushed:
```typescript
const document = em.create(FmsDocument, { ... })
em.persist(document)
await em.flush() // ← ID is now available

// ✅ Log here
logger.info('fms.document.created', {
  documentId: document.id, // ✅ ID exists
  // ...
})
```

**Context missing:**

Ensure all required fields are available:
```typescript
logger.info('fms.document.created', {
  documentId: document.id,
  category: document.category,
  tenantId: document.tenantId, // Required
  organizationId: document.organizationId, // Required
  brandId: request.headers.get('x-brand-id') || undefined,
})
```

---

## Performance Issues

### Symptom
Application slower after enabling monitoring.

### Diagnosis

1. Measure overhead:
```bash
# Before monitoring
time curl http://localhost:3000/api/health

# After monitoring
time curl http://localhost:3000/api/health

# Compare difference
```

2. Profile application:
```bash
node --prof apps/mercato/server.js
```

3. Check export frequency:
```typescript
// Check current interval
exportIntervalMillis: 60000 // 60 seconds
```

### Solutions

**Reduce export frequency:**

```typescript
// packages/logger/src/metrics.ts
exportIntervalMillis: 120000, // 2 minutes instead of 1
```

**Use async logging:**

Already implemented with OTLP, but verify:
```typescript
// Should be non-blocking
logger.info('event', { ... }) // Returns immediately
```

**Disable debug logging:**

```bash
# In .env
LOG_LEVEL=info # Not debug
```

**Sample high-volume events:**

```typescript
// Only log 10% of requests
if (Math.random() < 0.1 || level === 'error') {
  logger.info('request.completed', { ... })
}
```

**Profile metrics collection:**

If resource metrics are slow:
```typescript
// Disable temporarily to test
// await startResourceMetrics()
```

---

## Getting Help

If issue not covered here:

1. Check HyperDX docs: https://hyperdx.io/docs
2. Check OpenTelemetry docs: https://opentelemetry.io/docs
3. Search HyperDX community forum
4. Contact #engineering-ops on Slack
5. Open GitHub issue with:
   - Symptom description
   - Steps to reproduce
   - Logs/screenshots
   - Environment details (dev/staging/prod)

## Contributing

Found a new issue and solution? Add it to this document:

1. Add section with clear symptom
2. Include diagnosis steps
3. Provide working solutions
4. Test solutions before committing
5. Submit PR

