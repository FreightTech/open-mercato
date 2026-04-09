# Automations Module — n8n-Style Visual Workflow Automation

| Field | Value |
|-------|-------|
| **Status** | In-Progress |
| **Author** | Wojciech Bakłażec |
| **Created** | 2026-04-09 |
| **Related** | SPEC-057 (Webhooks), SPEC-045 (Integration Marketplace), Workflows Module, Business Rules Module |

## TLDR

Build a production-grade **n8n-style visual automation engine** (`packages/core/src/modules/automations/`) that lets users create event-driven, trigger–action workflows through a drag-and-drop graph editor. The module provides 19 built-in node types (4 triggers, 10 actions, 4 logic, 1 utility), a BFS-based execution engine with retry policies and timeouts, queue-based async processing, per-node execution tracking, and a full admin UI with ReactFlow visual editor and run debugger.

---

## 1. Problem Statement

Open Mercato has a powerful **Workflows module** (state-machine-based, step/transition model) but it targets complex, stateful, human-in-the-loop processes (approvals, sagas, compensation). For **simple event-driven automation** — "when X happens, do Y and Z" — the workflows module is over-engineered:

1. **Steep learning curve**: Users must understand state machines, transitions, activities, and step types.
2. **No visual node-based editor**: The workflow visual editor is step/transition-centric, not data-flow-centric.
3. **No lightweight trigger→action model**: Every automation requires a full workflow definition with START/END steps.
4. **No data transformation**: Workflows pass context but don't have inline data mapping, code execution, or filtering.

### Target Users

- **Business analysts** building simple automations: "when order created with total > $5000, send email to manager"
- **Integration builders** connecting Open Mercato to external APIs
- **Power users** needing data transformation pipelines without writing application code

### n8n Alignment

The module follows [n8n](https://n8n.io)'s proven UX patterns:
- **Node-based graph** with typed connections
- **Triggers** (event, webhook, schedule, manual) as entry points
- **Actions** that transform, route, or send data
- **Per-node input/output inspection** for debugging
- **One-click test execution** per node

---

## 2. Architecture Overview

```
                            TRIGGER SOURCES
                            ==============

  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ Domain Event │    │ HTTP POST    │    │ Cron/Interval│    │ Manual (UI)  │
  │ (event bus)  │    │ (webhook)    │    │ (scheduler)  │    │ or API call  │
  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
         │                   │                   │                   │
         ▼                   ▼                   ▼                   ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                     EVENT TRIGGER SUBSCRIBER                            │
  │  subscribers/event-trigger.ts (wildcard: *, persistent: true)          │
  │                                                                        │
  │  1. Match event against enabled definitions' trigger node patterns     │
  │  2. Evaluate filter conditions on event payload                        │
  │  3. Map event data to trigger context via contextMapping               │
  │  4. Create AutomationRun (status: RUNNING)                             │
  │  5. Enqueue to 'automation-runs' queue                                 │
  └────────────────────────────────────┬───────────────────────────────────┘
                                       │
                              automation-runs queue
                                       │
                                       ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                     QUEUE WORKER (concurrency: 5)                       │
  │  workers/automation-runs.worker.ts                                     │
  │                                                                        │
  │  1. Fetch AutomationRun + AutomationDefinition                         │
  │  2. Call executeAutomation()                                            │
  │  3. Update run status (COMPLETED / FAILED)                              │
  └────────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                     EXECUTION ENGINE                                    │
  │  lib/execution-engine.ts                                               │
  │                                                                        │
  │  1. Build adjacency map from connections                                │
  │  2. Find trigger node, set its output as trigger data                   │
  │  3. BFS traverse the graph:                                             │
  │     a. Resolve input data from connected source nodes                   │
  │     b. Interpolate config ({{trigger.*}}, {{nodes.*}}, {{context.*}})   │
  │     c. Execute node with timeout (default 30s, max 120s)                │
  │     d. Apply retry policy (exponential backoff if configured)           │
  │     e. Follow output route (main/true/false/error/case_N)              │
  │     f. Record NodeExecution for each node                               │
  │  4. Run-level timeout: 5 minutes                                        │
  │  5. On completion: update run status + context                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Relationship to Existing Modules

| Module | Relationship |
|--------|-------------|
| **Workflows** | Complementary. Workflows = stateful, long-running, human-in-the-loop. Automations = lightweight, event-driven, instant. |
| **Business Rules** | Automations can invoke business rules via `emit_event` or `code` nodes. Business rules provide declarative conditions; automations provide orchestration. |
| **Webhooks** | Automations has its own webhook trigger endpoint. Does not depend on the webhooks module but can coexist. Webhook triggers fire automations directly. |
| **Events** | Core dependency. Automations subscribe to the event bus via wildcard subscriber. Automations can emit events via `emit_event` node. |
| **Queue** | Core dependency. Runs are enqueued for async processing. |
| **Integrations** | Credentials from the integrations module can be injected into HTTP Request nodes via `credentialId`. |

---

## 3. Data Models

### 3.1 AutomationDefinition

Stores the automation blueprint — nodes, connections, and metadata.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Database identifier |
| `automation_id` | VARCHAR(100) | UNIQUE with `tenant_id` | User-facing string ID (e.g., `order-notification`) |
| `name` | VARCHAR(255) | NOT NULL | Display name |
| `description` | TEXT | nullable | Optional description |
| `definition` | JSONB | NOT NULL | `AutomationDefinitionData` (nodes + connections) |
| `enabled` | BOOLEAN | DEFAULT true | Soft enable/disable |
| `version` | INTEGER | DEFAULT 1 | Definition version (for future versioning) |
| `metadata` | JSONB | nullable | `{ tags?: string[], category?: string, icon?: string }` |
| `tenant_id` | UUID | NOT NULL | Tenant scope |
| `organization_id` | UUID | NOT NULL | Organization scope |
| `created_by` | VARCHAR(255) | nullable | Audit: creator user ID |
| `updated_by` | VARCHAR(255) | nullable | Audit: last updater user ID |
| `created_at` | TIMESTAMPTZ | auto | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | auto-update | Last update timestamp |
| `deleted_at` | TIMESTAMPTZ | nullable | Soft delete |

**Indexes:**
- `(automation_id, tenant_id)` — UNIQUE
- `(enabled)` — for trigger subscriber queries
- `(tenant_id, organization_id)` — tenant isolation

### 3.2 AutomationRun

Tracks a single execution of an automation definition.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Run identifier |
| `definition_id` | UUID | NOT NULL, FK | Which definition was executed |
| `automation_id` | VARCHAR(100) | NOT NULL | Denormalized for querying |
| `status` | VARCHAR(20) | NOT NULL | `RUNNING` \| `COMPLETED` \| `FAILED` \| `CANCELLED` |
| `trigger_data` | JSONB | nullable | Input payload from trigger |
| `context` | JSONB | nullable | Accumulated run context (variables set by nodes) |
| `error_message` | TEXT | nullable | Error description on failure |
| `error_node_id` | VARCHAR(100) | nullable | Node ID that caused failure |
| `execution_time_ms` | INTEGER | nullable | Total execution time |
| `started_at` | TIMESTAMPTZ | nullable | Run start time |
| `completed_at` | TIMESTAMPTZ | nullable | Run completion time |
| `tenant_id` | UUID | NOT NULL | Tenant scope |
| `organization_id` | UUID | NOT NULL | Organization scope |
| `created_at` | TIMESTAMPTZ | auto | Record creation |

**Indexes:**
- `(definition_id, status)` — for per-definition run listing
- `(status, tenant_id)` — for global run listing
- `(tenant_id, organization_id)` — tenant isolation

### 3.3 NodeExecution

Per-node execution record within a run. Provides the debugging data equivalent to n8n's per-node input/output view.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Execution record ID |
| `run_id` | UUID | NOT NULL, FK | Parent run |
| `node_id` | VARCHAR(100) | NOT NULL | Node ID within the definition |
| `node_type` | VARCHAR(50) | NOT NULL | Node type (e.g., `action.http_request`) |
| `status` | VARCHAR(20) | NOT NULL | `PENDING` \| `RUNNING` \| `COMPLETED` \| `FAILED` \| `SKIPPED` |
| `input_data` | JSONB | nullable | Data received by the node |
| `output_data` | JSONB | nullable | Data produced by the node |
| `error_data` | JSONB | nullable | Error details `{ message, stack }` |
| `execution_time_ms` | INTEGER | nullable | Node execution time |
| `started_at` | TIMESTAMPTZ | nullable | Node start |
| `completed_at` | TIMESTAMPTZ | nullable | Node completion |
| `tenant_id` | UUID | NOT NULL | Tenant scope |
| `organization_id` | UUID | NOT NULL | Organization scope |
| `created_at` | TIMESTAMPTZ | auto | Record creation |

**Indexes:**
- `(run_id)` — for fetching all node executions of a run
- `(run_id, node_id)` — for finding a specific node's execution
- `(tenant_id, organization_id)` — tenant isolation

### 3.4 JSONB Structures

#### AutomationDefinitionData

```typescript
interface AutomationDefinitionData {
  nodes: AutomationNode[]
  connections: AutomationConnection[]
}
```

#### AutomationNode

```typescript
interface AutomationNode {
  id: string                    // Unique within definition
  type: string                  // e.g., 'trigger.event', 'action.http_request'
  name: string                  // Display name
  position: { x: number; y: number }  // Canvas coordinates
  config: Record<string, unknown>     // Type-specific configuration
  disabled?: boolean            // Skip execution when true
  onError?: 'stop' | 'continue' | 'output'  // Error handling strategy
  retryPolicy?: {
    maxAttempts: number         // 1–10 (1 = no retry)
    intervalMs: number          // 100–60000 (base interval)
    backoffMultiplier: number   // 1–5 (exponential backoff factor)
  }
  notes?: string                // User annotation
}
```

#### AutomationConnection

```typescript
interface AutomationConnection {
  id: string                    // Unique within definition
  sourceNodeId: string          // Output node ID
  sourceOutput: string          // Output name ('main', 'true', 'false', 'error', etc.)
  targetNodeId: string          // Input node ID
  targetInput: string           // Input name ('main')
}
```

---

## 4. Node Type System

### 4.1 Node Type Definition Contract

Every node type implements this interface:

```typescript
interface AutomationNodeTypeDefinition {
  type: string                              // Unique identifier (e.g., 'action.http_request')
  category: 'trigger' | 'action' | 'logic' | 'utility'
  name: string                              // Display name
  description: string                       // Brief description
  icon: string                              // Icon identifier
  color: string                             // Hex color for UI
  configSchema: z.ZodSchema                 // Zod schema for node config
  inputs: NodeIODefinition[]                // Input ports
  outputs: NodeIODefinition[]               // Output ports
  execute: (ctx: NodeExecutionContext) => Promise<NodeExecutionResult>
  testExecute?: (config, testInput) => Promise<unknown>  // Optional isolated test
}
```

### 4.2 Execution Context

```typescript
interface NodeExecutionContext {
  config: Record<string, unknown>      // Interpolated node configuration
  inputData: Record<string, unknown>   // Data from connected source nodes
  runContext: Record<string, unknown>  // Shared mutable run state
  nodeId: string
  runId: string
  em: EntityManager                     // Database access
  container: AwilixContainer            // DI container for service resolution
  logger: (message: string, data?: unknown) => void
}

interface NodeExecutionResult {
  output: Record<string, unknown>      // Data passed to downstream nodes
  outputRoute?: string                 // Which output port to follow ('main', 'true', 'false', 'error', etc.)
}
```

### 4.3 Global Registry

Node types are registered in a global in-memory registry (`globalThis`). Registration happens once at DI initialization (`di.ts`). Third-party modules can register custom node types by calling `registerAutomationNodeType()`.

### 4.4 Built-in Node Types (19 total)

#### 4.4.1 Triggers (4)

| Type | Config | Output | Description |
|------|--------|--------|-------------|
| `trigger.manual` | `inputSchema?: object` | `ctx.inputData` | Triggered by API call or UI button |
| `trigger.event` | `eventPattern: string`, `filters?: FilterCondition[]`, `contextMapping?: ContextMapping[]` | Event payload | Triggered by matching domain events |
| `trigger.webhook` | `method: GET\|POST\|PUT`, `path?: string`, `authType: none\|header\|basic`, `authConfig?: object` | Request body/headers/query | Triggered by inbound HTTP POST |
| `trigger.schedule` | `scheduleType: cron\|interval`, `scheduleValue: string`, `timezone: string` | Schedule metadata | Triggered by cron or interval scheduler |

**How triggers fire:**
- **Event**: Wildcard subscriber (`event: '*'`, `persistent: true`) matches `eventPattern` against emitted events. Excluded prefixes: `query_index.`, `search.`, `automations.`, `cache.`, `queue.`, `workflows.`
- **Webhook**: Unauthenticated POST to `/api/automations/webhook/[automationId]` creates a run and enqueues it.
- **Schedule**: `schedule-sync.ts` subscriber registers/unregisters cron jobs with the scheduler service when definitions are saved.
- **Manual**: POST to `/api/automations/definitions/[id]/run` with optional input data.

#### 4.4.2 Actions (10)

| Type | Config | Output | Description |
|------|--------|--------|-------------|
| `action.http_request` | `url, method, headers?, body?, credentialId?, timeout` | `{ statusCode, headers, body, ok }` | HTTP request with credential injection, timeout |
| `action.send_email` | `to, subject, body?, template?, templateData?` | `{ sent, to, subject, sentAt }` | Send email via mail service |
| `action.update_entity` | `entityType (module:entity), entityId, data, method?` | `{ updated, entityType, entityId, response }` | Update entity via internal CRUD API |
| `action.emit_event` | `eventName, payload?, persistent?` | `{ emitted, eventName, emittedAt }` | Emit domain event to event bus |
| `action.transform` | `mode (expression\|mapping), expression?, mappings?` | Transformed data | Data transformation via mapping or sandboxed JS expression |
| `action.code` | `code: string, timeout?: number` | Code result | Execute custom JavaScript in sandboxed VM |
| `action.delay` | `duration: number, unit: ms\|seconds\|minutes\|hours` | Input data + `_delay` metadata | Pause execution (capped at 30s inline) |
| `action.set_variable` | `variables: { key, value }[]` | Input data + `_context` | Set variables in run context |
| `action.filter` | `sourceField, conditions: FilterCondition[], combineMode?` | `{ items, rejected, _filter }` | Filter array items based on conditions |
| `action.respond_webhook` | `statusCode?, headers?, body?, respondWithInput?` | Input data + `_webhookResponse` | Store response for webhook caller |

#### 4.4.3 Logic (4)

| Type | Config | Outputs | Description |
|------|--------|---------|-------------|
| `logic.if` | `conditions: FilterCondition[], combineMode: AND\|OR` | `true` / `false` | Conditional branch based on filter conditions |
| `logic.switch` | `field, cases: { value, output }[], defaultOutput?` | Dynamic case outputs / `default` | Multi-way branch based on field value |
| `logic.merge` | `mode: append\|combine\|chooseBranch, combineKey?, preferredBranch?` | `main` | Combine data from multiple input branches |
| `logic.loop` | `sourceField, itemVariable?, indexVariable?, batchSize?` | `main` (items) / `done` | Iterate over array items |

#### 4.4.4 Utility (1)

| Type | Config | Output | Description |
|------|--------|--------|-------------|
| `utility.noop` | `note?: string` | Pass-through | No-op for organization and annotations |

---

## 5. Execution Engine

### 5.1 Execution Flow

```
executeAutomation(em, container, run, definition, triggerData)
  │
  ├── Build adjacency map from connections
  ├── Find trigger node (type starts with 'trigger.', no incoming connections)
  ├── Set trigger output = triggerData
  ├── Initialize BFS queue with trigger's downstream nodes
  │
  └── WHILE queue not empty AND run not timed out:
        │
        ├── Dequeue next node ID
        ├── Skip if already visited (cycle prevention)
        ├── Skip if disabled → record SKIPPED, follow main output
        │
        ├── Resolve input data from connected source nodes
        ├── Look up node type definition from registry
        ├── Interpolate config with variable templates
        │
        ├── Execute node:
        │   ├── Wrap in per-node timeout (default 30s, max 120s)
        │   ├── If retryPolicy configured (maxAttempts > 1):
        │   │   └── Retry with exponential backoff
        │   └── Execute node's execute() function
        │
        ├── On SUCCESS:
        │   ├── Record NodeExecution (COMPLETED)
        │   ├── Store output in nodeOutputs map
        │   ├── Merge _context into runContext
        │   └── Enqueue downstream nodes via outputRoute
        │
        └── On FAILURE:
            ├── Record NodeExecution (FAILED)
            └── Apply error strategy:
                ├── 'stop'     → fail run immediately, return
                ├── 'continue' → follow main output, continue
                └── 'output'   → follow error output, store error data
```

### 5.2 Timeouts

| Level | Default | Maximum | Configurable |
|-------|---------|---------|-------------|
| Per-node | 30 seconds | 120 seconds | Via `_timeout` config field |
| Per-run | 5 minutes | 5 minutes | Not yet configurable |

### 5.3 Retry Policy

When `retryPolicy.maxAttempts > 1`:

```
Attempt 1 → execute
  FAIL → wait intervalMs * backoffMultiplier^0
Attempt 2 → execute
  FAIL → wait intervalMs * backoffMultiplier^1
...
Attempt N → execute
  FAIL → throw (final error propagated to error strategy)
```

- Per-attempt delay capped at 30 seconds
- Total retry time is bounded by node timeout + retry delays

### 5.4 Input Resolution

**Single source**: Node receives the output of its single connected source node directly.

**Multiple sources**: Node receives data namespaced by source node ID:
```typescript
{
  "sourceNodeId1": { /* node 1 output */ },
  "sourceNodeId2": { /* node 2 output */ },
  "_merged": { /* flat Object.assign merge for backward compat */ }
}
```

### 5.5 Variable Interpolation

**Template syntax**: `{{namespace.path.to.value}}`

| Namespace | Resolution | Example |
|-----------|-----------|---------|
| `trigger.*` | Trigger input data | `{{trigger.orderId}}` |
| `nodes.<nodeId>.*` | Specific node's output | `{{nodes.httpRequest.body.id}}` |
| `context.*` | Run context (set by Set Variable) | `{{context.customerId}}` |
| `env.*` | Allowlisted environment variables | `{{env.AUTOMATION_API_KEY}}` |
| `now` | Current ISO timestamp | `{{now}}` |
| `today` | Current date (YYYY-MM-DD) | `{{today}}` |
| *(fallback)* | Tries trigger, then context | `{{orderId}}` |

**Type preservation**: A config value that is entirely a single template (`{{trigger.data}}`) preserves the original type (object, number, etc.). Partial templates (`Order: {{trigger.id}}`) stringify to a string.

**Environment variable security**: Only variables prefixed with `AUTOMATION_`, `PUBLIC_`, or `NEXT_PUBLIC_` are exposed. All other env vars (database URLs, secrets, API keys) are inaccessible.

### 5.6 Filter Conditions

Used by `logic.if`, `action.filter`, and `trigger.event`.

**Operators (14)**:

| Operator | Description | Types |
|----------|-------------|-------|
| `eq` | Equal (strict ===) | Any |
| `neq` | Not equal | Any |
| `gt`, `gte`, `lt`, `lte` | Numeric comparison | Number |
| `contains` | String includes or array contains | String, Array |
| `startsWith`, `endsWith` | String prefix/suffix | String |
| `in`, `notIn` | Value in/not-in array | Any, Array |
| `exists`, `notExists` | Null/undefined check | Any |
| `regex` | Regular expression match | String |

**Combine modes**: `AND` (all conditions must match) or `OR` (any condition matches).

---

## 6. API Contracts

### 6.1 Automation Definitions

#### List definitions

```
GET /api/automations/definitions
Query: page, pageSize, search, enabled, sortField, sortDir
Response: { data: AutomationDefinition[], total: number, page: number, pageSize: number }
```

#### Create definition

```
POST /api/automations/definitions
Body: {
  automationId?: string,     // Auto-generated if omitted
  name?: string,             // Defaults to "Untitled Automation"
  description?: string,
  definition?: { nodes: [], connections: [] },
  enabled?: boolean,         // Default: true
  metadata?: { tags?, category?, icon? }
}
Response: AutomationDefinition
```

#### Get/Update/Delete definition

```
GET    /api/automations/definitions/[id]
PUT    /api/automations/definitions/[id]
DELETE /api/automations/definitions/[id]    // Soft delete
```

#### Manual trigger

```
POST /api/automations/definitions/[id]/run
Body: { input?: Record<string, unknown> }
Response: { runId: string, status: 'RUNNING' }
```

#### Test single node

```
POST /api/automations/definitions/[id]/test-node
Body: { nodeId: string, inputData?: Record<string, unknown> }
Response: NodeExecutionResult
```

### 6.2 Automation Runs

```
GET  /api/automations/runs                  // List all runs
GET  /api/automations/runs/[id]             // Get run + node executions
POST /api/automations/runs/[id]/cancel      // Cancel a running run
GET  /api/automations/definitions/[id]/runs // Runs for a specific definition
```

### 6.3 Node Types Catalog

```
GET /api/automations/node-types
Response: AutomationNodeTypeDefinition[] (type, category, name, description, icon, color, configSchema, inputs, outputs)
```

### 6.4 Webhook Trigger

```
POST /api/automations/webhook/[automationId]
Auth: None (unauthenticated)
Body: any JSON
Response: { ok: true, runId: string }
```

All authenticated routes require `requireAuth: true` and appropriate feature guards.

---

## 7. Events

### 7.1 Module Events (9)

| Event ID | Category | Entity | Description |
|----------|----------|--------|-------------|
| `automations.definition.created` | crud | definition | Definition created |
| `automations.definition.updated` | crud | definition | Definition updated |
| `automations.definition.deleted` | crud | definition | Definition deleted |
| `automations.run.started` | lifecycle | run | Run execution started |
| `automations.run.completed` | lifecycle | run | Run completed successfully |
| `automations.run.failed` | lifecycle | run | Run failed |
| `automations.run.cancelled` | lifecycle | run | Run cancelled |
| `automations.node.started` | lifecycle | node | Node execution started (excludeFromTriggers) |
| `automations.node.completed` | lifecycle | node | Node execution completed (excludeFromTriggers) |

### 7.2 Event Subscriber

- **ID**: `automations:event-trigger`
- **Event**: `*` (wildcard)
- **Persistent**: `true`
- **Excluded prefixes**: `query_index.`, `search.`, `automations.`, `cache.`, `queue.`, `workflows.`
- **Behavior**: Matches event against all enabled definitions' `trigger.event` nodes, evaluates filters, creates runs

### 7.3 Schedule Subscriber

- **ID**: `automations:definition-saved`
- **Event**: `automations.definition.created`, `automations.definition.updated`
- **Behavior**: Syncs cron/interval schedules with the scheduler service when definitions change

---

## 8. Access Control (RBAC)

### 8.1 Features

| Feature | Description | Default Role |
|---------|-------------|-------------|
| `automations.view` | View automation definitions and runs | admin |
| `automations.manage` | Create, edit, delete automations | admin |
| `automations.execute` | Manually trigger automations | admin |
| `automations.view_runs` | View run history and node execution details | admin |

### 8.2 Page Guards

| Page | Required Features |
|------|-------------------|
| List definitions | `automations.view` |
| Create definition | `automations.manage` |
| Edit definition | `automations.manage` |
| View runs | `automations.view_runs` |
| View run detail | `automations.view_runs` |

---

## 9. UI/UX

### 9.1 Visual Editor (AutomationCanvas)

**Technology**: ReactFlow (`@xyflow/react`)

**Canvas features**:
- Drag-and-drop nodes from NodePalette
- Click-and-drag connections between node ports
- Double-click node to open NodeDetailDialog
- Delete nodes/edges with Backspace/Delete key
- MiniMap for navigation
- Grid background with snapping

**Node components** (4 categories, colored by type):

| Component | Types | Color | Handles |
|-----------|-------|-------|---------|
| `TriggerNode` | `trigger.*` | Green | Source (bottom) |
| `ActionNode` | `action.*` | Blue | Target (top) + Source (bottom) |
| `LogicNode` | `logic.*` | Amber | Target (top) + Conditional outputs (bottom, labeled) |
| `UtilityNode` | `utility.*`, `action.delay`, `action.set_variable` | Gray | Target (top) + Source (bottom) |

### 9.2 Node Configuration Dialog (NodeDetailDialog)

**Three-panel layout**:
- **Left (25%)**: INPUT — shows incoming data from connected source nodes
- **Center (50%)**: CONFIG — two tabs:
  - **Parameters**: Dynamic form fields generated from `configSchema` (text, number, boolean, JSON)
  - **Settings**: Disable toggle, error strategy dropdown, retry policy, notes
- **Right (25%)**: OUTPUT — execution result or error details after "Execute step" test

### 9.3 Data Viewer (DataViewer)

Three view modes:
- **Schema**: Key → Type → Preview table
- **Table**: Key → Value two-column table
- **JSON**: Pretty-printed raw JSON

### 9.4 Run Viewer (RunViewer)

- Canvas with status-colored node borders (green=completed, red=failed, blue=running, gray=skipped/pending)
- Execution time shown on each node
- Click node to view execution details
- Read-only mode

### 9.5 Pages

| Path | Purpose |
|------|---------|
| `/backend/automations` | List all automation definitions |
| `/backend/automations/create` | Create new automation (blank canvas) |
| `/backend/automations/[id]` | Edit automation (visual editor) |
| `/backend/automations/[id]/runs` | Run history for a definition |
| `/backend/automations/[id]/runs/[runId]` | Run detail with per-node input/output |

---

## 10. Queue & Worker

### 10.1 Worker Configuration

| Setting | Value |
|---------|-------|
| Queue name | `automation-runs` |
| Worker ID | `automations:run-executor` |
| Concurrency | 5 |
| Queue strategy | `QUEUE_STRATEGY` env (local / async) |

### 10.2 Job Payload

```typescript
interface AutomationRunJob {
  runId: string
  definitionId: string
  triggerData?: Record<string, unknown>
  tenantId: string
  organizationId: string
}
```

### 10.3 Worker Behavior

1. Fork EntityManager for isolation
2. Fetch run — skip if not `RUNNING` (idempotency)
3. Fetch definition — fail run if not found
4. Call `executeAutomation()` — engine handles all node execution
5. On unhandled error: set run status to `FAILED`

---

## 11. Notifications

### 11.1 Notification Types

| Type | Trigger | Icon | Expiry |
|------|---------|------|--------|
| `automations.run.failed` | Run completes with status FAILED | `zap-off` | 168 hours |

**Notification body**: "The automation '{{automationName}}' failed at node '{{errorNodeId}}'"

---

## 12. Internationalization

Supported locales: English (`en`), Polish (`pl`)

Translation keys under `automations.*`:
- `automations.title`, `automations.description`
- `automations.definitions.*` — CRUD labels
- `automations.runs.*` — Run status labels
- `automations.nodeTypes.*` — Display names for all 19 node types
- `automations.notifications.*` — Notification text

---

## 13. Risks & Impact Review

| Risk | Severity | Affected Area | Mitigation | Residual Risk |
|------|----------|---------------|------------|---------------|
| **Runaway execution** — infinite loops or very long chains | High | Worker availability | Run-level timeout (5 min), visited set prevents cycles, node count bounded by definition max (100 nodes) | Pathological branching could still consume time within limits |
| **Code/Transform injection** — user JS code escaping sandbox | High | Security | VM sandboxed with allowlisted globals, per-execution timeout (5s default), no `require`/`import`/`process` access | `vm.runInNewContext` is not a security boundary in Node.js; production hardening should consider `isolated-vm` |
| **Env var leakage** — automation templates exposing secrets | High | Security | Allowlist: only `AUTOMATION_*`, `PUBLIC_*`, `NEXT_PUBLIC_*` prefixes exposed | Users must not prefix secrets with allowed prefixes |
| **Webhook abuse** — unauthenticated endpoint flooded | Medium | Availability | Rate limiting not yet implemented on webhook trigger route | Should add per-IP rate limiting (Phase 2) |
| **Event trigger storms** — high-frequency events creating many runs | Medium | Queue saturation | Excluded prefixes filter out noisy events; definitions must be enabled | No debounce/throttle yet (Phase 3) |
| **Worker starvation** — slow runs blocking concurrency slots | Medium | Throughput | Run timeout (5 min) prevents indefinite blocking; concurrency = 5 | Long-running automations (many nodes with delays) could still occupy slots |
| **Data loss on multi-input merge** — silent key overwrites | Low | Data integrity | Multi-source inputs now namespaced by source node ID; `_merged` available for flat compat | Users must understand namespaced vs. flat input |

---

## 14. Implementation Phases

### Phase 1: Core Engine (DONE)

- [x] Data models: `AutomationDefinition`, `AutomationRun`, `NodeExecution`
- [x] Execution engine: BFS traversal, node dispatch, error strategies
- [x] Node type registry: global registration, category listing
- [x] 14 built-in node types: 4 triggers, 8 actions, 2 logic
- [x] Queue worker: async run processing (concurrency 5)
- [x] Event trigger subscriber: wildcard matching, filter conditions
- [x] Schedule sync subscriber: cron/interval registration
- [x] API routes: full CRUD, manual trigger, test node, webhook trigger, node types catalog
- [x] Visual editor: ReactFlow canvas, node palette, node config dialog
- [x] Run viewer: execution timeline, per-node input/output
- [x] RBAC: 4 features, admin defaults
- [x] Events: 9 module events
- [x] Notifications: run failed
- [x] i18n: EN, PL

### Phase 2: Production Hardening (DONE)

- [x] Retry policy implementation: exponential backoff with configurable attempts
- [x] Per-node timeout (30s default, 120s max)
- [x] Per-run timeout (5 minutes)
- [x] Env var allowlist (restrict `{{env.*}}` to safe prefixes)
- [x] Fix update-entity: configurable base URL, tenant headers
- [x] Fix transform/code: try-catch around VM execution
- [x] Multi-input resolution: namespace by source node ID

### Phase 3: n8n Feature Parity — Node Types (DONE)

- [x] `logic.merge` — combine branches (append/combine/chooseBranch)
- [x] `logic.loop` — iterate over arrays with batch support
- [x] `action.filter` — filter array items with matching/rejected outputs
- [x] `action.respond_webhook` — return response to webhook caller
- [x] `utility.noop` — pass-through for annotations

### Phase 4: Webhook & Trigger Hardening (TODO)

- [ ] Webhook trigger auth enforcement (header token, basic auth)
- [ ] Webhook trigger rate limiting (per-IP, per-automation)
- [ ] Webhook trigger response integration (return `_webhookResponse` from run context)
- [ ] Event trigger debounce/throttle (configurable per trigger node)
- [ ] Schedule trigger cron syntax validation (validate before registration)

### Phase 5: Advanced Execution (TODO)

- [ ] Async delay via queue continuation (delays > 30s pause the run and re-enqueue)
- [ ] Parallel branch execution (fork node outputs execute concurrently)
- [ ] Sub-automation node (`action.run_automation` — call another automation)
- [ ] Error trigger node (`trigger.error` — workflow-level error handler)
- [ ] Execution data streaming via SSE (live node status during run)
- [ ] Run cancellation propagation (cancel in-flight node executions)

### Phase 6: Editor UX Polish (TODO)

- [ ] Expression editor with field autocomplete (browse available `{{}}` variables)
- [ ] Node pinning (save test output for downstream testing)
- [ ] Undo/redo history (canvas state stack)
- [ ] Auto-layout (Dagre-based graph arrangement)
- [ ] Copy/paste nodes
- [ ] Bulk operations (multi-select, bulk delete/disable)
- [ ] Visual cron builder (UI for schedule trigger config)
- [ ] Credential vault UI (manage integration credentials)

### Phase 7: Enterprise Features (TODO)

- [ ] Workflow versioning UI (compare versions, rollback)
- [ ] Execution comparison (diff two runs)
- [ ] Workflow templates / marketplace (share automations)
- [ ] Audit log integration (track definition changes)
- [ ] Advanced node types: Aggregate, Compare Datasets, HTML/Markdown, Crypto, Date/Time

---

## 15. Migration & Backward Compatibility

### 15.1 Contract Surfaces

| Surface | Classification | Notes |
|---------|---------------|-------|
| Node type IDs (`trigger.event`, etc.) | FROZEN | Cannot rename/remove once published |
| `AutomationDefinition.definition` JSONB schema | ADDITIVE-ONLY | New node fields must be optional |
| API route paths | STABLE | Cannot rename; new query params OK |
| Event IDs | FROZEN | Cannot rename/remove |
| Filter operators | STABLE | New operators OK; cannot change existing semantics |
| Node registry `execute()` contract | STABLE | Cannot change `NodeExecutionContext` or `NodeExecutionResult` required fields |

### 15.2 Deprecation Protocol

- Never remove a node type in one release
- Mark deprecated node types with `deprecated: true` in the definition
- Provide migration path in release notes
- Remove after 2 minor versions

---

## 16. Testing Strategy

### 16.1 Unit Tests

| Area | Test File | Coverage |
|------|-----------|----------|
| Execution engine | `lib/__tests__/execution-engine.test.ts` | BFS traversal, timeout, retry, error strategies, multi-input resolution |
| Filter conditions | `lib/__tests__/filters.test.ts` | All 14 operators, AND/OR combine modes, nested values |
| Variable interpolation | `lib/__tests__/variable-interpolation.test.ts` | All namespaces, type preservation, env allowlist |
| Individual node types | `lib/node-types/__tests__/*.test.ts` | Execute function for each node type |

### 16.2 Integration Tests (Playwright)

| Test Case | Coverage |
|-----------|----------|
| TC-AUTO-001 | Definition CRUD (create, list, update, delete) |
| TC-AUTO-002 | Manual trigger execution (create definition, run, verify node executions) |
| TC-AUTO-003 | Event trigger (emit event, verify automation fires) |
| TC-AUTO-004 | Visual editor (add nodes, connect, configure, save) |
| TC-AUTO-005 | Run history (list runs, filter by status, view node detail) |
| TC-AUTO-006 | Error handling (node failure with stop/continue/output strategies) |
| TC-AUTO-007 | Webhook trigger (POST to webhook endpoint, verify run created) |

---

## 17. File Structure

```
packages/core/src/modules/automations/
├── index.ts                          # Module metadata
├── setup.ts                          # Default role features (admin → automations.*)
├── acl.ts                            # 4 RBAC features
├── ce.ts                             # Custom entities (empty)
├── cli.ts                            # CLI commands (empty)
├── di.ts                             # DI registration (execution engine, node registry)
├── events.ts                         # 9 module events
├── notifications.ts                  # 1 notification type (run.failed)
│
├── api/
│   ├── openapi.ts                    # OpenAPI factory
│   ├── definitions/
│   │   ├── route.ts                  # GET/POST definitions
│   │   └── [id]/
│   │       ├── route.ts             # GET/PUT/DELETE definition
│   │       ├── run/route.ts         # POST manual trigger
│   │       ├── test-node/route.ts   # POST test single node
│   │       └── runs/
│   │           ├── route.ts         # GET runs for definition
│   │           └── [runId]/route.ts # GET single run
│   ├── runs/
│   │   ├── route.ts                 # GET all runs
│   │   └── [id]/
│   │       ├── route.ts            # GET run detail
│   │       └── cancel/route.ts     # POST cancel run
│   ├── node-types/route.ts          # GET node type catalog
│   └── webhook/[automationId]/route.ts  # POST webhook trigger
│
├── backend/
│   └── automations/
│       ├── page.tsx                  # List page
│       ├── create/page.tsx           # Create page
│       ├── [id]/
│       │   ├── page.tsx             # Edit page (visual editor)
│       │   └── runs/
│       │       ├── page.tsx         # Run history
│       │       └── [runId]/page.tsx # Run detail
│       └── *.meta.ts                # Page metadata
│
├── components/
│   ├── AutomationCanvas.tsx          # ReactFlow canvas
│   ├── NodeDetailDialog.tsx          # Node config modal (3-panel)
│   ├── NodeDetailConfig.tsx          # Config form (parameters + settings)
│   ├── NodePalette.tsx               # Drag-and-drop node catalog
│   ├── DataViewer.tsx                # JSON/table/schema data viewer
│   ├── RunViewer.tsx                 # Execution graph viewer
│   └── nodes/
│       ├── TriggerNode.tsx           # Green trigger node
│       ├── ActionNode.tsx            # Blue action node
│       ├── LogicNode.tsx             # Amber logic node
│       └── UtilityNode.tsx           # Gray utility node
│
├── data/
│   ├── entities.ts                   # 3 ORM entities + type definitions
│   ├── validators.ts                 # Zod schemas (CRUD, filters, queries)
│   └── extensions.ts                 # Entity extensions
│
├── lib/
│   ├── execution-engine.ts           # BFS execution with retry + timeout
│   ├── node-type-registry.ts         # Global node type registry
│   ├── automation-graph-utils.ts     # Graph traversal utilities
│   ├── variable-interpolation.ts     # {{template}} resolution
│   ├── filters.ts                    # Condition evaluation (14 operators)
│   ├── schedule-sync.ts              # Cron schedule management
│   └── node-types/
│       ├── index.ts                  # Registration of all 19 built-in nodes
│       ├── triggers/
│       │   ├── manual.ts
│       │   ├── event.ts
│       │   ├── webhook.ts
│       │   └── schedule.ts
│       ├── actions/
│       │   ├── http-request.ts
│       │   ├── send-email.ts
│       │   ├── update-entity.ts
│       │   ├── emit-event.ts
│       │   ├── transform.ts
│       │   ├── code.ts
│       │   ├── delay.ts
│       │   ├── set-variable.ts
│       │   ├── filter.ts
│       │   └── respond-webhook.ts
│       ├── logic/
│       │   ├── if.ts
│       │   ├── switch.ts
│       │   ├── merge.ts
│       │   └── loop.ts
│       └── utility/
│           └── noop.ts
│
├── subscribers/
│   ├── event-trigger.ts              # Wildcard event → automation dispatch
│   └── definition-saved.ts           # Sync schedules on definition save
│
├── workers/
│   └── automation-runs.worker.ts     # Queue worker (concurrency: 5)
│
├── i18n/
│   ├── en.json
│   └── pl.json
│
└── migrations/
    └── .snapshot-open-mercato.json
```

---

## 18. Final Compliance Report

| Check | Status | Notes |
|-------|--------|-------|
| Singular entity naming | PASS | `AutomationDefinition`, `AutomationRun`, `NodeExecution` |
| FK IDs only (no ORM cross-module) | PASS | `definitionId` is a string FK, no MikroORM relationship |
| Organization ID on all scoped entities | PASS | All 3 entities have `organization_id` |
| Tenant isolation in queries | PASS | All queries filter by `tenantId` |
| Zod validation for all inputs | PASS | All API routes validate with zod schemas |
| Event-based side effects | PASS | 9 module events, event trigger uses event bus |
| UUID PKs | PASS | All entities use UUID primary keys |
| Soft delete | PASS | `deleted_at` on AutomationDefinition |
| No direct ORM relationships between modules | PASS | No cross-module entity imports |
| RBAC features declared | PASS | 4 features in `acl.ts`, defaults in `setup.ts` |

---

## Changelog

### 2026-04-09

- Initial specification covering complete module architecture
- Documented all 19 node types (Phases 1–3)
- Documented execution engine with retry policy and timeouts (Phase 2)
- Documented env var security restrictions
- Defined Phases 4–7 roadmap (webhook hardening, advanced execution, editor polish, enterprise)
- Added risk assessment, testing strategy, backward compatibility contract
