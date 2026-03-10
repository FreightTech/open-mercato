# HyperDX API Guide

This guide covers how to programmatically manage HyperDX dashboards and alerts using the REST API. Use this for automated dashboard provisioning, backup/restore, and CI/CD integration.

## Prerequisites

### API Base URL

```
https://api.hyperdx.io
```

### Authentication

All API requests require a Personal API Key passed as a Bearer token:

```bash
curl --request GET \
  --url https://api.hyperdx.io/api/v1/dashboards \
  --header 'Authorization: Bearer YOUR_PERSONAL_API_KEY'
```

### Obtaining an API Key

1. Log in to HyperDX web UI
2. Navigate to **Settings** > **API Keys**
3. Click **Create API Key**
4. Copy the key (it won't be shown again)
5. Store securely (e.g., in `.env` or secrets manager)

```bash
# Add to .env.local (never commit this file)
HYPERDX_API_KEY=your_api_key_here
```

## Dashboard API

### List All Dashboards

```bash
curl --request GET \
  --url https://api.hyperdx.io/api/v1/dashboards \
  --header "Authorization: Bearer $HYPERDX_API_KEY"
```

### Get Dashboard by ID

```bash
curl --request GET \
  --url https://api.hyperdx.io/api/v1/dashboards/YOUR_DASHBOARD_ID \
  --header "Authorization: Bearer $HYPERDX_API_KEY"
```

### Create Dashboard

```bash
curl --request POST \
  --url https://api.hyperdx.io/api/v1/dashboards \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "My Dashboard",
    "query": "",
    "charts": [...]
  }'
```

### Update Dashboard

```bash
curl --request PUT \
  --url https://api.hyperdx.io/api/v1/dashboards/YOUR_DASHBOARD_ID \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "My Dashboard (Updated)",
    "query": "",
    "charts": [...]
  }'
```

### Delete Dashboard

```bash
curl --request DELETE \
  --url https://api.hyperdx.io/api/v1/dashboards/YOUR_DASHBOARD_ID \
  --header "Authorization: Bearer $HYPERDX_API_KEY"
```

## Chart Configuration

### Chart Object Structure

```json
{
  "id": "unique-chart-id",
  "name": "Chart Title",
  "x": 0,
  "y": 0,
  "w": 4,
  "h": 2,
  "series": [...]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique identifier for the chart (optional on create) |
| `name` | String | Display name shown in dashboard |
| `x`, `y` | Number | Grid position (0-based) |
| `w`, `h` | Number | Width and height in grid units |
| `asRatio` | Boolean | Treat series[0] / series[1] as a ratio |
| `series` | Array | Data series configuration |

### Series Configuration

```json
{
  "type": "time",
  "dataSource": "events",
  "aggFn": "count",
  "field": "",
  "where": "level:error",
  "groupBy": ["brandId"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | String | Chart type (see below) |
| `dataSource` | String | `events` (logs/spans) or `metrics` |
| `aggFn` | String | Aggregation function (see below) |
| `field` | String | Field to aggregate (optional for `count`) |
| `where` | String | Search query filter |
| `groupBy` | Array | Fields to group by |
| `metricDataType` | String | For metrics: `Sum`, `Gauge`, or `Histogram` |

### Chart Types

| Type | Description | Use Case |
|------|-------------|----------|
| `time` | Time series line/area chart | Trends over time |
| `histogram` | Distribution histogram | Value distributions |
| `number` | Single number display | KPIs, totals |
| `table` | Data table | Lists, details |
| `search` | Search results | Log entries |
| `markdown` | Static markdown text | Documentation |

### Aggregation Functions

**Standard aggregations:**
- `count` - Count of events (no field required)
- `count_distinct` - Unique count of field values
- `sum` - Sum of field values
- `avg` - Average of field values
- `min` - Minimum value
- `max` - Maximum value
- `p50` - 50th percentile
- `p90` - 90th percentile
- `p95` - 95th percentile
- `p99` - 99th percentile

**Rate aggregations (for Sum-type metrics only):**
- `avg_rate`, `sum_rate`, `min_rate`, `max_rate`
- `p50_rate`, `p90_rate`, `p95_rate`, `p99_rate`

### Search Query Syntax

Use the same syntax as HyperDX search UI:

```
# Exact match
level:error

# Field exists
brandId:*

# Multiple conditions
level:error AND module:shipment-tracking

# OR conditions
level:error OR level:warn

# Negation
NOT level:debug

# Numeric comparison
durationMs:>1000

# Phrase match
message:"Rate limit exceeded"
```

See `hyperdx-queries.md` for more query patterns.

## Alerts API

### Create Alert

```bash
curl --request POST \
  --url https://api.hyperdx.io/api/v1/alerts \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "High Error Rate",
    "interval": "5m",
    "threshold": 100,
    "threshold_type": "above",
    "source": "chart",
    "dashboardId": "YOUR_DASHBOARD_ID",
    "chartId": "YOUR_CHART_ID",
    "message": "Error rate exceeded threshold",
    "channel": {
      "type": "email",
      "recipients": ["ops@example.com"]
    }
  }'
```

### Alert Configuration

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Alert name |
| `interval` | String | Check frequency: `1m`, `5m`, `15m`, `30m`, `1h`, `6h`, `12h`, `1d` |
| `threshold` | Number | Threshold value |
| `threshold_type` | String | `above` or `below` |
| `source` | String | `chart` or `search` |
| `dashboardId` | String | Dashboard ID (for chart alerts) |
| `chartId` | String | Chart ID (for chart alerts) |
| `savedSearchId` | String | Saved search ID (for search alerts) |
| `message` | String | Custom alert message |
| `channel` | Object | Notification channel configuration |

### Alert Channels

**Email:**
```json
{
  "type": "email",
  "recipients": ["user1@example.com", "user2@example.com"]
}
```

**Slack:**
```json
{
  "type": "slack",
  "channelId": "C0123456789"
}
```

**PagerDuty:**
```json
{
  "type": "pagerduty",
  "severity": "critical"
}
```

**Opsgenie:**
```json
{
  "type": "opsgenie",
  "webhookId": "YOUR_WEBHOOK_ID",
  "priority": "P1"
}
```

### List Alerts

```bash
curl --request GET \
  --url https://api.hyperdx.io/api/v1/alerts \
  --header "Authorization: Bearer $HYPERDX_API_KEY"
```

### Update Alert

```bash
curl --request PUT \
  --url https://api.hyperdx.io/api/v1/alerts/YOUR_ALERT_ID \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "threshold": 200
  }'
```

### Delete Alert

```bash
curl --request DELETE \
  --url https://api.hyperdx.io/api/v1/alerts/YOUR_ALERT_ID \
  --header "Authorization: Bearer $HYPERDX_API_KEY"
```

## Query Chart Data

Query data directly without creating a dashboard:

```bash
curl --request POST \
  --url https://api.hyperdx.io/api/v1/charts/series \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "startTime": 1706131488903,
    "endTime": 1706135088919,
    "granularity": "1 minute",
    "seriesReturnType": "column",
    "series": [
      {
        "dataSource": "events",
        "aggFn": "count",
        "field": "",
        "where": "level:error",
        "groupBy": ["brandId"]
      }
    ]
  }'
```

### Granularity Options

`30 second`, `1 minute`, `5 minute`, `10 minute`, `15 minute`, `30 minute`, `1 hour`, `2 hour`, `6 hour`, `12 hour`, `1 day`, `2 day`, `7 day`, `30 day`

## Open Mercato Examples

### Example 1: Errors by Brand Chart

Creates a time series chart showing error counts grouped by brand:

```bash
curl --request POST \
  --url https://api.hyperdx.io/api/v1/dashboards \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Application Errors",
    "query": "",
    "charts": [
      {
        "id": "errors-by-brand",
        "name": "Errors by Brand",
        "x": 0,
        "y": 0,
        "w": 6,
        "h": 2,
        "series": [
          {
            "type": "time",
            "dataSource": "events",
            "aggFn": "count",
            "field": "",
            "where": "level:error",
            "groupBy": ["brandId"]
          }
        ]
      }
    ]
  }'
```

### Example 2: Carrier API Monitoring Dashboard

Creates a dashboard for shipment tracking carrier monitoring:

```bash
curl --request POST \
  --url https://api.hyperdx.io/api/v1/dashboards \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Carrier Monitoring",
    "query": "module:shipment-tracking",
    "charts": [
      {
        "id": "calls-by-carrier",
        "name": "API Calls by Carrier",
        "x": 0,
        "y": 0,
        "w": 4,
        "h": 2,
        "series": [
          {
            "type": "time",
            "dataSource": "events",
            "aggFn": "count",
            "field": "",
            "where": "module:shipment-tracking",
            "groupBy": ["carrierCode"]
          }
        ]
      },
      {
        "id": "carrier-errors",
        "name": "Carrier API Errors",
        "x": 4,
        "y": 0,
        "w": 4,
        "h": 2,
        "series": [
          {
            "type": "time",
            "dataSource": "events",
            "aggFn": "count",
            "field": "",
            "where": "module:shipment-tracking AND level:error",
            "groupBy": ["carrierCode"]
          }
        ]
      },
      {
        "id": "carrier-latency",
        "name": "Carrier API Latency (P95)",
        "x": 8,
        "y": 0,
        "w": 4,
        "h": 2,
        "series": [
          {
            "type": "time",
            "dataSource": "events",
            "aggFn": "p95",
            "field": "durationMs",
            "where": "module:shipment-tracking AND operation:fetchEvents",
            "groupBy": ["carrierCode"]
          }
        ]
      },
      {
        "id": "rate-limited",
        "name": "Rate Limited Requests",
        "x": 0,
        "y": 2,
        "w": 6,
        "h": 2,
        "series": [
          {
            "type": "time",
            "dataSource": "events",
            "aggFn": "count",
            "field": "",
            "where": "module:shipment-tracking AND \"Rate limit check\" AND allowed:false",
            "groupBy": ["carrierCode"]
          }
        ]
      }
    ]
  }'
```

### Example 3: Carrier Error Alert

Creates an alert that fires when carrier API errors exceed threshold:

```bash
# First, get the dashboard and chart IDs from the previous example
DASHBOARD_ID="your_dashboard_id"
CHART_ID="carrier-errors"

curl --request POST \
  --url https://api.hyperdx.io/api/v1/alerts \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data "{
    \"name\": \"Carrier API Errors High\",
    \"interval\": \"5m\",
    \"threshold\": 10,
    \"threshold_type\": \"above\",
    \"source\": \"chart\",
    \"dashboardId\": \"$DASHBOARD_ID\",
    \"chartId\": \"$CHART_ID\",
    \"message\": \"Carrier API error rate exceeded 10 errors in 5 minutes\",
    \"channel\": {
      \"type\": \"email\",
      \"recipients\": [\"ops@example.com\"]
    }
  }"
```

### Example 4: Dashboard Backup Script

```bash
#!/bin/bash
# backup-dashboards.sh
# Backs up all HyperDX dashboards to JSON files

set -e

HYPERDX_API_KEY="${HYPERDX_API_KEY:?Missing HYPERDX_API_KEY}"
BACKUP_DIR="./hyperdx-backups/$(date +%Y-%m-%d)"

mkdir -p "$BACKUP_DIR"

# Get list of dashboards
dashboards=$(curl -s \
  --url https://api.hyperdx.io/api/v1/dashboards \
  --header "Authorization: Bearer $HYPERDX_API_KEY")

# Extract dashboard IDs and names
echo "$dashboards" | jq -r '.data[] | "\(.id) \(.name)"' | while read -r id name; do
  # Sanitize name for filename
  filename=$(echo "$name" | tr ' ' '-' | tr -cd '[:alnum:]-')
  
  echo "Backing up: $name -> $BACKUP_DIR/$filename.json"
  
  curl -s \
    --url "https://api.hyperdx.io/api/v1/dashboards/$id" \
    --header "Authorization: Bearer $HYPERDX_API_KEY" \
    | jq '.data' > "$BACKUP_DIR/$filename.json"
done

echo "Backup complete: $BACKUP_DIR"
```

### Example 5: Dashboard Restore Script

```bash
#!/bin/bash
# restore-dashboard.sh
# Restores a dashboard from a JSON backup file

set -e

HYPERDX_API_KEY="${HYPERDX_API_KEY:?Missing HYPERDX_API_KEY}"
BACKUP_FILE="${1:?Usage: restore-dashboard.sh <backup-file.json>}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: File not found: $BACKUP_FILE"
  exit 1
fi

# Read backup and create new dashboard
dashboard=$(cat "$BACKUP_FILE")
name=$(echo "$dashboard" | jq -r '.name')

echo "Restoring dashboard: $name"

response=$(curl -s \
  --request POST \
  --url https://api.hyperdx.io/api/v1/dashboards \
  --header "Authorization: Bearer $HYPERDX_API_KEY" \
  --header "Content-Type: application/json" \
  --data "$dashboard")

new_id=$(echo "$response" | jq -r '.data.id')

echo "Dashboard restored with ID: $new_id"
echo "URL: https://app.hyperdx.io/dashboards/$new_id"
```

## Best Practices

### 1. Version Control Dashboard JSON

Store dashboard configurations in your repository:

```
docs/monitoring/
├── dashboards/
│   ├── application-errors.json
│   ├── carrier-monitoring.json
│   └── llm-usage.json
└── alerts/
    ├── critical-alerts.json
    └── warning-alerts.json
```

### 2. Use Consistent Chart IDs

When updating dashboards, use consistent chart IDs to avoid duplicates:

```json
{
  "id": "errors-by-brand",  // Always use the same ID
  "name": "Errors by Brand",
  ...
}
```

### 3. Test Queries in UI First

Before automating, verify queries work in HyperDX search:

1. Go to HyperDX Search
2. Enter your query (e.g., `module:shipment-tracking AND level:error`)
3. Verify results match expectations
4. Copy query to API configuration

### 4. Use Global Dashboard Filters

Set a global filter on the dashboard to scope all charts:

```json
{
  "name": "Carrier Monitoring",
  "query": "module:shipment-tracking",  // Global filter
  "charts": [...]
}
```

### 5. Validate API Responses

Always check for errors in API responses:

```bash
response=$(curl -s -w "\n%{http_code}" ...)
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" != "200" ]; then
  echo "Error: $body"
  exit 1
fi
```

## Open Mercato Dashboard IDs

Reference dashboard IDs for our monitoring setup:

| Dashboard | ID | Description |
|-----------|-----|-------------|
| Application Errors | `69b030d5fa2ef23c75ebd1fc` | Error tracking and analysis |
| Carriers | `6915ed3aeb510b27986fc8c4` | Shipment tracking carrier monitoring |
| Brand Activities | `69b030d607e483584337aea9` | Per-brand activity metrics |
| LLM Token Usage | `69b030d6fa2ef23c75ebd201` | AI/LLM cost and usage tracking |

## Log Fields Reference

Fields available for filtering and grouping in Open Mercato:

### Common Fields

| Field | Description | Example Values |
|-------|-------------|----------------|
| `level` | Log level | `debug`, `info`, `warn`, `error` |
| `message` | Log message | `"Fetching events from carrier"` |
| `tenantId` | Tenant identifier | UUID |
| `organizationId` | Organization identifier | UUID |
| `brandId` | Brand identifier | `freighttech`, `openmercato` |
| `userId` | User identifier | UUID |
| `environment` | Deployment environment | `development`, `staging`, `production` |

### Shipment Tracking Fields

| Field | Description | Example Values |
|-------|-------------|----------------|
| `module` | Module identifier | `shipment-tracking` |
| `carrierCode` | Carrier identifier | `maersk`, `msc`, `zim`, `hapag-lloyd`, `cma-cgm`, `cosco`, `evergreen` |
| `operation` | API operation | `fetchEvents`, `authenticate` |
| `durationMs` | Operation duration | `1234` |
| `trackingJobId` | Tracking job identifier | UUID |
| `allowed` | Rate limit result | `true`, `false` |

### HTTP Fields

| Field | Description | Example Values |
|-------|-------------|----------------|
| `http.method` | HTTP method | `GET`, `POST`, `PUT`, `DELETE` |
| `http.route` | API route pattern | `/api/shipments/[id]/track` |
| `http.status_code` | Response status | `200`, `404`, `500` |
| `http.target` | Request path | `/api/shipments/123/track` |

## Related Documentation

- [HyperDX Official API Docs](https://www.hyperdx.io/docs/api/dashboards)
- [Query Reference](./hyperdx-queries.md) - Search query patterns and examples
- [Dashboard JSON](./hyperdx-dashboard.json) - Pre-built dashboard for UI import
- [Alerts Configuration](./alerts.yaml) - Alert definitions
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
