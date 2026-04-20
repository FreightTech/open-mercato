# HyperDX Query Reference

This document provides a reference for all queries used in the Open Mercato HyperDX dashboard (CHAME-29).

## Error Monitoring

### Error Rate
```
level:error
```
Aggregation: count  
Purpose: Track total error count over time

### Top Errors
```
level:error
```
Aggregation: count, group by `message`  
Purpose: Identify most frequent error messages

## Performance Metrics

### Request Rate
```
*
```
Aggregation: count, group by `level`  
Purpose: Track overall system request volume

### Response Time (P95)
```
http.status_code:*
```
Aggregation: p95 on `durationMs`  
Purpose: Monitor API response time performance

### Slow Queries
```
durationMs:>1000
```
Aggregation: latest  
Purpose: Identify requests taking longer than 1 second

## AI Usage Metrics

### AI Tokens Consumed
```
message:"ai.tokens.consumed"
```
Aggregation: sum on `totalTokens`, group by `model`  
Purpose: Track token consumption by AI model

### AI Tokens by Type
```
message:"ai.tokens.consumed"
```
Aggregation: sum, group by `type` (input/output/total)  
Purpose: Break down token usage by type

### AI Cost Estimate
```
message:"ai.tokens.consumed"
```
Aggregation: custom formula  
Formula: `(sum(inputTokens) * 0.003 / 1000) + (sum(outputTokens) * 0.015 / 1000)`  
Purpose: Estimate AI costs in USD (Claude 3.5 Sonnet pricing)

**Cost Assumptions:**
- Input tokens: $0.003 per 1K tokens
- Output tokens: $0.015 per 1K tokens
- Model: Claude 3.5 Sonnet

## FMS Document Lifecycle

### Documents Created
```
message:"fms.document.created"
```
Aggregation: count, group by `category`  
Purpose: Track document creation by category

### Documents Extracted
```
message:"fms.document.extraction.completed"
```
Aggregation: count, group by `documentType`  
Purpose: Track successful extractions by document type

### Extraction Duration (P95)
```
message:"fms.document.extraction.completed"
```
Aggregation: p95 on `durationMs`  
Purpose: Monitor extraction performance

### Extraction Success Rate
```
message:("fms.document.extraction.completed" OR "fms.document.extraction.failed")
```
Aggregation: custom formula  
Formula: `(count(message:"fms.document.extraction.completed") / (count(message:"fms.document.extraction.completed") + count(message:"fms.document.extraction.failed"))) * 100`  
Purpose: Calculate percentage of successful extractions

### Documents Updated
```
message:"fms.document.updated"
```
Aggregation: count  
Purpose: Track document update frequency

### Documents Deleted
```
message:"fms.document.deleted"
```
Aggregation: count  
Purpose: Track document deletion frequency

### Invoices Created
```
message:"fms.invoice.created"
```
Aggregation: count  
Purpose: Track invoice creation frequency

### Extraction Confidence Distribution
```
message:"fms.document.extraction.completed"
```
Aggregation: count, group by `confidence`  
Purpose: Visualize extraction confidence levels (HIGH/MEDIUM/LOW)

## System Health

### System Health
```
message:"health_check" OR url:"/api/health"
```
Aggregation: latest  
Columns: `checks.database.status`, `checks.redis.status`, `checks.nats.status`, `checks.meilisearch.status`  
Purpose: Monitor infrastructure component health

### CPU Usage
```
metric.name:"system.cpu.percent"
```
Aggregation: avg on `value`  
Purpose: Track CPU utilization percentage

### Memory Usage
```
metric.name:"system.memory.used_mb"
```
Aggregation: avg on `value`  
Purpose: Track memory consumption in megabytes

### Event Loop Lag
```
metric.name:"nodejs.event_loop.lag_ms"
```
Aggregation: p95 on `value`  
Purpose: Monitor Node.js event loop responsiveness

## Business Metrics

### Active Users
```
userId:*
```
Aggregation: cardinality on `userId`  
Purpose: Count unique active users

### Requests by Tenant
```
tenantId:*
```
Aggregation: count, group by `tenantId`  
Purpose: Track usage distribution across tenants

### Requests by Environment
```
environment:*
```
Aggregation: count, group by `environment` (development/staging/production)  
Purpose: Monitor traffic by environment

## Webhook Monitoring

### Webhook Delivery Rate
```
message:("webhook.delivery.success" OR "webhook.delivery.failure")
```
Aggregation: count, group by `status`  
Purpose: Track webhook delivery success/failure rate

**Note:** Webhook tracking is already implemented and does not require changes per CHAME-29.

## Query Patterns

### Time Ranges
- `5m` - Last 5 minutes (health checks)
- `1h` - Last hour (real-time monitoring)
- `24h` - Last 24 hours (daily trends)

### Field Filtering
- `field:value` - Exact match
- `field:>1000` - Greater than
- `field:<1000` - Less than
- `field:*` - Field exists

### Logical Operators
- `AND` - Both conditions must match
- `OR` - Either condition must match
- `NOT` - Condition must not match

### Grouping
Use `group by` to break down results by dimension:
- `tenantId` - Per tenant
- `organizationId` - Per organization
- `category` - Document category
- `model` - AI model

### Aggregations
- `count` - Total number of events
- `sum` - Sum of field values
- `avg` - Average of field values
- `p95` - 95th percentile
- `p99` - 99th percentile
- `cardinality` - Unique count
- `latest` - Most recent value

## Log Event Reference

### AI Events
- `ai.tokens.consumed` - AI token usage tracking

### FMS Document Events
- `fms.document.created` - Document creation
- `fms.document.extraction.started` - Extraction begins
- `fms.document.extraction.completed` - Extraction succeeds
- `fms.document.extraction.failed` - Extraction fails
- `fms.document.updated` - Document updated
- `fms.document.deleted` - Document deleted
- `fms.invoice.created` - Invoice created

### System Events
- `health_check` - Health check results

## Metric Reference

### System Metrics
- `system.cpu.percent` - CPU usage percentage
- `system.memory.used_mb` - Memory usage in MB
- `nodejs.event_loop.lag_ms` - Event loop lag in milliseconds

### Custom Metrics
- `ai.tokens.consumed` - AI token counter (input/output/total)
- `fms.documents.created` - Document creation counter
- `fms.documents.extracted` - Extraction counter (success/failure)
- `fms.documents.extraction.duration` - Extraction duration histogram
- `fms.documents.updated` - Document update counter
- `fms.documents.deleted` - Document deletion counter
- `fms.invoices.created` - Invoice creation counter

## Dashboard Best Practices

1. **Use appropriate time ranges**: 5m for health, 1h for real-time, 24h for trends
2. **Set alerts on P95 metrics**: Catch performance degradation early
3. **Monitor error rate alongside request rate**: Understand error percentage
4. **Track AI costs daily**: Set budget alerts
5. **Check extraction success rate**: Identify quality issues
6. **Monitor system health continuously**: 5-minute refresh for infrastructure checks
7. **Group by tenant/organization**: Identify per-customer issues
8. **Use cardinality for active users**: Avoid double-counting

## Alert Threshold Recommendations

See `alerts.yaml` for complete alert configuration.

### Critical Alerts (immediate action)
- Health status: degraded
- Error rate: >100/min
- P95 response time: >3s
- Extraction success rate: <80%

### Warning Alerts (investigation needed)
- CPU usage: >80%
- Memory usage: >4GB
- Event loop lag: >100ms P95
- Extraction duration: >30s P95

### Budget Alerts
- AI tokens: >1M/day
- AI cost: >$50/day
