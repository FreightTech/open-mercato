# HyperDX Monitoring Setup Guide

Complete setup instructions for Open Mercato monitoring (CHAME-29).

## Prerequisites

- Node.js 18+ installed
- Open Mercato application running
- Access to HyperDX account (or ability to create one)
- Access to modify `.env` files

## Step-by-Step Setup

### 1. Create HyperDX Account

1. Visit https://hyperdx.io
2. Click "Sign Up"
3. Create account with email or GitHub
4. Choose plan:
   - **Free Tier**: Up to 500MB/month logs, 30-day retention
   - **Team**: Unlimited logs, 90-day retention, alerting
   - **Enterprise**: Custom retention, SLA, support

### 2. Get API Credentials

After signup:

1. Navigate to **Settings** → **API Keys**
2. Click "Create API Key"
3. Name: "Open Mercato Production"
4. Permissions: Select "Ingest" (OTLP)
5. Copy the API key (shown once!)
6. Note the OTLP endpoint: `https://in-otel.hyperdx.io`

### 3. Configure Environment Variables

Add to your `.env` file:

```bash
# HyperDX Configuration
OTLP_ENDPOINT=https://in-otel.hyperdx.io
HYPERDX_API_KEY=your-api-key-from-step-2

# Required for environment detection
APP_URL=https://yourdomain.com
# Examples:
# APP_URL=http://localhost:3000              → environment: development
# APP_URL=https://dev.4rcargo.freighttech.org → environment: development
# APP_URL=https://staging.yourdomain.com     → environment: staging
# APP_URL=https://inf.freighttech.org        → environment: production
```

**Environment Detection Rules:**
- URL contains `localhost`, `127.0.0.1`, `dev`, or `test` → `development`
- URL contains `staging` or `stage` → `staging`
- All other domains → `production`
- Detection is case-insensitive

**Important:** Do NOT commit `.env` with real API keys. Use environment variables in production.

### 4. Install Dependencies (Already Done)

The monitoring dependencies are already installed:

```json
{
  "@opentelemetry/api": "^1.9.0",
  "@opentelemetry/exporter-logs-otlp-proto": "^0.57.0",
  "@opentelemetry/exporter-metrics-otlp-proto": "^0.57.0",
  "@opentelemetry/instrumentation": "^0.57.0",
  "@opentelemetry/resources": "^1.30.0",
  "@opentelemetry/sdk-logs": "^0.57.0",
  "@opentelemetry/sdk-metrics": "^1.30.0",
  "@opentelemetry/sdk-node": "^0.57.0",
  "@opentelemetry/semantic-conventions": "^1.30.0"
}
```

If starting fresh, install with:
```bash
cd packages/logger
yarn add @opentelemetry/api @opentelemetry/exporter-logs-otlp-proto @opentelemetry/exporter-metrics-otlp-proto @opentelemetry/resources @opentelemetry/sdk-logs @opentelemetry/sdk-metrics @opentelemetry/sdk-node @opentelemetry/semantic-conventions
```

### 5. Verify Configuration

Start the application:

```bash
yarn dev
```

Check console for successful initialization:
```
[logger] OTLP logging initialized
[logger] Metrics provider initialized (60s interval)
[logger] Resource metrics started
```

### 6. Test Logging

Make a test request:

```bash
curl http://localhost:3000/api/health
```

Check HyperDX:
1. Open HyperDX web UI
2. Navigate to **Logs**
3. Search for: `url:"/api/health"`
4. Verify log entry appears with:
   - `environment` field
   - `timestamp`
   - `checks.database.status`

### 7. Import Dashboard

1. Download `hyperdx-dashboard.json` from `docs/monitoring/`
2. Open HyperDX web UI
3. Navigate to **Dashboards**
4. Click **Import Dashboard** button
5. Upload the JSON file
6. Verify all 24 widgets load
7. Pin dashboard to sidebar for easy access

**Troubleshooting:**
- If widgets show "No data", wait 1-2 minutes for metrics to populate
- If "error-rate" widget shows nothing, trigger an error: `curl http://localhost:3000/api/nonexistent`
- If "ai-tokens-consumed" is empty, open AI chat and send a message

### 8. Configure Alerts

#### Option A: Manual Alert Creation (Recommended for First Setup)

For each alert in `alerts.yaml`:

1. Navigate to **Alerts** in HyperDX
2. Click "Create Alert"
3. Fill in fields:
   - **Name**: From `alerts.yaml` (e.g., "System Health Degraded")
   - **Query**: From `alerts.yaml` (e.g., `message:"health_check" AND checks.*.status:degraded`)
   - **Condition**: From `condition` section
   - **Window**: From `window` field
   - **Severity**: From `severity` field
4. Configure notification channel (see step 9)
5. Click "Save Alert"
6. Test with "Send Test Alert" button

#### Option B: Import via API (Advanced)

HyperDX may support importing alerts via API. Check their docs for current API capabilities.

### 9. Configure Notification Channels

#### Slack Integration

1. Create Slack webhook:
   - Open Slack workspace settings
   - Navigate to **Apps** → **Incoming Webhooks**
   - Click "Add to Slack"
   - Choose channel (e.g., `#ops-alerts`)
   - Copy webhook URL
   
2. In HyperDX:
   - Navigate to **Settings** → **Notification Channels**
   - Click "Add Channel"
   - Select "Slack"
   - Paste webhook URL
   - Name: "slack-ops"
   - Test connection
   - Save

3. Update `.env` (optional, for programmatic access):
   ```bash
   SLACK_WEBHOOK_OPS=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

#### PagerDuty Integration

1. Create PagerDuty integration:
   - Open PagerDuty service settings
   - Navigate to **Integrations** → **Add Integration**
   - Select "Events API v2"
   - Copy Integration Key

2. In HyperDX:
   - Navigate to **Settings** → **Notification Channels**
   - Click "Add Channel"
   - Select "PagerDuty"
   - Paste integration key
   - Name: "pagerduty"
   - Test connection
   - Save

3. Update `.env` (optional):
   ```bash
   PAGERDUTY_INTEGRATION_KEY=your-integration-key
   ```

#### Email Integration

1. In HyperDX:
   - Navigate to **Settings** → **Notification Channels**
   - Click "Add Channel"
   - Select "Email"
   - Add recipient emails (comma-separated)
   - Name: "email-engineering"
   - Save

2. Verify email delivery with test alert

### 10. Set Up Health Check Monitoring

The health check endpoint is already implemented at `/api/health`.

#### External Monitoring

Configure external monitoring service (e.g., UptimeRobot, Pingdom):

1. Monitor URL: `https://yourdomain.com/api/health`
2. Check interval: 5 minutes
3. Timeout: 10 seconds
4. Success condition: HTTP 200 AND `status: "ok"` in JSON

Example with curl:
```bash
curl -s https://yourdomain.com/api/health | jq -r '.status'
# Output: ok
```

Alert if:
- HTTP status ≠ 200
- `status` field ≠ "ok"
- Request timeout (>10s)

#### Health Check Dashboard Widget

The health check widget in the dashboard shows real-time status of:
- Database (PostgreSQL)
- Redis
- NATS
- Meilisearch

Set up alert in HyperDX:
```yaml
Query: message:"health_check" AND checks.*.status:degraded
Condition: >= 1 in 5 minutes
Severity: Critical
```

### 11. Verify Metrics

Check that metrics are being exported:

1. Open HyperDX web UI
2. Navigate to **Metrics Explorer**
3. Search for metrics:
   - `system.cpu.percent`
   - `system.memory.used_mb`
   - `nodejs.event_loop.lag_ms`
   - `ai.tokens.consumed`
   - `fms.documents.created`

4. If metrics are missing:
   - Check console for: `[logger] Metrics provider initialized`
   - Verify metrics export every 60 seconds
   - Check OTLP endpoint and API key

### 12. Test FMS Document Tracking

1. Upload a document via FMS UI
2. Wait for extraction to complete
3. Check HyperDX logs:

```
# Document creation
message:"fms.document.created"

# Extraction lifecycle
message:"fms.document.extraction.started"
message:"fms.document.extraction.completed"

# Or failures
message:"fms.document.extraction.failed"
```

4. Check metrics in dashboard:
   - "Documents Created" widget
   - "Documents Extracted" widget
   - "Extraction Duration (P95)" widget

### 13. Test AI Token Tracking

1. Open AI chat in application
2. Send a message
3. Check HyperDX logs:

```
message:"ai.tokens.consumed"
```

4. Verify fields:
   - `inputTokens`
   - `outputTokens`
   - `totalTokens`
   - `model`
   - `provider`

5. Check dashboard widgets:
   - "AI Tokens Consumed"
   - "AI Tokens by Type"
   - "AI Cost Estimate"

### 14. Configure Log Retention

1. Navigate to **Settings** → **Data Retention**
2. Set retention periods:
   - **Development**: 7 days
   - **Staging**: 30 days
   - **Production**: 90 days

3. Configure sampling (optional):
   - Sample 100% of errors
   - Sample 10% of info logs
   - Sample 1% of debug logs

### 15. Set Up Team Access

1. Navigate to **Settings** → **Team**
2. Invite team members:
   - Engineering: Full access
   - Operations: Full access
   - Product: Read-only access
   - Support: Read-only access

3. Configure roles:
   - **Admin**: Full dashboard/alert management
   - **Editor**: Create/edit dashboards
   - **Viewer**: View-only access

## Production Deployment

### Environment-Specific Configuration

Create separate API keys for each environment:

1. **Development**: `HYPERDX_API_KEY_DEV`
2. **Staging**: `HYPERDX_API_KEY_STAGING`
3. **Production**: `HYPERDX_API_KEY_PROD`

Use environment variables in deployment:

```bash
# Vercel
vercel env add HYPERDX_API_KEY production

# AWS/ECS
# Add to task definition environment variables

# Docker
docker run -e HYPERDX_API_KEY=xxx ...

# Kubernetes
# Add to ConfigMap or Secret
```

### Security Best Practices

1. **Never commit API keys**: Use `.env.local` for local development
2. **Rotate keys regularly**: Every 90 days minimum
3. **Use separate keys per environment**: Isolate development from production
4. **Restrict API key permissions**: Only enable "Ingest" permission
5. **Monitor API key usage**: Set up alerts for unexpected usage spikes

### Performance Considerations

1. **Log levels**:
   - Development: `DEBUG`
   - Staging: `INFO`
   - Production: `INFO` or `WARN`

2. **Metric export interval**:
   - Already set to 60 seconds (good balance)
   - Don't reduce below 30 seconds (increases load)

3. **Sampling**:
   - High-volume endpoints: Consider sampling
   - Business-critical events: Always log 100%

## Verification Checklist

After setup, verify:

- [ ] Logs appear in HyperDX within 30 seconds
- [ ] Environment field is correct (development/staging/production)
- [ ] All 24 dashboard widgets show data
- [ ] Metrics export every 60 seconds
- [ ] Health check endpoint returns 200
- [ ] AI token tracking works (send test chat message)
- [ ] Document tracking works (upload test document)
- [ ] Alerts are configured and tested
- [ ] Notification channels receive test alerts
- [ ] Team members have access
- [ ] External health monitoring is active

## Next Steps

1. **Create runbooks**: Document how to respond to each alert
2. **Schedule reviews**: Weekly dashboard reviews with team
3. **Tune alerts**: Adjust thresholds based on actual usage
4. **Add custom metrics**: Track business-specific KPIs
5. **Set up SLOs**: Define service level objectives
6. **Document incidents**: Use HyperDX for post-mortems

## Support

- HyperDX Docs: https://hyperdx.io/docs
- OpenTelemetry Docs: https://opentelemetry.io/docs
- Internal Troubleshooting: See `TROUBLESHOOTING.md`
- Slack Channel: #engineering-ops
