# Shipment Tracking Module Specification

## Overview

The Shipment Tracking module (`@open-mercato/shipment-tracking`) provides ocean container shipment visibility with carrier-agnostic polling, automatic status derivation, cargo event ingestion, and webhook notifications. It replaces an external NestJS-based shipment tracking API with a native open-mercato module.

**Package Location:** `packages/shipment-tracking/`
**Module ID:** `shipment_tracking`
**Module Registration:** `{ id: 'shipment_tracking', from: '@open-mercato/shipment-tracking' }`

## Problem Statement

External shipment tracking was handled by a standalone NestJS API with tight AWS coupling (SQS queues, separate database). This created operational overhead, data silos, and made it impossible to leverage open-mercato's built-in multi-tenancy, event bus, caching, and admin UI.

## Architecture

### High-Level Design

```
┌──────────────────────────────────────────────────────────┐
│ Admin UI (list/detail pages)                             │
├──────────────────────────────────────────────────────────┤
│ API Layer (CRUD routes via makeCrudRoute)                │
├──────────────────────────────────────────────────────────┤
│ Commands (create/update/delete/pause/resume/deactivate)  │
├──────────────────────────────────────────────────────────┤
│ Services                                                 │
│ ┌────────────────┐ ┌──────────────┐ ┌────────────────┐  │
│ │ TrackingService│ │CarrierRegistry│ │ WebhookService │  │
│ └───────┬────────┘ └──────┬───────┘ └───────┬────────┘  │
│         │                 │                  │           │
│ ┌───────┴─────────────────┴──────────────────┴────────┐  │
│ │ Domain Logic (lib/)                                 │  │
│ │ - status-machine    - time-extraction               │  │
│ │ - rate-limiter      - schedule-generator             │  │
│ │ - carrier-adapter   - webhook-dispatcher             │  │
│ └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Workers                         │ Subscribers            │
│ - tracking-poll.worker          │ - status-changed       │
│ - webhook-delivery.worker       │ - cargo-event-created  │
├──────────────────────────────────────────────────────────┤
│ Data Layer (MikroORM entities)                           │
│ 6 entities, all multi-tenant                             │
└──────────────────────────────────────────────────────────┘
```

### Carrier Adapter Pattern

Carriers are integrated via a pluggable `CarrierAdapter` interface. Seven concrete adapters for major ocean carriers are bundled and auto-registered at DI startup via `registerAllAdapters()`. Additional adapters can be registered at runtime via the `CarrierRegistryService` DI singleton.

```typescript
interface CarrierAdapter {
  readonly carrierName: string
  readonly supportedReferenceTypes: TrackingReferenceType[]

  fetchEvents(input: {
    referenceType: TrackingReferenceType
    referenceValue: string
    apiEndpoint?: string | null
    authConfig?: Record<string, unknown> | null
  }): Promise<CarrierFetchResult>

  testConnection(input: {
    apiEndpoint?: string | null
    authConfig?: Record<string, unknown> | null
  }): Promise<CarrierAdapterTestResult>
}
```

To add a new carrier:
1. Implement the `CarrierAdapter` interface
2. Register it in your app's DI setup or a module `di.ts`: `carrierRegistry.register(new MyCarrierAdapter())`
3. Create a `CarrierConfig` row with API credentials for the carrier

### Built-in Carrier Adapters

The module ships with 7 adapters covering major ocean carriers. Six use DCSA-compliant APIs (shared parsing logic), while Cosco uses a proprietary API requiring custom CS-code-to-DCSA mapping.

#### Shared Utilities

Shared code is extracted into reusable modules under `lib/` to avoid duplication across the 6 DCSA carriers:

| File | Export | Description |
|------|--------|-------------|
| `lib/auth/base64url.ts` | `base64UrlEncode()` | base64url encoding (RFC 7515) for JWT headers and signatures |
| `lib/auth/oauth-client.ts` | `fetchOAuthToken()` | Reusable OAuth 2.0 `client_credentials` flow via native `fetch`. Supports `authMethod: 'body'` (form data) or `'basic'` (Authorization header) |
| `lib/dcsa-params.ts` | `buildDcsaQueryParams()` | Maps `TrackingReferenceType` to DCSA query parameters (`equipmentReference`, `carrierBookingReference`, `transportDocumentReference`) |
| `lib/dcsa-event-parser.ts` | `parseDcsaEvents()` | Converts raw DCSA API responses into `CarrierFetchedEvent[]`. Handles both `{ events: [...] }` and direct array `[...]` response shapes. Extracts event ID, type, code, classification, datetime, location, vessel, and voyage from standard DCSA fields |

#### DCSA-Compliant Adapters

| Adapter | `carrierName` | Auth Method | API Endpoint | Response Shape |
|---------|---------------|-------------|--------------|----------------|
| `MaerskAdapter` | `maersk` | OAuth 2.0 (body) + `Consumer-Key` header | `https://api.maersk.com/track-and-trace-private/events` | `{ events }` |
| `MscAdapter` | `msc` | PFX certificate -> RS256 JWT -> Azure AD token exchange | `https://api.tech.msc.com/msc/trackandtrace/v2.2/events` | Direct array |
| `ZimAdapter` | `zim` | OAuth 2.0 (body) + `Ocp-Apim-Subscription-Key` header | `https://apigw.zim.com/trackAndTrace/v1` | `{ events }` |
| `HapagLloydAdapter` | `hapag-lloyd` | API key headers (`X-IBM-Client-Id`, `X-IBM-Client-Secret`) | `https://api.hlag.com/hlag/external/v2/events` | Direct array |
| `CmaCgmAdapter` | `cma-cgm` | API key header (`keyId`) | `https://apis.cma-cgm.net/operation/trackandtrace/v1/events` | Direct array |
| `EvergreenAdapter` | `evergreen` | OAuth 2.0 (Basic auth) + configurable `token_url` | `{apiEndpoint}apimg/tnt/v2/events` | Direct array |

All DCSA adapters follow the same structure:
1. Authenticate (varies per carrier)
2. Build URL + query params via `buildDcsaQueryParams()`
3. Call API with native `fetch`
4. Parse events with `parseDcsaEvents()`
5. Return `CarrierFetchResult`

#### MSC Authentication (Complex)

MSC uses a PFX certificate-based flow:
1. PFX buffer (from `authConfig.certificate_base64`) is extracted via `openssl pkcs12` (using `execFileSync` for safe subprocess execution)
2. The last certificate in the chain provides the `x5t` (SHA-1 thumbprint, base64url-encoded) for the JWT header
3. An RS256 JWT is created with the private key, targeting Azure AD
4. The JWT is exchanged for an access token via Microsoft's OAuth endpoint with `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`

#### Cosco Adapter (Non-DCSA)

Cosco uses a proprietary API (`POST https://apis.cargosmart.com/openapi/cs2/ctvc/COSU`) that returns data in a custom format. The adapter includes:

- **CS-to-DCSA Event Code Mapping** (19 codes):

| CS Code | DCSA Event Type | Event Code | Classification | Description |
|---------|----------------|------------|----------------|-------------|
| CS010 | EQUIPMENT | PICK | ACT | Empty container pickup |
| CS020 | EQUIPMENT | INSP | ACT | Container inspection |
| CS040 | EQUIPMENT | ARRI | ACT | Container arrival at port |
| CS060 | EQUIPMENT | LOAD | ACT | Container loaded |
| CS067/CS068 | TRANSPORT | DEPA | EST | Estimated departure |
| CS070 | TRANSPORT | DEPA | ACT | Actual departure |
| CS080 | TRANSPORT | ARRI | ACT | Transshipment arrival |
| CS090 | EQUIPMENT | LOAD | ACT | Transshipment load |
| CS100 | EQUIPMENT | DISC | ACT | Transshipment discharge |
| CS110 | TRANSPORT | DEPA | ACT | Transshipment departure |
| CS120 | TRANSPORT | ARRI | ACT | Destination arrival |
| CS130 | EQUIPMENT | DISC | ACT | Destination discharge |
| CS190 | EQUIPMENT | PICK | ACT | Container picked up for delivery |
| CS210 | EQUIPMENT | DLVR | ACT | Final delivery |
| CS260 | EQUIPMENT | AVAI | ACT | Container available |
| CS277/CS958 | TRANSPORT | ARRI | EST | Estimated arrival |
| Unknown | SHIPMENT | {code} | ACT | Fallback for unmapped codes |

- **Vessel Matching**: Events are correlated with vessel data by matching event location to POL/POD from shipment leg routing data
- **Timezone Offset Calculation**: Derives UTC offset by comparing GMT and local datetime fields
- **Event ID Generation**: `cosco-{csCode}-{location}-{timestamp}` (deterministic, deduplication-safe)
- **Cosco-specific types**: Defined in `lib/adapters/cosco-types.ts` (`CoscoShipmentData`, `CoscoContainer`, `CoscoEvent`, `CoscoDateTime`, `CoscoLocation`, `CoscoShipmentLeg`, `CoscoSVVD`, `CoscoVesselInfo`, `ExtractedVesselData`, `DcsaEventMapping`)

#### `authConfig` Schema per Carrier

The `CarrierConfig.authConfig` JSONB field expects different shapes per carrier:

| Carrier | `carrierName` | Required `authConfig` Fields |
|---------|---------------|------------------------------|
| Maersk | `maersk` | `{ client_id: string, client_secret: string }` |
| MSC | `msc` | `{ certificate_base64: string }` (PFX file as base64) |
| ZIM | `zim` | `{ client_id: string, client_secret: string, subscription_key: string }` |
| Hapag-Lloyd | `hapag-lloyd` | `{ client_id: string, client_secret: string }` |
| CMA CGM | `cma-cgm` | `{ api_key: string }` |
| Cosco | `cosco` | `{ app_key: string, scac_code: string, customer_id: string }` |
| Evergreen | `evergreen` | `{ client_id: string, client_secret: string, token_url: string }` |

**Note**: Evergreen also requires `apiEndpoint` to be set on the `CarrierConfig` entity (the base URL for the tracking API).

### Auto-Tracking Flow

When a shipment is created with a `carrierCode` and at least one tracking reference (container number, booking number, or BOL number), the system automatically starts tracking:

```
Shipment Created
  → [shipment-created-auto-track subscriber]
    Guards: carrierCode present, carrier in adapter registry, reference available, no duplicate job
    → Creates TrackingJob with generated poll schedule
    → Emits shipment_tracking.tracking_job.created

TrackingJob Created
  → [tracking-job-created-enqueue-poll subscriber]
    → Enqueues job to shipment-tracking-poll queue

Poll Worker picks up job
  → TrackingService.pollShipment()
    → Carrier API call → cargo events persisted → status derived
```

**Reference priority:** `containerNumber` → `bookingNumber` → `bolNumber` (first non-null wins)

**Duplicate guard:** Skips if an `active` or `paused` TrackingJob already exists for the same `(shipment, carrierName, referenceType, referenceValue)`.

This also means manually-created tracking jobs (via API) get an immediate first poll, since the enqueue-poll subscriber reacts to `tracking_job.created` regardless of source.

### Polling Lifecycle

1. **Schedule**: A `TrackingJob` is created (automatically via auto-track or manually via API) with a polling schedule (array of ISO date strings) or one is auto-generated from ETD/ETA
2. **Worker**: The `tracking-poll` worker picks up jobs whose `nextPollAt <= now`
3. **Rate Limit**: Token-bucket check via `@open-mercato/cache` before each carrier API call
4. **Fetch**: Carrier adapter fetches events from external API
5. **Deduplicate**: New events are matched by `eventId` to avoid duplicates
6. **Status Derive**: `deriveShipmentStatus()` applies DCSA event codes to compute the new status
7. **Time Extract**: `extractShipmentTimes()` extracts ETD/ETA/ATD/ATA from DEPA/ARRI events
8. **Persist**: New cargo events + updated shipment are flushed
9. **Events**: Domain events emitted for new cargo events, status changes, and shipment updates
10. **Auto-deactivate**: When status reaches `DELIVERED`, the tracking job is automatically deactivated

### Status Machine

Status only advances forward, never downgrades. Based on DCSA (Digital Container Shipping Association) event codes:

```
ORDERED → BOOKED → DEPARTED → PRE_ARRIVAL → IN_PORT → DELIVERED
```

| Event Code | Classification | Location | Derived Status |
|------------|---------------|----------|---------------|
| `DEPA` | `ACT` | any | DEPARTED |
| `DEPA` | `PLN`/`EST` | any | BOOKED |
| `ARRI` | `ACT` | destination | IN_PORT |
| `ARRI` | `PLN`/`EST` | destination | PRE_ARRIVAL |
| `ARRI` | `ACT` | non-destination | DEPARTED (transshipment) |
| `DISC` | `ACT` | destination | IN_PORT |
| `LOAD` | `ACT` | origin | BOOKED |
| `GOUT` | `ACT` | destination | DELIVERED |
| `DLVR` | `ACT` | any | DELIVERED |

### Error Handling

- Carrier fetch errors are recorded in `TrackingJob.errorHistory` (last 20 entries)
- After **10 consecutive errors**, the job status is set to `failed` and a `tracking_job.failed` event is emitted
- Retry count resets to 0 on a successful poll

## Data Models

### Entity Relationship Diagram

```
Shipment ──1:N──> TrackingJob
Shipment ──1:N──> CargoEvent
Webhook  ──1:N──> WebhookDelivery
CarrierConfig (standalone, scoped per org+tenant+carrier)
```

### Entities

#### Shipment (`shipment_tracking_shipments`)

The core entity representing a tracked ocean container shipment.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `organization_id` | uuid | no | | Multi-tenant scope |
| `tenant_id` | uuid | no | | Multi-tenant scope |
| `status` | text | no | `'ORDERED'` | Enum: ORDERED, BOOKED, DEPARTED, PRE_ARRIVAL, IN_PORT, DELIVERED |
| `carrier_code` | text | yes | | SCAC or carrier identifier |
| `container_number` | text | yes | | ISO container number |
| `booking_number` | text | yes | | Carrier booking reference |
| `bol_number` | text | yes | | Bill of Lading number |
| `etd`/`eta`/`atd`/`ata` | timestamptz | yes | | Estimated/Actual departure/arrival |
| `etd_offset`/`eta_offset`/`atd_offset`/`ata_offset` | text | yes | | Timezone offset strings |
| `origin_name`/`origin_unlocode`/`origin_country` | text | yes | | Origin port |
| `destination_name`/`destination_unlocode`/`destination_country` | text | yes | | Destination port |
| `vessel_name`/`vessel_imo` | text | yes | | Vessel information |
| `event_count` | integer | no | `0` | Denormalized cargo event count |
| `extra` | jsonb | yes | | Arbitrary extension data |
| `is_active` | boolean | no | `true` | Soft-active flag |
| `created_by_user_id` | uuid | yes | | Audit trail |
| `created_at`/`updated_at` | timestamptz | no | `now()` | Timestamps |
| `deleted_at` | timestamptz | yes | | Soft-delete |

**Indexes:** `(organization_id, tenant_id)`, `(status)`, `(carrier_code)`

**Validation:** At least one of `containerNumber`, `bookingNumber`, or `bolNumber` is required on create.

#### TrackingJob (`shipment_tracking_jobs`)

A polling job that fetches carrier events for a shipment.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `organization_id` | uuid | no | | Multi-tenant scope |
| `tenant_id` | uuid | no | | Multi-tenant scope |
| `shipment_id` | uuid | no | | FK to Shipment |
| `carrier_name` | text | no | | Carrier adapter identifier |
| `reference_type` | text | no | | Enum: container, booking, bol |
| `reference_value` | text | no | | The actual reference to track |
| `status` | text | no | `'active'` | Enum: active, paused, deactivated, failed |
| `schedule` | jsonb | yes | | Array of ISO date strings for polling |
| `next_poll_at` | timestamptz | yes | | When to next poll |
| `last_poll_at` | timestamptz | yes | | Last successful poll |
| `retry_count` | integer | no | `0` | Consecutive error count |
| `error_history` | jsonb | yes | | Array of `{date, message}` objects |
| `created_at`/`updated_at` | timestamptz | no | `now()` | Timestamps |

**Indexes:** `(organization_id, tenant_id)`, `(status)`, `(next_poll_at)`

#### CargoEvent (`shipment_tracking_cargo_events`)

An individual tracking event from a carrier (DCSA-compatible).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `organization_id` | uuid | no | | Multi-tenant scope |
| `tenant_id` | uuid | no | | Multi-tenant scope |
| `shipment_id` | uuid | no | | FK to Shipment |
| `event_id` | text | no | | Carrier-provided event ID |
| `event_type` | text | no | | Enum: EQUIPMENT, TRANSPORT, SHIPMENT |
| `event_code` | text | no | | DCSA code: DEPA, ARRI, LOAD, DISC, GOUT, DLVR, etc. |
| `event_classification` | text | yes | | Enum: ACT (actual), PLN (planned), EST (estimated) |
| `event_date_time` | timestamptz | no | | When the event occurred |
| `event_date_time_offset` | text | yes | | Timezone offset string |
| `description` | text | yes | | Human-readable event description |
| `location_name`/`location_unlocode`/`location_country` | text | yes | | Where the event occurred |
| `vessel_name`/`vessel_imo`/`voyage_number` | text | yes | | Vessel info at time of event |
| `raw_data` | jsonb | yes | | Original carrier response |
| `created_at` | timestamptz | no | `now()` | When ingested |

**Unique constraint:** `(shipment_id, event_id)` -- prevents duplicate events

#### CarrierConfig (`shipment_tracking_carrier_configs`)

Per-tenant carrier API configuration.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `organization_id` | uuid | no | | Multi-tenant scope |
| `tenant_id` | uuid | no | | Multi-tenant scope |
| `carrier_name` | text | no | | Must match adapter's `carrierName` |
| `api_endpoint` | text | yes | | Custom API URL override |
| `auth_config` | jsonb | yes | | API keys/credentials (should be encrypted) |
| `rate_limit_requests` | integer | no | `60` | Max requests per window |
| `rate_limit_window_seconds` | integer | no | `60` | Window duration |
| `is_active` | boolean | no | `true` | Enable/disable carrier |
| `created_at`/`updated_at` | timestamptz | no | `now()` | Timestamps |

**Unique constraint:** `(organization_id, tenant_id, carrier_name)`

#### Webhook (`shipment_tracking_webhooks`)

Outbound webhook configuration for event notifications.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `organization_id` | uuid | no | | Multi-tenant scope |
| `tenant_id` | uuid | no | | Multi-tenant scope |
| `url` | text | no | | Target URL |
| `events_subscribed` | jsonb | no | | Array of event type strings |
| `hmac_secret` | text | yes | | HMAC-SHA256 signing key |
| `is_active` | boolean | no | `true` | Enable/disable webhook |
| `created_at`/`updated_at` | timestamptz | no | `now()` | Timestamps |

#### WebhookDelivery (`shipment_tracking_webhook_deliveries`)

Delivery log for outbound webhook calls.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `webhook_id` | uuid | no | | FK to Webhook |
| `event_type` | text | no | | What triggered this delivery |
| `status` | text | no | `'pending'` | Enum: pending, success, failed |
| `retry_count` | integer | no | `0` | Delivery attempt count |
| `next_retry_at` | timestamptz | yes | | When to retry |
| `payload` | jsonb | no | | Delivered payload |
| `response_status` | integer | yes | | HTTP status code |
| `response_body` | text | yes | | Response body (truncated) |
| `error_message` | text | yes | | Error description |
| `created_at` | timestamptz | no | `now()` | Timestamps |

**Indexes:** `(webhook_id)`, `(status)`, `(next_retry_at)`

## API Contracts

All endpoints require authentication and are scoped to the user's tenant/organization.

### Shipments

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| `GET` | `/api/shipment-tracking/shipments` | `shipments.view` | List shipments (paginated, filterable by status/carrier, searchable) |
| `POST` | `/api/shipment-tracking/shipments` | `shipments.manage` | Create shipment |
| `PUT` | `/api/shipment-tracking/shipments` | `shipments.manage` | Update shipment |
| `DELETE` | `/api/shipment-tracking/shipments` | `shipments.manage` | Soft-delete shipment |

**List query params:** `page`, `pageSize`, `search`, `status`, `carrierCode`, `sortField`, `sortDir`

### Tracking Jobs

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| `GET` | `/api/shipment-tracking/tracking-jobs` | `tracking_jobs.view` | List tracking jobs |
| `POST` | `/api/shipment-tracking/tracking-jobs` | `tracking_jobs.manage` | Create tracking job |
| `PUT` | `/api/shipment-tracking/tracking-jobs` | `tracking_jobs.manage` | Update tracking job |
| `DELETE` | `/api/shipment-tracking/tracking-jobs` | `tracking_jobs.manage` | Delete tracking job |

### Cargo Events

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| `GET` | `/api/shipment-tracking/cargo-events` | `shipments.view` | List cargo events (read-only, filterable by shipmentId/eventType/eventCode) |

### Carrier Configs

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| `GET` | `/api/shipment-tracking/carrier-configs` | `carrier_configs.view` | List carrier configurations |
| `POST` | `/api/shipment-tracking/carrier-configs` | `carrier_configs.manage` | Create carrier config |
| `PUT` | `/api/shipment-tracking/carrier-configs` | `carrier_configs.manage` | Update carrier config |
| `DELETE` | `/api/shipment-tracking/carrier-configs` | `carrier_configs.manage` | Delete carrier config |

### Webhooks

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| `GET` | `/api/shipment-tracking/webhooks` | `webhooks.view` | List webhooks |
| `POST` | `/api/shipment-tracking/webhooks` | `webhooks.manage` | Create webhook |
| `PUT` | `/api/shipment-tracking/webhooks` | `webhooks.manage` | Update webhook |
| `DELETE` | `/api/shipment-tracking/webhooks` | `webhooks.manage` | Delete webhook |

### Webhook Deliveries

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| `GET` | `/api/shipment-tracking/webhooks/deliveries` | `webhooks.view` | List webhook deliveries (read-only) |

## Commands

| Command ID | Input | Description |
|-----------|-------|-------------|
| `shipment_tracking.shipment.create` | `ShipmentCreateInput` | Create shipment (has undo) |
| `shipment_tracking.shipment.update` | `ShipmentUpdateInput` | Update shipment, emits `status_changed` if status changes |
| `shipment_tracking.shipment.delete` | `{id, tenantId, organizationId}` | Soft-delete shipment |
| `shipment_tracking.tracking_job.create` | `TrackingJobCreateInput` | Create job, auto-generates schedule if not provided |
| `shipment_tracking.tracking_job.pause` | `{id, tenantId, organizationId}` | Pause polling |
| `shipment_tracking.tracking_job.resume` | `{id, tenantId, organizationId}` | Resume polling, recalculates nextPollAt |
| `shipment_tracking.tracking_job.deactivate` | `{id, tenantId, organizationId}` | Permanently stop polling |
| `shipment_tracking.webhook.create` | `WebhookCreateInput` | Create webhook (has undo) |
| `shipment_tracking.webhook.update` | `WebhookUpdateInput` | Update webhook |
| `shipment_tracking.webhook.delete` | `{id, tenantId, organizationId}` | Delete webhook |
| `shipment_tracking.webhook.test` | `{id, tenantId, organizationId}` | Send test payload to webhook |

## Events

All events are declared in `events.ts` via `createModuleEvents`.

| Event ID | Category | Entity | Description |
|----------|----------|--------|-------------|
| `shipment_tracking.shipment.created` | crud | shipment | Shipment created |
| `shipment_tracking.shipment.updated` | crud | shipment | Shipment fields updated |
| `shipment_tracking.shipment.deleted` | crud | shipment | Shipment soft-deleted |
| `shipment_tracking.shipment.status_changed` | lifecycle | shipment | Status advanced (includes previousStatus/newStatus) |
| `shipment_tracking.shipment.schedule_changed` | lifecycle | shipment | Poll schedule modified |
| `shipment_tracking.cargo_event.created` | crud | cargo_event | New event ingested from carrier |
| `shipment_tracking.tracking_job.created` | crud | tracking_job | Job created |
| `shipment_tracking.tracking_job.updated` | crud | tracking_job | Job status/config changed |
| `shipment_tracking.tracking_job.failed` | lifecycle | tracking_job | Job failed after max retries |
| `shipment_tracking.tracking_job.completed` | lifecycle | tracking_job | Job deactivated (shipment delivered) |
| `shipment_tracking.webhook.delivery_success` | lifecycle | webhook_delivery | Webhook delivered successfully |
| `shipment_tracking.webhook.delivery_failed` | lifecycle | webhook_delivery | Webhook delivery failed after retries |

## Workers

### `tracking-poll` Worker

- **Queue:** `shipment-tracking-poll`
- **Concurrency:** 5
- **Payload:** `{ jobId: string }`
- **Behavior:** Calls `TrackingService.pollShipment(jobId)` which orchestrates the entire poll cycle

### `webhook-delivery` Worker

- **Queue:** `shipment-tracking-webhook`
- **Concurrency:** 10
- **Payload:** `{ deliveryId, webhookId, url, hmacSecret?, payload, eventType }`
- **Behavior:** Dispatches HTTP POST with HMAC-SHA256 signature, updates delivery status
- **Retry policy:** 5 retries with exponential backoff (30s, 2m, 10m, 30m, 1h)

## Subscribers

| Subscriber | Event | Persistent | Action |
|-----------|-------|-----------|--------|
| `shipment-created-auto-track` | `shipment_tracking.shipment.created` | yes | Auto-creates a `TrackingJob` when a shipment has a recognized carrier and tracking reference |
| `tracking-job-created-enqueue-poll` | `shipment_tracking.tracking_job.created` | yes | Enqueues the job to `shipment-tracking-poll` queue for immediate first poll |
| `shipment-status-changed` | `shipment_tracking.shipment.status_changed` | yes | Dispatches `status_changed` webhook to matching subscribers |
| `cargo-event-created` | `shipment_tracking.cargo_event.created` | yes | Dispatches `event_created` webhook to matching subscribers |

## Webhook Delivery

### Signing

All webhook deliveries are signed with HMAC-SHA256 if the webhook has an `hmacSecret` configured:

```
X-Webhook-Timestamp: <unix timestamp ms>
X-Webhook-Signature: sha256=<HMAC-SHA256 of timestamp.body>
```

The signature covers `${timestamp}.${JSON.stringify(payload)}` to prevent replay attacks.

### Delivery Timeout

Webhook HTTP POST requests have a 10-second timeout.

## Services (DI)

| DI Token | Class | Scope | Description |
|----------|-------|-------|-------------|
| `shipmentTrackingCarrierRegistry` | `CarrierRegistryService` | singleton | Register/resolve carrier adapters |
| `shipmentTrackingService` | `TrackingService` | per-resolve | Orchestrates polling, status derivation, event persistence |
| `shipmentTrackingWebhookService` | `WebhookService` | per-resolve | Finds matching webhooks, creates delivery records, enqueues deliveries |
| `shipmentTrackingPollQueue` | `Queue<TrackingPollPayload>` | per-resolve | Job queue for poll worker (`shipment-tracking-poll`). Strategy from `QUEUE_STRATEGY` env |

**Note:** `shipmentTrackingService` wraps the `cache` DI token in a thin adapter to bridge the `CacheStrategy` interface (options object with ttl in ms) to the rate-limiter's `CacheService` interface (positional ttl in seconds).

## Domain Logic (`lib/`)

| File | Function | Description |
|------|----------|-------------|
| `carrier-adapter.ts` | - | `CarrierAdapter` interface, `CarrierFetchResult`, `CarrierAdapterTestResult` types |
| `dcsa-params.ts` | `buildDcsaQueryParams()` | Maps reference type to DCSA query param (equipmentReference, carrierBookingReference, transportDocumentReference) |
| `dcsa-event-parser.ts` | `parseDcsaEvents()` | Shared DCSA response parser: extracts eventId, type, code, classification, datetime, location, vessel, voyage. Handles `{ events }` and `[]` shapes |
| `auth/base64url.ts` | `base64UrlEncode()` | base64url encoding (RFC 7515) |
| `auth/oauth-client.ts` | `fetchOAuthToken()` | OAuth 2.0 `client_credentials` flow (body or Basic auth) via native `fetch` |
| `adapters/index.ts` | `registerAllAdapters()` | Registers all 7 built-in carrier adapters with the `CarrierRegistryService` |
| `adapters/maersk.ts` | `MaerskAdapter` | Maersk carrier adapter (DCSA, OAuth) |
| `adapters/msc.ts` | `MscAdapter` | MSC carrier adapter (DCSA, PFX cert JWT auth) |
| `adapters/zim.ts` | `ZimAdapter` | ZIM carrier adapter (DCSA, OAuth + subscription key) |
| `adapters/hapag-lloyd.ts` | `HapagLloydAdapter` | Hapag-Lloyd carrier adapter (DCSA, API key headers) |
| `adapters/cma-cgm.ts` | `CmaCgmAdapter` | CMA CGM carrier adapter (DCSA, API key header) |
| `adapters/evergreen.ts` | `EvergreenAdapter` | Evergreen carrier adapter (DCSA, OAuth Basic) |
| `adapters/cosco.ts` | `CoscoAdapter` | Cosco carrier adapter (non-DCSA, CS-to-DCSA mapping, POST API) |
| `adapters/cosco-types.ts` | - | Cosco-specific TypeScript types (CoscoShipmentData, CoscoContainer, CoscoEvent, etc.) |
| `status-machine.ts` | `deriveShipmentStatus()` | Pure function: cargo events + context -> highest status (never downgrades) |
| `time-extraction.ts` | `extractShipmentTimes()` | Pure function: cargo events -> `{etd, eta, atd, ata}` from DEPA/ARRI events |
| `rate-limiter.ts` | `checkRateLimit()` | Token bucket via `@open-mercato/cache`. Key: `st:ratelimit:{tenantId}:{carrier}` |
| `schedule-generator.ts` | `generatePollSchedule()` | Creates daily poll dates with +/- 2h random jitter between ETD-7d and ETA+14d |
| `schedule-generator.ts` | `getNextPollDate()` | Returns the next future date from a schedule array |
| `webhook-dispatcher.ts` | `dispatchWebhook()` | HMAC-SHA256 signing + HTTP POST with 10s timeout |

## Access Control

### Features

| Feature | Description |
|---------|-------------|
| `shipment_tracking.shipments.view` | View shipments and cargo events |
| `shipment_tracking.shipments.manage` | Create, update, delete shipments |
| `shipment_tracking.tracking_jobs.view` | View tracking job status |
| `shipment_tracking.tracking_jobs.manage` | Create, pause, resume, deactivate jobs |
| `shipment_tracking.carrier_configs.view` | View carrier API configurations |
| `shipment_tracking.carrier_configs.manage` | Manage carrier API credentials |
| `shipment_tracking.webhooks.view` | View webhooks and delivery logs |
| `shipment_tracking.webhooks.manage` | Create, update, delete, test webhooks |
| `shipment_tracking.settings.manage` | Module-level settings |

### Default Role Features

| Role | Features |
|------|----------|
| admin | `shipment_tracking.*` (all features) |
| employee | `*.view` features only |

## UI/UX

### Admin Pages

| Page | Path | Description |
|------|------|-------------|
| Shipment List | `/backend/shipment-tracking` | DataTable with status badges, carrier code, container/booking numbers, search |
| Shipment Detail | `/backend/shipment-tracking/[id]` | Detail card + cargo events timeline (chronological, with event codes and locations) |
| Tracking Jobs | `/backend/tracking-jobs` | DataTable with status, carrier, next poll time, pause/resume/deactivate actions |
| Carrier Configs | `/backend/carrier-configs` | DataTable with carrier name, rate limits, active status |
| Webhooks | `/backend/webhooks` | DataTable with URL, subscribed events, active status, test action |

### Search Integration

Shipments are searchable via Cmd+K with the following fields: container number, booking number, BOL number, carrier code, vessel name, origin/destination name. Results link to `/backend/shipment-tracking/{id}`.

## i18n

Translations are in `packages/shipment-tracking/src/modules/shipment_tracking/i18n/`:

| File | Status |
|------|--------|
| `en.json` | Complete |
| `pl.json` | Stub |
| `de.json` | Stub |
| `es.json` | Stub |

Key namespace: `shipment_tracking.*`

## File Structure

```
packages/shipment-tracking/
├── package.json
├── tsconfig.json
├── build.mjs
├── watch.mjs
├── generated/
│   ├── entities.ids.generated.ts
│   └── entity-fields-registry.ts
└── src/
    ├── index.ts
    └── modules/
        └── shipment_tracking/
            ├── index.ts                  # Module entry point
            ├── acl.ts                    # Feature declarations
            ├── ce.ts                     # Custom entity registration
            ├── di.ts                     # DI container registrations
            ├── events.ts                 # Event declarations
            ├── search.ts                 # Search configuration
            ├── setup.ts                  # Default role features
            ├── api/
            │   ├── openapi.ts            # Shared OpenAPI factory
            │   ├── shipments/route.ts
            │   ├── tracking-jobs/route.ts
            │   ├── cargo-events/route.ts
            │   ├── carrier-configs/route.ts
            │   ├── webhooks/route.ts
            │   └── webhooks/deliveries/route.ts
            ├── backend/
            │   ├── shipment-tracking/
            │   │   ├── page.meta.ts
            │   │   ├── page.tsx          # Shipment list
            │   │   └── [id]/
            │   │       ├── page.meta.ts
            │   │       └── page.tsx      # Shipment detail
            │   ├── tracking-jobs/
            │   │   ├── page.meta.ts
            │   │   └── page.tsx
            │   ├── carrier-configs/
            │   │   ├── page.meta.ts
            │   │   └── page.tsx
            │   └── webhooks/
            │       ├── page.meta.ts
            │       └── page.tsx
            ├── commands/
            │   ├── index.ts
            │   ├── shipments.ts
            │   ├── tracking-jobs.ts
            │   └── webhooks.ts
            ├── data/
            │   ├── entities.ts           # 6 MikroORM entities
            │   └── validators.ts         # Zod schemas
            ├── i18n/
            │   ├── en.json
            │   ├── pl.json
            │   ├── de.json
            │   └── es.json
            ├── lib/
            │   ├── carrier-adapter.ts     # CarrierAdapter interface + result types
            │   ├── dcsa-params.ts         # Shared DCSA query param builder
            │   ├── dcsa-event-parser.ts   # Shared DCSA response → CarrierFetchedEvent parser
            │   ├── rate-limiter.ts
            │   ├── schedule-generator.ts
            │   ├── status-machine.ts
            │   ├── time-extraction.ts
            │   ├── webhook-dispatcher.ts
            │   ├── auth/
            │   │   ├── base64url.ts       # base64url encoding utility
            │   │   └── oauth-client.ts    # Reusable OAuth 2.0 client_credentials flow
            │   └── adapters/
            │       ├── index.ts           # registerAllAdapters() entry point
            │       ├── maersk.ts          # Maersk (DCSA, OAuth)
            │       ├── msc.ts             # MSC (DCSA, PFX cert + JWT + Azure AD)
            │       ├── zim.ts             # ZIM (DCSA, OAuth + subscription key)
            │       ├── hapag-lloyd.ts     # Hapag-Lloyd (DCSA, API key headers)
            │       ├── cma-cgm.ts         # CMA CGM (DCSA, API key header)
            │       ├── evergreen.ts       # Evergreen (DCSA, OAuth Basic)
            │       ├── cosco.ts           # Cosco (non-DCSA, CS→DCSA mapping)
            │       └── cosco-types.ts     # Cosco-specific TypeScript types
            ├── services/
            │   ├── carrierRegistry.ts
            │   ├── trackingService.ts
            │   └── webhookService.ts
            ├── subscribers/
            │   ├── cargo-event-created.ts
            │   ├── shipment-created-auto-track.ts   # Auto-creates TrackingJob on shipment creation
            │   ├── shipment-status-changed.ts
            │   └── tracking-job-created-enqueue-poll.ts  # Enqueues initial poll on job creation
            └── workers/
                ├── tracking-poll.worker.ts
                └── webhook-delivery.worker.ts
```

## Dependencies

| Package | Type | Purpose |
|---------|------|---------|
| `@open-mercato/shared` | dependency | Commands, i18n, crud factory, data engine |
| `@open-mercato/events` | dependency | Event bus for domain events |
| `@open-mercato/cache` | dependency | Rate limiting token bucket |
| `@open-mercato/queue` | dependency | Job queues for polling and webhook delivery |
| `@open-mercato/ui` | dependency | Admin UI components |
| `@open-mercato/scheduler` | optional peer | Schedule-driven poll triggering |
| `@mikro-orm/core` | peer | ORM for entity management |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `QUEUE_STRATEGY` | `local` | Queue backend (`local` or `async`) |
| `REDIS_URL` / `QUEUE_REDIS_URL` | - | Redis URL for async queue strategy |

## Extending the Module

### Adding a New Carrier

For carriers not included in the built-in set, implement the `CarrierAdapter` interface and register it:

1. Create a class implementing `CarrierAdapter`. For DCSA-compliant carriers, reuse the shared utilities:
   - `buildDcsaQueryParams()` for URL query parameters
   - `parseDcsaEvents()` for response parsing
   - `fetchOAuthToken()` for OAuth 2.0 authentication

```typescript
import type { CarrierAdapter, CarrierFetchResult } from '@open-mercato/shipment-tracking'
import { buildDcsaQueryParams } from '@open-mercato/shipment-tracking/lib/dcsa-params'
import { parseDcsaEvents } from '@open-mercato/shipment-tracking/lib/dcsa-event-parser'

export class MyCarrierAdapter implements CarrierAdapter {
  readonly carrierName = 'my-carrier'
  readonly supportedReferenceTypes = ['container', 'booking', 'bol'] as const

  async fetchEvents(input) {
    // 1. Authenticate
    // 2. const params = buildDcsaQueryParams(input.referenceValue, input.referenceType)
    // 3. const response = await fetch(`${endpoint}?${params}`, { headers })
    // 4. const data = await response.json()
    // 5. return { events: parseDcsaEvents(data, 'My Carrier') }
  }

  async testConnection(input) { /* ... */ }
}
```

2. Register it in your DI setup:

```typescript
// In your app's di.ts or a custom module's di.ts
import type { AwilixContainer } from 'awilix'

export function register(container: AwilixContainer) {
  const registry = container.resolve('shipmentTrackingCarrierRegistry')
  registry.register(new MyCarrierAdapter())
}
```

3. Create a `CarrierConfig` row via the API with `carrierName` matching the adapter's `carrierName`

### Adding Custom Webhook Events

Subscribe to any domain event in the open-mercato event bus and call `WebhookService.dispatchEvent()`:

```typescript
await webhookService.dispatchEvent({
  eventType: 'my_custom_event',
  payload: { ... },
  tenantId,
  organizationId,
})
```

Webhooks with `my_custom_event` in their `eventsSubscribed` array will receive the payload.

## Open Questions

- Should `CarrierConfig.authConfig` use the tenant data encryption service? Currently stored as plain JSONB.
- Should the scheduler module be used to trigger poll jobs on schedule, or should a custom cron-like mechanism be built?
- Should cargo events support manual creation via the API (for testing/corrections)?

## Changelog

### 2026-02-08 (auto-tracking flow)
- Implemented auto-tracking: shipment creation now automatically creates a TrackingJob and enqueues the first poll
- New subscriber `shipment-created-auto-track.ts`: listens to `shipment_tracking.shipment.created`, guards on carrierCode/adapter/reference, creates TrackingJob with generated poll schedule
- New subscriber `tracking-job-created-enqueue-poll.ts`: listens to `shipment_tracking.tracking_job.created`, enqueues immediate poll via `shipmentTrackingPollQueue`
- Registered `shipmentTrackingPollQueue` DI token using `createQueue` from `@open-mercato/queue` (supports local/async strategies)
- Fixed DI: switched TrackingService and WebhookService from `asClass().inject()` to manual resolvers to match single-`deps` constructor pattern
- Fixed cache integration: resolved `cache` DI token (not `cacheService`) and added adapter bridging `CacheStrategy` (options object, ttl in ms) to rate-limiter's `CacheService` (positional ttl in seconds)
- Added `seedDefaults` hook in `setup.ts` calling `seedCarrierConfigs()` so carrier API keys are seeded during tenant initialization
- Verified end-to-end: CMA-CGM adapter fetched 16 cargo events for container DFSU1933597, status auto-derived to "Departed"

### 2026-02-07 (carrier adapters)
- Implemented 7 built-in carrier adapters: Maersk, MSC, ZIM, Hapag-Lloyd, CMA CGM, Cosco, Evergreen
- Extracted shared DCSA utilities: `dcsa-params.ts` (query param builder), `dcsa-event-parser.ts` (response parser)
- Extracted shared auth utilities: `auth/oauth-client.ts` (OAuth 2.0 flow), `auth/base64url.ts` (encoding)
- 6 DCSA-compliant adapters share parsing logic via `parseDcsaEvents()`, reducing duplication by ~90%
- Cosco adapter includes full CS-code-to-DCSA mapping (19 event codes), vessel matching, timezone offset calculation
- MSC adapter uses PFX certificate extraction via openssl + RS256 JWT creation + Azure AD token exchange
- All adapters are stateless (no internal token caching); each `fetchEvents()` call authenticates fresh
- All adapters auto-registered via `registerAllAdapters()` called from `di.ts`
- Documented `authConfig` schema per carrier in spec
- Updated "Extending the Module" section with examples showing how to reuse shared utilities

### 2026-02-07
- Initial specification
- 6 entities: Shipment, TrackingJob, CargoEvent, CarrierConfig, Webhook, WebhookDelivery
- Pluggable carrier adapter interface (no concrete implementations)
- DCSA-based status machine with forward-only progression
- Token bucket rate limiting via @open-mercato/cache
- Webhook delivery with HMAC-SHA256 signing and exponential backoff retries
- 2 workers (tracking-poll, webhook-delivery), 2 subscribers (status-changed, cargo-event-created)
- Full CRUD API routes via makeCrudRoute
- Admin UI pages for shipments (list+detail), tracking jobs, carrier configs, webhooks
- Search integration for shipments
- i18n with English translations, Polish/German/Spanish stubs
