# Open Mercato Monitoring

Comprehensive monitoring and observability for the Open Mercato platform using HyperDX.

## Overview

This monitoring implementation (CHAME-29) provides:

- **Centralized Logging**: All logs sent to HyperDX via OTLP
- **Metrics Collection**: System and application metrics via OpenTelemetry
- **Distributed Tracing**: Request tracing across services
- **Health Checks**: Real-time system health monitoring
- **Custom Dashboards**: 24-widget dashboard for complete visibility
- **Intelligent Alerts**: Automated alerts for critical issues

## Quick Start

### 1. Sign up for HyperDX

```bash
# Visit https://hyperdx.io and create an account
# Get your OTLP endpoint and API key
```

### 2. Configure Environment Variables

Add to `.env`:

```bash
# HyperDX Configuration
OTLP_ENDPOINT=https://in-otel.hyperdx.io
HYPERDX_API_KEY=your-api-key-here
APP_URL=https://yourdomain.com  # Used for environment detection
```

### 3. Restart Application

```bash
yarn dev
# or
yarn build && yarn start
```

### 4. Import Dashboard

1. Open HyperDX web UI
2. Navigate to Dashboards
3. Click "Import Dashboard"
4. Upload `hyperdx-dashboard.json`
5. Verify widgets are displaying data

### 5. Configure Alerts

1. Open HyperDX web UI
2. Navigate to Alerts
3. Create alerts from `alerts.yaml` configuration
4. Configure notification channels (Slack, PagerDuty, Email)

## What's Monitored

### Application Logs
- All log levels (debug, info, warn, error)
- Request/response logging
- Error stack traces
- Business events (document creation, AI usage, etc.)

### System Metrics
- CPU usage percentage
- Memory consumption
- Event loop lag (Node.js)

### Application Metrics
- AI token consumption (input/output/total)
- Document lifecycle (created, extracted, updated, deleted)
- Invoice processing
- Webhook delivery

### Health Checks
- PostgreSQL connectivity
- Redis connectivity
- NATS connectivity
- Meilisearch connectivity

## Environment Detection

The system automatically detects the deployment environment from `APP_URL`:

- Contains `localhost`, `127.0.0.1`, `dev`, or `test` → `development`
- Contains `staging` or `stage` → `staging`
- All other domains → `production` (e.g., `inf.freighttech.org`, `4rcargo.freighttech.org`)

Detection is case-insensitive. This allows filtering logs/metrics by environment in HyperDX.

**Examples:**

| APP_URL | Environment |
|---------|-------------|
| `http://localhost:3000` | `development` |
| `https://dev.4rcargo.freighttech.org` | `development` |
| `https://test.example.com` | `development` |
| `https://staging.freighttech.org` | `staging` |
| `https://inf.freighttech.org` | `production` |
| `https://4rcargo.freighttech.org` | `production` |
| `https://fms.freighttech.org` | `production` |

## Key Features

### Automatic Context Enrichment

Every log entry includes:
- `environment` - Detected from APP_URL
- `tenantId` - Current tenant context
- `organizationId` - Current organization context
- `brandId` - Current brand context (from header)
- `userId` - Authenticated user (if applicable)

### FMS Document Tracking

Complete lifecycle tracking for documents:

```typescript
// Creation
fms.document.created {
  documentId, category, tenantId, organizationId, brandId
}

// Extraction
fms.document.extraction.started { documentId, category, ... }
fms.document.extraction.completed { documentId, durationMs, confidence, ... }
fms.document.extraction.failed { documentId, error, ... }

// Updates
fms.document.updated { documentId, changedFields, ... }

// Deletion
fms.document.deleted { documentId, category, ... }
```

### AI Usage Tracking

Track token consumption and costs:

```typescript
ai.tokens.consumed {
  inputTokens, outputTokens, totalTokens,
  model, provider, tenantId, organizationId, brandId
}
```

Metrics:
- Counter: `ai.tokens.consumed` (dimensions: type, model, provider, tenant, org, brand)

### Performance Metrics

OpenTelemetry metrics exported every 60 seconds:

**System Metrics:**
- `system.cpu.percent` - CPU usage percentage
- `system.memory.used_mb` - Memory usage in MB
- `nodejs.event_loop.lag_ms` - Event loop lag in ms

**Application Metrics:**
- `fms.documents.created` - Document creation counter
- `fms.documents.extracted` - Extraction success/failure counter
- `fms.documents.extraction.duration` - Extraction duration histogram
- `fms.documents.updated` - Document update counter
- `fms.documents.deleted` - Document deletion counter
- `fms.invoices.created` - Invoice creation counter

### Initialization Timing

Metrics are initialized lazily on the first API request to avoid cold start overhead in serverless environments:

- **First request triggers initialization**: No metrics collected until first API call
- **Retry logic**: Up to 3 initialization attempts if failures occur
- **Graceful degradation**: After 3 failed attempts, application continues without metrics
- **No restart needed**: Fix configuration issues and make another request to retry

This approach ensures the application always starts successfully even if monitoring is misconfigured.

**Environment Variables:**
- `METRICS_EXPORT_INTERVAL` - Metrics export interval in milliseconds (default: 60000)

## Files

### Configuration
- `.env` - Environment variables (OTLP endpoint, API key)
- `packages/logger/src/logger.ts` - Logger with environment detection
- `packages/logger/src/otel.ts` - OTLP exporter configuration
- `packages/logger/src/metrics.ts` - OpenTelemetry metrics setup
- `packages/logger/src/resource-metrics.ts` - System metrics collection

### Documentation
- `README.md` (this file) - Overview and quick start
- `SETUP.md` - Detailed setup instructions
- `hyperdx-dashboard.json` - Pre-built dashboard configuration
- `hyperdx-queries.md` - Query reference and patterns
- `alerts.yaml` - Alert configuration
- `TROUBLESHOOTING.md` - Common issues and solutions

### Instrumentation
- `apps/mercato/src/app/api/[...slug]/route.ts` - Metrics initialization
- `packages/ai-assistant/src/modules/ai_assistant/api/chat/route.ts` - AI token tracking
- `packages/fms/src/modules/fms_documents/api/upload/route.ts` - Document creation tracking
- `packages/fms/src/modules/fms_documents/api/documents/[id]/extract/route.ts` - Extraction tracking
- `packages/fms/src/modules/fms_documents/commands/documents.ts` - Update/delete tracking
- `packages/fms/src/modules/fms_documents/api/invoices/upload/route.ts` - Invoice tracking
- `packages/core/src/modules/core/api/health/route.ts` - Health check endpoint

## Health Check Endpoint

Public endpoint for external monitoring:

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-03-05T12:00:00Z",
  "environment": "production",
  "checks": {
    "database": { "status": "ok", "responseTimeMs": 12 },
    "redis": { "status": "ok", "responseTimeMs": 3 },
    "nats": { "status": "ok", "responseTimeMs": 5 },
    "meilisearch": { "status": "ok", "responseTimeMs": 8 }
  }
}
```

- Always returns HTTP 200 (even when degraded)
- 5-second timeout per check
- Use `status` field to determine overall health

## Dashboard

The pre-built dashboard includes 24 widgets organized into sections:

1. **Performance** (3 widgets) - Error rate, request rate, response time
2. **AI Usage** (3 widgets) - Token consumption, breakdown by type, cost estimate
3. **Document Processing** (4 widgets) - Created, extracted, duration, success rate
4. **Document Operations** (3 widgets) - Updated, deleted, invoices created
5. **System Health** (3 widgets) - CPU, memory, event loop lag
6. **Infrastructure** (2 widgets) - Health status table, top errors
7. **Business Metrics** (4 widgets) - Requests by tenant/environment, confidence distribution, active users
8. **Integrations** (1 widget) - Webhook delivery rate
9. **Performance Analysis** (1 widget) - Slow queries table

See `hyperdx-dashboard.json` for complete configuration.

## Alerts

13 pre-configured alerts covering:

**Critical (4 alerts)**
- System health degraded
- High error rate (>100/min)
- API response time degraded (>3s P95)
- Extraction success rate low (<80%)

**Warning (5 alerts)**
- High CPU usage (>80%)
- High memory usage (>4GB)
- Event loop lag (>100ms P95)
- Extraction slow (>30s P95)
- Webhook delivery failure rate high (>20%)

**Budget (2 alerts)**
- High AI token usage (>1M/day)
- High AI cost (>$50/day)

**Information (2 alerts)**
- Low extraction confidence (>10 LOW confidence docs/hour)
- New tenant activity

See `alerts.yaml` for complete configuration.

## Query Examples

### Find all errors for a specific tenant
```
level:error AND tenantId:"abc-123"
```

### Track AI usage for a specific model
```
message:"ai.tokens.consumed" AND model:"claude-3-5-sonnet"
```

### Monitor document extraction performance
```
message:"fms.document.extraction.completed" AND durationMs:>10000
```

### Find failed extractions with errors
```
message:"fms.document.extraction.failed"
```

See `hyperdx-queries.md` for more examples and patterns.

## Best Practices

### For Developers

1. **Use structured logging**: Pass context objects instead of string interpolation
2. **Include tenant/org context**: Always pass these for multi-tenant filtering
3. **Log business events**: Track important user actions and workflows
4. **Add metrics for key operations**: Use counters and histograms appropriately
5. **Test locally**: Verify logs appear in HyperDX before deploying

### For Operations

1. **Set up alerts early**: Configure critical alerts on day one
2. **Monitor the monitors**: Set up alerts for HyperDX connectivity issues
3. **Regular review**: Check dashboard weekly for trends
4. **Optimize costs**: Monitor AI token usage and set budget alerts
5. **Document incidents**: Use HyperDX to investigate and document root causes

### For Product

1. **Track user behavior**: Use logs to understand feature usage
2. **Monitor quality**: Watch extraction confidence and success rates
3. **Identify bottlenecks**: Use slow query widget to find UX issues
4. **Measure impact**: Compare metrics before/after feature launches

## Cost Optimization

### Reduce Log Volume

1. **Filter debug logs in production**: Set `LOG_LEVEL=info` in production `.env`
2. **Sample high-volume events**: Log 10% of frequent events
3. **Exclude health checks**: Don't log successful health checks

### Reduce Metric Cardinality

1. **Limit tenant dimensions**: Use aggregated metrics for >100 tenants
2. **Bucket numeric values**: Group similar values (e.g., confidence ranges)
3. **Remove low-value labels**: Only include dimensions used in queries

### Control AI Costs

1. **Set budget alerts**: Get notified before costs spike
2. **Monitor per-tenant usage**: Identify heavy users
3. **Optimize prompts**: Reduce token usage without losing quality

## Troubleshooting

See `TROUBLESHOOTING.md` for detailed troubleshooting steps.

Quick checks:

1. **Logs not appearing**: Check `OTLP_ENDPOINT` and `HYPERDX_API_KEY` in `.env`
2. **Metrics missing**: Ensure metrics are initialized in `route.ts`
3. **Wrong environment**: Verify `APP_URL` is set correctly
4. **Health check failing**: Test individual components manually

## Support

- **Documentation**: See `SETUP.md` and `TROUBLESHOOTING.md`
- **HyperDX Docs**: https://hyperdx.io/docs
- **OpenTelemetry Docs**: https://opentelemetry.io/docs
- **Internal Support**: Contact #engineering-ops on Slack

## Next Steps

1. ✅ Complete monitoring setup (CHAME-29)
2. Configure backup alerting (DataDog/CloudWatch)
3. Add custom business metrics (conversion rates, revenue, etc.)
4. Set up log retention policies
5. Create team-specific dashboards
6. Document runbooks for each alert

## License

Internal use only. See main repository LICENSE file.
