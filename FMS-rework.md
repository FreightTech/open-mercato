# NEW FMS File (Teczka) Specification

## Overview

FMS File is a lightweight folder that groups transport units related to a specific transport need for a BCO client. It has no status field — status is derived from the state of units and legs.

A file is either **FCL** or **LCL** — never mixed. Both use the same **FmsFileUnit** entity as the trackable row. For FCL, each container is a unit. For LCL, the entire consolidated cargo lot is a single unit. This means both FCL and LCL can be displayed in one unified transport table.

### Design Principles

1. **Easy creation** — sparse information is enough: which BCO, how many containers of which sizes, from where to where
2. **Multi-modal transport planning** — ordered chain of transport legs (TRUCK, SHIP, RAIL, AIR) linking origin to destination
3. **Parallel legs** — legs with the same sequence number run in parallel (e.g., some containers by truck, others by rail)
4. **SCD timestamps** — all departure/arrival timestamps keep full change history as append-only JSONB arrays
5. **No workflow engine** — the file is just a folder, not a state machine
6. **Unified tracking unit** — FCL and LCL share one entity (`FmsFileUnit`). FCL: one unit per container. LCL: one unit per file (consolidated). Enables a single list/transport table for both types

### Module Strategy

New `fms_files` module in `packages/fms/src/modules/fms_files/`. Built alongside existing `fms_projects` (no modification to existing module). Independent of offers/RFQs for now.

---

## Data Model

### 4 Entities

| # | Entity | Table | Purpose |
|---|--------|-------|---------|
| 1 | FmsFile | `fms_files` | The folder/teczka |
| 2 | FmsFileUnit | `fms_file_units` | Trackable unit: one per container (FCL) or one per file (LCL) |
| 3 | FmsFileLeg | `fms_file_legs` | Transport segment with SCD timestamps |
| 4 | FmsFileUnitLeg | `fms_file_unit_legs` | Assigns unit to leg + per-leg transport details |

---

### Entity 1: `FmsFile`

**Table:** `fms_files`

The folder itself. No status column — status is derived. The `cargo_type` field determines whether units are containers (FCL) or consolidated cargo (LCL). The `shipment_type` field classifies the trade direction (export, import, or local).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | Tenant scope |
| `tenant_id` | uuid | no | | Tenant scope |
| `reference_number` | text | no | | Unique per org, auto-generated (see format below) |
| `shipment_type` | enum: EXP / IMP / LOC | no | | Export, Import, or Local |
| `cargo_type` | enum: FCL / LCL | no | | Determines unit semantics |
| `contractor_id` | uuid | no | | BCO client -> Contractor |
| `assignee_id` | uuid | yes | | User handling the file |
| `notes` | text | yes | | Free-form notes |
| `created_at` | timestamptz | no | now() | |
| `created_by` | uuid | yes | | User who created the file |
| `updated_at` | timestamptz | no | now() | |
| `updated_by` | uuid | yes | | User who last updated |
| `deleted_at` | timestamptz | yes | | Soft delete |

**Reference number format:** `{TYPE}/{CARGO}/{SEQUENCE}/{YEAR}/{CONTRACTOR}`
- **TYPE**: `EXP`, `IMP`, or `LOC` (from `shipment_type`)
- **CARGO**: `FCL` or `LCL` (from `cargo_type`)
- **SEQUENCE**: 4-digit zero-padded, auto-incremented per org + year + type + cargo
- **YEAR**: 4-digit current year
- **CONTRACTOR**: Short name from the linked Contractor entity
- Example: `EXP/FCL/0001/2026/MAERSK`, `IMP/LCL/0003/2026/ACME`
- Generated at creation time using SELECT MAX + increment pattern with retry on unique constraint violation

**Indexes:**
- `fms_files_org_tenant_idx` on (organization_id, tenant_id)
- `fms_files_number_unique` unique on (organization_id, reference_number)
- `fms_files_contractor_idx` on (contractor_id)

**Relationships:**
- `units` -> OneToMany -> FmsFileUnit
- `legs` -> OneToMany -> FmsFileLeg

---

### Entity 2: `FmsFileUnit`

**Table:** `fms_file_units`

The unified trackable unit. For FCL files, there is one unit per physical container. For LCL files, there is one unit per file representing the consolidated cargo lot. Both share common fields (origin, destination, weight) with type-specific nullable columns for the differences.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | |
| `tenant_id` | uuid | no | | |
| `file_id` | uuid | no | | FK -> FmsFile |
| `cargo_type` | enum: FCL / LCL | no | | Denormalized from file for query convenience |
| `origin_location_id` | uuid | no | | First origin -> FmsLocation |
| `destination_location_id` | uuid | no | | Final destination -> FmsLocation |
| **Shared cargo fields:** | | | | |
| `commodity_description` | text | yes | | FCL: optional cargo description; LCL: summary of all packages |
| `gross_weight` | numeric(12,3) | yes | | FCL: container cargo weight; LCL: total weight of all packages |
| `weight_unit` | text | yes | | kg/lb/ton/mt |
| `volume` | numeric(12,3) | yes | | FCL: optional; LCL: total volume of all packages |
| `volume_unit` | text | yes | | cbm/cft/liter |
| `is_hazardous` | boolean | no | false | FCL: container hazmat flag; LCL: true if any package is hazardous |
| **FCL-specific:** | | | | |
| `container_number` | text | yes | | FCL: physical container number (unknown initially). LCL: null |
| `container_type` | text | yes | | FCL: free-form (20GP/40GP/40HC/45HC/20RF/40RF/40RH/20OT/40OT/20FR/40FR). LCL: null |
| **LCL-specific:** | | | | |
| `package_count` | int | yes | | FCL: null. LCL: total number of packages |
| `packages_detail` | jsonb | yes | | FCL: null. LCL: array of per-package detail objects (see below) |
| **Common:** | | | | |
| `sort_order` | int | no | 0 | Display ordering |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |
| `deleted_at` | timestamptz | yes | | Soft delete |

**`packages_detail` JSONB structure (LCL only):**

```typescript
type PackageDetail = {
  commodityDescription: string
  packageType: string         // PLT/CTN/PKG/UNT/BOX/CRT/DRM/BAG
  packageCount: number
  grossWeight: number
  weightUnit: string
  volume: number
  volumeUnit: string
  isHazardous: boolean
  hazmatClass?: string
  unNumber?: string
  temperatureMin?: number
  temperatureMax?: number
  length?: number
  width?: number
  height?: number
  dimensionUnit?: string
  declaredValue?: number
  declaredValueCurrency?: string
  marksAndNumbers?: string
}
```

**How unit counts work:**

| File type | Units per file | Example |
|-----------|---------------|---------|
| FCL with 32 containers | 32 FmsFileUnit rows | Each row: `cargo_type=FCL`, `container_number=MSMU...`, `container_type=40HC`, `gross_weight=24000` |
| LCL with 5 packages | 1 FmsFileUnit row | One row: `cargo_type=LCL`, `package_count=46`, `gross_weight=8360`, `packages_detail=[{...},{...}...]` |

**Indexes:**
- `fms_file_units_file_idx` on (file_id)
- `fms_file_units_cargo_type_idx` on (cargo_type)

**Relationships:**
- `file` -> ManyToOne -> FmsFile
- `unitLegs` -> OneToMany -> FmsFileUnitLeg

---

### Entity 3: `FmsFileLeg`

**Table:** `fms_file_legs`

A transport segment. Parallel legs share the same `leg_sequence` number. Ship/Air-specific fields are nullable columns on the same table. All 6 departure/arrival timestamps use SCD JSONB arrays for full change history.

The `bl_number` field holds the Master B/L for SHIP legs (shared across all units on the leg).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | |
| `tenant_id` | uuid | no | | |
| `file_id` | uuid | no | | FK -> FmsFile |
| `leg_sequence` | int | no | | Same number = parallel legs |
| `type` | enum | no | | TRUCK / SHIP / RAIL / AIR |
| `origin_location_id` | uuid | no | | FK -> FmsLocation |
| `destination_location_id` | uuid | no | | FK -> FmsLocation |
| **SCD Timestamps (departure):** | | | | |
| `ptd_timestamps` | jsonb | yes | | Planned departure history |
| `etd_timestamps` | jsonb | yes | | Estimated departure history |
| `atd_timestamps` | jsonb | yes | | Actual departure history |
| **SCD Timestamps (arrival):** | | | | |
| `pta_timestamps` | jsonb | yes | | Planned arrival history |
| `eta_timestamps` | jsonb | yes | | Estimated arrival history |
| `ata_timestamps` | jsonb | yes | | Actual arrival history |
| **Booking / carrier / B/L:** | | | | |
| `booking_number` | text | yes | | |
| `carrier_id` | uuid | yes | | FK -> Contractor |
| `bl_number` | text | yes | | Master B/L (SHIP legs) |
| **SHIP-specific (leg-level):** | | | | |
| `vessel_name` | text | yes | | |
| `vessel_imo` | text | yes | | |
| `voyage_number` | text | yes | | |
| **AIR-specific (leg-level):** | | | | |
| `flight_number` | text | yes | | |
| `aircraft_type` | text | yes | | |
| `notes` | text | yes | | |
| `created_at` | timestamptz | no | now() | |
| `created_by` | uuid | yes | | User who created the leg |
| `updated_at` | timestamptz | no | now() | |
| `updated_by` | uuid | yes | | User who last updated |
| `deleted_at` | timestamptz | yes | | Soft delete |

**Leg type enum:**

| Type | Description |
|------|-------------|
| `TRUCK` | Truck transport (FCL: container on chassis; LCL: loose cargo) |
| `SHIP` | Vessel transport |
| `RAIL` | Rail transport |
| `AIR` | Air freight |

**Indexes:**
- `fms_file_legs_file_idx` on (file_id)
- `fms_file_legs_sequence_idx` on (file_id, leg_sequence)

**Relationships:**
- `file` -> ManyToOne -> FmsFile
- `unitLegs` -> OneToMany -> FmsFileUnitLeg

---

### Entity 4: `FmsFileUnitLeg`

**Table:** `fms_file_unit_legs`

Assigns a unit to a leg. Carries per-assignment transport details that vary by leg type (truck: plates/driver, ship: seal/B/L, consolidation info). Both FCL and LCL use the same columns — the semantic meaning of `bl_number` differs (FCL: per-container B/L; LCL: House B/L).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | |
| `tenant_id` | uuid | no | | |
| `unit_id` | uuid | no | | FK -> FmsFileUnit |
| `leg_id` | uuid | no | | FK -> FmsFileLeg |
| **TRUCK-specific:** | | | | |
| `truck_plate` | text | yes | | |
| `trailer_plate` | text | yes | | |
| `driver_full_name` | text | yes | | |
| `driver_id_number` | text | yes | | |
| `driver_phone` | text | yes | | |
| **SHIP-specific:** | | | | |
| `seal_number` | text | yes | | FCL: seal on container. LCL: null |
| `bl_number` | text | yes | | FCL: per-container B/L. LCL: House B/L |
| `consolidation_container_number` | text | yes | | FCL: null. LCL: shared container number for SHIP/RAIL legs |
| `notes` | text | yes | | |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |
| `deleted_at` | timestamptz | yes | | Soft delete |

**Unique constraint:** `(organization_id, unit_id, leg_id)`

**Indexes:**
- `fms_file_unit_legs_unit_idx` on (unit_id)
- `fms_file_unit_legs_leg_idx` on (leg_id)

**Relationships:**
- `unit` -> ManyToOne -> FmsFileUnit
- `leg` -> ManyToOne -> FmsFileLeg

---

## Unified Transport Table

Both FCL and LCL units appear in a single query on `FmsFileUnit` joined with `FmsFile`:

| Reference # | Type | Container / Commodity | Weight | Origin | Destination | Status |
|-------------|------|-----------------------|--------|--------|-------------|--------|
| EXP/FCL/0012/2026/MAERSK | FCL | MSMU3828891 (40HC) | 24,000 kg | Gdansk (Factory) | Rotterdam (Depot A) | In Transit |
| EXP/FCL/0012/2026/MAERSK | FCL | MSMU3826055 (40HC) | 22,500 kg | Gdansk (Factory) | Rotterdam (Depot A) | In Transit |
| IMP/LCL/0003/2026/ACME | LCL | Electronics, Auto parts... | 8,360 kg | Rotterdam (Port) | Warsaw | Ready |

- **FCL**: N rows per file (one per container). Shows `container_number (container_type)`.
- **LCL**: 1 row per file. Shows `commodity_description`.
- **Weight** column works for both — `gross_weight` on FmsFileUnit.

---

## B/L Number Placement

| Level | Field | Scope |
|-------|-------|-------|
| **Leg** (`FmsFileLeg.bl_number`) | Master B/L | Shared across all units on the SHIP leg |
| **Unit-Leg** (`FmsFileUnitLeg.bl_number`) | Per-unit B/L | FCL: individual container B/L. LCL: House B/L |
| **Unit-Leg** (`FmsFileUnitLeg.consolidation_container_number`) | Consolidation container | LCL only: which shared container the cargo rides in for SHIP/RAIL legs |

---

## SCD Timestamp Pattern

All departure/arrival timestamps on `FmsFileLeg` use the existing SCD (Slowly Changing Dimension) pattern: append-only JSONB arrays where each entry records the value, source, and when it was recorded.

### Timestamp Entry Type

```typescript
type LegTimestampEntry = {
  value: string            // ISO 8601 datetime
  offset: string | null    // Timezone offset (+08:00, Z)
  source: TimestampSource  // 'carrier_api' | 'manual' | 'ais' | 'port' | 'edi'
  updatedAt: string        // When this entry was recorded (ISO 8601)
  sourceEventId?: string | null
}
```

### Current Value Resolution

No separate column for the "current" value. It is computed at read time using the **"latest update wins"** strategy -- the entry with the most recent `updatedAt` is the primary value.

```typescript
const currentEta = getPrimaryTimestampValue(leg.etaTimestamps)
```

### 6 Timestamp Columns Per Leg

| Column | Meaning |
|--------|---------|
| `ptd_timestamps` | **Planned** departure -- original schedule at booking time |
| `etd_timestamps` | **Estimated** departure -- current best estimate, may change |
| `atd_timestamps` | **Actual** departure -- confirmed event |
| `pta_timestamps` | **Planned** arrival -- original schedule at booking time |
| `eta_timestamps` | **Estimated** arrival -- current best estimate, may change |
| `ata_timestamps` | **Actual** arrival -- confirmed event |

### Utility Functions

Copied into the `fms_files` module (consistent with existing pattern of per-module copies). The canonical source is `packages/shipment-tracking/src/modules/shipment_tracking/lib/timestamp-utils.ts`.

- `createTimestampEntry(value, offset, source)` -- creates a new entry with `updatedAt = now()`
- `addTimestampEntry(entries, newEntry)` -- appends to the array (with dedup: same value+source is skipped), returns new array
- `getLatestTimestamp(entries)` -- returns entry with most recent `updatedAt`
- `getPrimaryTimestampValue(entries)` -- returns the `Date` from the latest entry
- `getTimestampHistory(entries)` -- returns entries sorted oldest to newest

### Note: PTD/PTA are new

The existing codebase (`FmsSeaContainer`) uses 4 SCD columns (ETD/ETA/ATD/ATA) and `TimestampType = 'ETD' | 'ETA' | 'ATD' | 'ATA'`. This spec introduces PTD and PTA as new concepts. The per-column utility functions (`createTimestampEntry`, `getLatestTimestamp`, etc.) are column-agnostic and work for all 6 columns without modification. However, `mergeExtractedTimestamps` from `shipment-tracking` only handles 4 types — a new merge function will be needed if tracking integration is added later.

### Leg-Type-Aware Timestamp Routing

The 6 timestamp columns (PTD, ETD, ATD, PTA, ETA, ATA) behave differently depending on the leg type. This distinction is applied consistently in both the transport table and the file detail leg table.

| Leg type | Storage | Semantics |
|----------|---------|-----------|
| **TRUCK** | `FmsFileUnitLeg.ptd / etd / atd / pta / eta / ata` (plain text fields, per assignment) | Each truck dispatches and arrives independently — timestamps are per-unit |
| **SHIP / RAIL / AIR** | `FmsFileLeg.ptdTimestamps / etdTimestamps / …` (SCD JSONB arrays, per leg) | All units on the same leg depart and arrive together — timestamps are shared |

**Save routing** (implemented in both `fms-files-transport/page.tsx` and `TransportView.tsx`):

```
if legType === 'TRUCK':
    PUT /api/fms_files/unit-legs/{unitLegId}   { ptd / etd / … }
else:
    POST /api/fms_files/files/{fileId}/legs/{legId}/timestamps   { timestampType, value }
```

The `POST .../timestamps` endpoint appends a new `{ value, offset, source: 'manual', updatedAt }` entry to the leg's SCD array. Editing the timestamp on **any** unit row for the same SHIP/RAIL/AIR leg updates that single shared array, and all sibling unit rows reflect the change on the next refresh.

**Data read** (transport API `GET /api/fms_files/transport`):

```typescript
ptd: leg.type === 'TRUCK' ? ul.ptd : leg.ptdTimestamps?.at(-1)?.value
// repeated for etd, atd, pta, eta, ata
```

For non-Truck legs the full SCD arrays (`ptdTimestamps`, `etdTimestamps`, …) are also returned alongside the current scalar value so the UI can render the timestamp history tooltip on hover.

---

## Computed Derived Status

The file has no `status` column. Status is derived from unit assignments and leg timestamps. Both FCL and LCL operate uniformly on `FmsFileUnit` via `FmsFileUnitLeg`.

| Derived Status | Condition |
|----------------|-----------|
| **Empty** | No units or no legs |
| **Planning** | Has units but not all have a complete leg chain (origin -> destination) |
| **Ready** | All units have a complete leg chain from their origin to their destination |
| **In Transit** | At least one leg has ATD but no ATA |
| **Delivered** | All units' final legs have ATA |
| **Partially Delivered** | Some final legs have ATA, others don't |

---

## Computed Warnings

Warnings are computed at query time (not stored). A validation service checks for:

| Warning | Rule |
|---------|------|
| **Schedule conflict** | For any unit assigned to consecutive legs N and N+1: leg N's primary ETA or ATA is after leg N+1's primary PTD or ETD |
| **Uncovered unit** | Unit's `origin_location_id` does not match the `origin_location_id` of its first assigned leg, or `destination_location_id` does not match the `destination_location_id` of its last assigned leg |
| **Route gap** | For any unit assigned to consecutive legs N and N+1: leg N's `destination_location_id` != leg N+1's `origin_location_id` |
| **Unassigned unit** | Unit is not assigned to any leg |

All warnings operate uniformly on `FmsFileUnit` -> `FmsFileUnitLeg` chains, regardless of cargo type.

---

## ER Diagram

```
┌──────────────────────────┐
│         FmsFile           │
│──────────────────────────│
│ refNumber                 │
│ shipmentType EXP/IMP/LOC │
│ cargoType FCL/LCL         │
│ contractorId              ├──────► Contractor (BCO)
│ assigneeId                ├──────► User
└──┬──────────┬────────────┘
   │          │
   │ 1:N      │ 1:N
   │          │
   ▼          ▼
┌────────────────────────┐    ┌──────────────────────────┐
│     FmsFileUnit         │    │      FmsFileLeg           │
│────────────────────────│    │──────────────────────────│
│ cargoType FCL/LCL       │    │ legSequence               │
│ originLocationId        ├──► │ type (TRUCK/SHIP/RAIL/AIR) │
│ destinationLocId        │    │ origin/dest               ├──► FmsLocation
│                         │    │ *_timestamps              │ (6 SCD JSONB arrays)
│ -- shared --            │    │ carrierId                 ├──► Contractor
│ commodityDescription    │    │ blNumber (Master B/L)     │
│ grossWeight / weightUnit│    │ vessel/flight (nullable)  │
│ volume / volumeUnit     │    └──────────────┬────────────┘
│ isHazardous             │                   │
│                         │                   │
│ -- FCL only --          │                   │
│ containerNumber         │                   │
│ containerType           │                   │
│                         │                   │
│ -- LCL only --          │                   │
│ packageCount            │                   │
│ packagesDetail (jsonb)  │                   │
└──────────┬──────────────┘                   │
           │                                  │
           │              N:M                 │
           │  ┌───────────────────────────┐   │
           └─►│    FmsFileUnitLeg          │◄──┘
              │───────────────────────────│
              │ unitId + legId (unique)    │
              │ truckPlate / trailerPlate  │
              │ driverFullName / phone     │
              │ sealNumber                 │
              │ blNumber (per-unit B/L)    │
              │ consolidationContainerNum  │
              └───────────────────────────┘
```

---

## Design Decisions Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Parallel legs | Same `leg_sequence` number | Simple, intuitive. Sequence 1 -> 2 means "after". Two legs at sequence 2 means "parallel" |
| 2 | Type-specific data | Single table, nullable columns | Simpler queries and code vs. separate tables per transport type |
| 3 | Vessel data placement | On the leg (not per-unit) | All units on a sea leg share the same vessel |
| 4 | File status | No status column -- derived | The file is just a folder. Status comes from data |
| 5 | Container type | Free-form text with UI suggestions | Matches `fms_projects` pattern. Synced containers may have ISO 6346 codes (e.g., "22G1") that don't match human-readable codes |
| 6 | Carrier reference | FK to Contractor | Carriers are contractors with a 'carrier' role type |
| 7 | **Unified tracking unit** | **FmsFileUnit for both FCL and LCL** | **One entity, one list table. FCL: one unit per container. LCL: one unit per file. Eliminates 2 entities (6->4), one set of CRUD, one set of queries** |
| 8 | Offer integration | Independent for now | No link to offers/RFQs. Can add optional FK later |
| 9 | Module approach | New `fms_files` module | Clean slate alongside existing `fms_projects` |
| 10 | Timestamps | 6 SCD JSONB arrays per leg | Full change history. Planned/Estimated/Actual x Departure/Arrival |
| 11 | Timestamp sources | Existing 5 (carrier_api, manual, ais, port, edi) | Sufficient for all current use cases |
| 12 | Timestamp utilities | Copied into fms_files module | Consistent with existing per-module copy pattern |
| 13 | **LCL as single consolidated unit** | **One FmsFileUnit row per LCL file** | **The forwarder tracks the consolidated lot, not individual packages. Per-package detail stored as JSONB on the unit** |
| 14 | **LCL package detail** | **JSONB `packages_detail` column on FmsFileUnit** | **Simple, no extra entity. Sufficient for display/editing. Individual packages don't need independent search/query** |
| 15 | LCL consolidation | Optional `consolidation_container_number` on FmsFileUnitLeg | Track which shared container the cargo rides in for SHIP/RAIL legs, when known |
| 16 | **Leg types** | **4 types: TRUCK / SHIP / RAIL / AIR** | **Removed LCL_TRUCK. The unit's `cargo_type` already distinguishes container-on-chassis from loose cargo. Simplifies the enum** |
| 17 | B/L placement | Master B/L on leg, per-unit B/L on FmsFileUnitLeg | FCL: per-container B/L. LCL: House B/L. Same column, different semantics based on cargo_type |
| 18 | Shipment type | `EXP / IMP / LOC` enum on FmsFile | Required for reference number generation and trade direction classification |
| 19 | Reference number | `{TYPE}/{CARGO}/{SEQ}/{YEAR}/{CONTRACTOR}` | Follows existing `fms_projects` pattern. SELECT MAX + increment with retry on unique constraint violation |
| 20 | Soft delete | `deleted_at` on all 4 entities | Consistent with every other FMS entity. Preserves audit trail |
| 21 | **Denormalized cargo_type** | **`cargo_type` on both FmsFile and FmsFileUnit** | **Allows direct filtering on the unit table without joining to file. Query convenience for the transport table** |
| 22 | Audit columns | `created_by`/`updated_by` on FmsFile and FmsFileLeg | Track which user created/modified records. Other child entities inherit context from parent |
| 23 | PTD/PTA timestamps | New concepts (not in existing codebase) | Existing `fms_projects` only has ETD/ETA/ATD/ATA. PTD/PTA track the original schedule at booking time, separate from evolving estimates |
| 24 | **Weight on unit** | **`gross_weight` on FmsFileUnit for both FCL and LCL** | **Enables unified list table sorting/filtering by weight regardless of cargo type** |

---

## UI Wireframes

### Wire 1: File List Page (grouped by file)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Dashboard / Files                                          Search     ⌘K   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FMS Files                                            Search...     [+ New]│
│                                                                             │
│  ┌─────┬──────────┬────────────┐                                           │
│  │ All │ My Files │ In Transit │  +                                        │
│  └─────┴──────────┴────────────┘                                           │
│  ┌───┬──────────────────────┬────────┬─────┬─────┬──────────┬─────────────┐│
│  │ # │ Reference #          │ Status │ Type│ Ship│ Client   │ Origin      ││
│  ├───┼──────────────────────┼────────┼─────┼─────┼──────────┼─────────────┤│
│  │ 1 │ EXP/FCL/0012/2026/  │In      │ FCL │ EXP │ Maersk   │ Shanghai    ││
│  │   │ MAERSK               │Transit │     │     │          │             ││
│  ├───┼──────────────────────┼────────┼─────┼─────┼──────────┼─────────────┤│
│  │ 2 │ IMP/LCL/0003/2026/  │Ready   │ LCL │ IMP │ Acme     │ Rotterdam   ││
│  │   │ ACME                 │        │     │     │          │             ││
│  ├───┼──────────────────────┼────────┼─────┼─────┼──────────┼─────────────┤│
│  │ 3 │ EXP/FCL/0011/2026/  │Plan-   │ FCL │ EXP │ CMA CGM  │ Gdansk      ││
│  │   │ CMACGM               │ning    │     │     │          │             ││
│  └───┴──────────────────────┴────────┴─────┴─────┴──────────┴─────────────┘│
│  ┌────────────────────────────────────────────────── (continued columns) ──┐│
│  │ Destination    │ Units          │ Assignee    │ Created    │ Actions    ││
│  ├────────────────┼────────────────┼─────────────┼────────────┼────────────┤│
│  │ Rotterdam      │ 32x 40HC       │ J. Kowalski │ 12 Mar '26 │ ...        ││
│  │ Warsaw         │ 1 (46 pkgs)    │ A. Nowak    │ 10 Mar '26 │ ...        ││
│  │ Rotterdam      │ 8x 20GP        │ J. Kowalski │ 8 Mar '26  │ ...        ││
│  └────────────────┴────────────────┴─────────────┴────────────┴────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

**List page notes:**
- This is the **file-level** list (one row per file). See Wire 7 for the unified transport table.
- **Status** column shows derived status as a colored badge (not editable)
- **Type** column shows FCL/LCL badge
- **Ship** column shows EXP/IMP/LOC
- **Units** column shows: FCL = count + container types summary; LCL = "1 (N pkgs)" showing one unit with total package count
- Perspective tabs (All, My Files, In Transit) are user-configurable via DynamicTable
- Clicking a row navigates to the file detail page

---

### Wire 2: File Detail -- FCL File (Full Page Layout)

The detail page is organized top-down: header, warnings, units, route legs overview, leg detail tabs. All tabular sections use DynamicTable for inline editing and keyboard navigation. Cross-table navigation via `siblingTableRefs` connects all tables on the page.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Dashboard / Files / Details                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  EXP/FCL/0012/2026/MAERSK  [FCL] [EXP] [In Transit]           Delete      │
│                                                                             │
│  ┌─────────────┬───────────────┬───────────┬────────────────────────────┐  │
│  │ CLIENT      │ ASSIGNEE      │ UNITS     │ CREATED                    │  │
│  │ Maersk Ltd  │ J. Kowalski   │ 32x 40HC  │ 12 Mar 2026               │  │
│  └─────────────┴───────────────┴───────────┴────────────────────────────┘  │
│                                                                             │
│  ┌── Warnings (2) ─────────────────────────────────────────────────────┐  │
│  │ ! Schedule conflict: Leg 2 ETA Apr 27 > Leg 3 PTD Apr 25           │  │
│  │ ! Unassigned unit: (TBD) container not assigned to any leg         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  UNITS (32)                                                   [+ Add Unit] │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DynamicTable: FmsFileUnit rows (editable)                           │   │
│  │ Container # │ Type │ Weight   │ Origin          │ Destination │ Cov.│   │
│  │ MSMU3828000 │ 40HC │ 24,000kg │ Gdansk (Factory)│ Rott. Dep.A │ 3/3│   │
│  │ MSMU3828001 │ 40HC │ 22,500kg │ Gdansk (Factory)│ Rott. Dep.A │ 3/3│   │
│  │ (TBD)       │ 40HC │   --     │ Gdansk (Factory)│ Rott. Dep.A │!0/3│   │
│  │ ...+29 more                                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ROUTE LEGS                                                   [+ Add Leg]  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DynamicTable: FmsFileLeg rows (editable, add row inline)            │   │
│  │ Seq │ Type  │ Origin          │ Destination      │ Carrier  │ETD│ETA│   │
│  │ 1   │ TRUCK │ Gdansk (Factory)│ Gdansk (Port)    │ TransLog │5Mr│5Mr│   │
│  │ 2   │ SHIP  │ Gdansk (Port)   │ Rotterdam (Port) │ MSC      │12M│27A│   │
│  │ 3   │ TRUCK │ Rotterdam (Port)│ Rott. (Depot A)  │ EuroTr.  │28A│28A│   │
│  │ 3   │ TRUCK │ Rotterdam (Port)│ Rott. (Depot B)  │ NL Log.  │28A│28A│   │
│  │ [+ add new leg row]                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  LEG DETAIL                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Tab: [Leg 1: TRUCK ▸ Gdansk] [Leg 2: SHIP ▸ Rott.] [Leg 3 (x2)] │   │
│  │                                                                     │   │
│  │ Leg 2: SHIP — Gdansk (Port) -> Rotterdam (Port)                    │   │
│  │ Carrier: MSC   Booking: 177LFNFND60342   MBL: MSCUSHA12345        │   │
│  │ Vessel: MSC POSITANO   IMO: 9930561   Voyage: FE412A              │   │
│  │ PTD: 12 Mar  ETD: 12 Mar  ATD: 12 Mar 18:00                       │   │
│  │ PTA: 8 Apr   ETA: 27 Apr (3x)   ATA: --                           │   │
│  │                                                                     │   │
│  │ Units on this leg (32/32)                        [Assign Units]    │   │
│  │ ┌───────────────────────────────────────────────────────────────┐  │   │
│  │ │ DynamicTable: FmsFileUnitLeg rows (editable)                  │  │   │
│  │ │ Container #│ Type│ Weight  │ Seal #    │ B/L           │Notes │  │   │
│  │ │ MSMU382800 │ 40HC│ 24,000kg│ MSC-00123 │ MSCUSH..-01   │      │  │   │
│  │ │ MSMU382801 │ 40HC│ 22,500kg│ MSC-00124 │ MSCUSH..-02   │      │  │   │
│  │ │ ...                                                           │  │   │
│  │ └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Detail page layout notes:**
- Top-down flow: header -> warnings -> units -> route legs -> leg detail
- **Units DynamicTable** shows all FmsFileUnit rows (the "what are we shipping" section). Container # is editable inline. Leg Coverage column shows assigned/required legs.
- **Route Legs DynamicTable** shows all FmsFileLeg rows (the "how are we getting it there" section). Editable inline: type, origin, dest, carrier, ETD/ETA. New legs are added as new rows.
- **Leg Detail tabs** are generated from the legs data, grouped by `legSequence`. Selecting a tab shows that leg's metadata card + a DynamicTable of FmsFileUnitLeg rows for that leg.
- Clicking a row in the Route Legs table auto-selects the corresponding Leg Detail tab (two-way sync).
- **Context-sensitive columns** in the unit-leg DynamicTable per leg type:
  - TRUCK: Container #, Type, Weight, Truck Plate, Trailer, Driver, Seal #
  - SHIP: Container #, Type, Weight, Seal #, B/L, Consol. Container
  - AIR: Container #, Type, Weight, AWB #
- Parallel legs (same sequence) share one tab. Within the tab, each parallel leg gets its own sub-section with a separate DynamicTable.
- All 4 DynamicTables are linked via `siblingTableRefs` for cross-table keyboard navigation.

---

### Wire 3: File Detail -- LCL Variant

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  IMP/LCL/0003/2026/ACME  [LCL] [IMP] [Ready]                  Delete      │
│                                                                             │
│  ┌─────────────┬───────────────┬──────────┬────────────────────────────┐   │
│  │ CLIENT      │ ASSIGNEE      │ PACKAGES │ CREATED                    │   │
│  │ Acme Corp   │ A. Nowak      │ 46 total │ 10 Mar 2026               │   │
│  └─────────────┴───────────────┴──────────┴────────────────────────────┘   │
│                                                                             │
│  UNIT (1)                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DynamicTable: single FmsFileUnit row                                │   │
│  │ Commodity             │ Pkgs │ Weight  │ Volume │ Haz │ Origin│Dest │   │
│  │ Electronics, Auto...  │  46  │ 8,360kg │ 49 cbm │  !  │ Rott. │Wawa│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  PACKAGE DETAIL (packages_detail JSONB)                        [+ Add]     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DynamicTable: per-package breakdown (editable)                      │   │
│  │ # │ Commodity       │ Pkgs │ Type │ Weight  │ Volume │ Haz?        │   │
│  │ 1 │ Electronics     │  12  │ PLT  │ 2,400kg │ 14 cbm│  No         │   │
│  │ 2 │ Auto parts      │   8  │ CTN  │   960kg │  6 cbm│  No         │   │
│  │ 3 │ Chemicals (CL3) │   4  │ DRM  │   800kg │  3 cbm│ !Yes        │   │
│  │ 4 │ Textiles        │  20  │ BOX  │ 1,200kg │ 18 cbm│  No         │   │
│  │ 5 │ Machine parts   │   2  │ CRT  │ 3,000kg │  8 cbm│  No         │   │
│  │ [+ add new package row]                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ROUTE LEGS                                                   [+ Add Leg]  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DynamicTable: FmsFileLeg rows (editable)                            │   │
│  │ Seq │ Type  │ Origin          │ Destination   │ Carrier    │ETD│ETA │   │
│  │ 1   │ SHIP  │ Rotterdam (Port)│ Gdynia (Port) │ Unifeeder  │15M│18M │   │
│  │ 2   │ TRUCK │ Gdynia (Port)   │ Warsaw        │ PL Transp. │19M│20M │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  LEG DETAIL                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Tab: [Leg 1: SHIP ▸ Gdynia] [Leg 2: TRUCK ▸ Warsaw]              │   │
│  │                                                                     │   │
│  │ Leg 1: SHIP — Rotterdam (Port) -> Gdynia (Port)                    │   │
│  │ Carrier: Unifeeder   MBL: UFDR-NL-PL-2026-0088                    │   │
│  │ Vessel: RITA   Voyage: 2026-W12                                    │   │
│  │ PTD: 15 Mar  ETD: 15 Mar  ATD: 15 Mar 06:00                       │   │
│  │ PTA: 18 Mar  ETA: 18 Mar  ATA: 18 Mar 14:30                       │   │
│  │                                                                     │   │
│  │ Unit assignment (1 row):                                            │   │
│  │ ┌───────────────────────────────────────────────────────────────┐  │   │
│  │ │ DynamicTable: single FmsFileUnitLeg row (editable)            │  │   │
│  │ │ Consol. Container #  │ House B/L      │ Notes                 │  │   │
│  │ │ TRIU8801234           │ HBL-ACME-001   │                       │  │   │
│  │ └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**LCL variant notes:**
- Same top-down layout as FCL: header -> unit -> package detail -> route legs -> leg detail
- Unit DynamicTable has 1 row (the consolidated LCL cargo lot)
- Package Detail DynamicTable renders `packages_detail` JSONB array as editable rows (add/edit/remove individual packages). Totals auto-aggregate to the unit row above.
- Route Legs and Leg Detail sections work identically to FCL
- Leg Detail tabs show 1 unit-leg assignment row per tab. SHIP tabs show consolidation container + House B/L. TRUCK tabs show truck plate + driver.

---

### Wire 6: Create File Dialog

```
┌─────────────────────────────────────────────────────────┐
│  Create New File                                    X   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Shipment Type *        Cargo Type *                    │
│  ┌─────────────────┐    ┌─────────────────┐            │
│  │ v Export (EXP)   │    │ v FCL            │            │
│  └─────────────────┘    └─────────────────┘            │
│                                                         │
│  Client (BCO) *                                         │
│  ┌─────────────────────────────────────────┐            │
│  │ Search contractors...                   │            │
│  └─────────────────────────────────────────┘            │
│                                                         │
│  Assignee                                               │
│  ┌─────────────────────────────────────────┐            │
│  │ Search users...                         │            │
│  └─────────────────────────────────────────┘            │
│                                                         │
│  --- Quick Container Setup (FCL only) ---               │
│                                                         │
│  ┌──────┐  ┌───────────────┐  ┌────────────────────┐   │
│  │ Qty  │  │ Type          │  │ Origin             │   │
│  │ 4    │  │ v 40HC        │  │ Select location... │   │
│  └──────┘  └───────────────┘  └────────────────────┘   │
│                                ┌────────────────────┐   │
│                                │ Destination        │   │
│                                │ Select location... │   │
│                                └────────────────────┘   │
│  [+ Add another size]                                   │
│                                                         │
│  Notes                                                  │
│  ┌─────────────────────────────────────────┐            │
│  │                                         │            │
│  └─────────────────────────────────────────┘            │
│                                                         │
│                         [Cancel (Esc)]  [Create Cmd+En] │
└─────────────────────────────────────────────────────────┘
```

**Create dialog notes:**
- Minimal required fields: shipment type, cargo type, client (BCO)
- Quick Container Setup appears only when cargo type is FCL -- allows specifying quantity + type + shared origin/destination in one step (creates N containers with same origin/destination)
- "Add another size" allows mixing container sizes (e.g., 4x 40HC + 2x 20GP)
- When cargo type is LCL, the Quick Container Setup section is replaced with a simpler "You can add packages after creating the file" hint
- Reference number is auto-generated on submit (not shown in the form)
- Dialog follows platform conventions: Cmd+Enter to submit, Escape to cancel

---

### Wire 7: Unified Transport Table (all units across files)

This is the cross-file view that shows every FmsFileUnit as a row. FCL containers and LCL consolidated lots appear side by side.

```
│                                                                             │
│  Transport Units                                      Search...  [Filters] │
│                                                                             │
│  ┌─────────────────────┬─────┬──────────────────────┬─────────┬───────────┐│
│  │ Reference #         │ Type│ Container / Commodity │ Weight  │ Origin    ││
│  ├─────────────────────┼─────┼──────────────────────┼─────────┼───────────┤│
│  │ EXP/FCL/0012/2026/  │ FCL │ MSMU3828891 (40HC)   │24,000 kg│ Gdansk    ││
│  │ MAERSK               │     │                      │         │ (Factory) ││
│  ├─────────────────────┼─────┼──────────────────────┼─────────┼───────────┤│
│  │ EXP/FCL/0012/2026/  │ FCL │ MSMU3826055 (40HC)   │22,500 kg│ Gdansk    ││
│  │ MAERSK               │     │                      │         │ (Factory) ││
│  ├─────────────────────┼─────┼──────────────────────┼─────────┼───────────┤│
│  │ ...31 more from same │     │                      │         │           ││
│  ├─────────────────────┼─────┼──────────────────────┼─────────┼───────────┤│
│  │ IMP/LCL/0003/2026/  │ LCL │ Electronics, Auto    │ 8,360 kg│ Rotterdam ││
│  │ ACME                 │     │ parts, Chemicals...  │         │ (Port)    ││
│  └─────────────────────┴─────┴──────────────────────┴─────────┴───────────┘│
│  ┌──────────────────────────────────────────── (continued columns) ────────┐│
│  │ Destination      │ Status     │ Client    │ Assignee    │ Ship │       ││
│  ├──────────────────┼────────────┼───────────┼─────────────┼──────┤       ││
│  │ Rotterdam (Dep.A)│ In Transit │ Maersk    │ J. Kowalski │ EXP  │       ││
│  │ Rotterdam (Dep.A)│ In Transit │ Maersk    │ J. Kowalski │ EXP  │       ││
│  │                  │            │           │             │      │       ││
│  │ Warsaw           │ Ready      │ Acme Corp │ A. Nowak    │ IMP  │       ││
│  └──────────────────┴────────────┴───────────┴─────────────┴──────┘       ││
└─────────────────────────────────────────────────────────────────────────────┘
```

**Transport table notes:**
- This is a flat query on `FmsFileUnit JOIN FmsFile`
- FCL files expand to N rows (one per container). LCL files are 1 row.
- **Container / Commodity** column shows: FCL = `container_number (container_type)`, LCL = `commodity_description`
- **Weight** column shows `gross_weight` for both types — sortable, filterable
- Clicking a row navigates to the file detail page
- Can be filtered by cargo_type, shipment_type, status, client, assignee

---

### UI Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Units on top** | Units (what we're shipping) are the first data section. Route legs (how we ship it) come below |
| **Three DynamicTables** | Units table, Route Legs table, and Unit-Leg assignments table inside leg detail tabs. All support inline editing and cross-table keyboard navigation via `siblingTableRefs` |
| **Legs as tabs** | Each transport leg is a tab. Tab content = leg metadata card + DynamicTable of unit-leg assignments. Context-sensitive columns per leg type |
| **Parallel = shared tab** | Legs with the same `leg_sequence` share one tab with sub-sections for each parallel leg |
| **Route Legs overview** | Always-visible editable DynamicTable showing all legs. New legs added as inline rows. Clicking a row auto-selects the corresponding leg detail tab |
| **Derived status = badge** | Status is a non-editable colored badge, computed from data |
| **Warnings below header** | Warning banner appears only when computed warnings exist. Each warning identifies affected units |
| **SCD history on click** | Timestamps that changed show update count; clicking opens a popover with full history |
| **Context-sensitive columns** | DynamicTable inside leg detail tabs shows columns relevant to the leg type (TRUCK: plates/driver, SHIP: seal/B/L) |
| **Unified transport table** | List page: both FCL and LCL units in one flat DynamicTable. FCL: one row per container. LCL: one row per file |
| **Easy creation** | Create dialog asks for minimal info; units and legs are added inline after file creation |

---

## Future Considerations (Out of Scope)

- **Offer integration** -- optional `offer_id` FK on FmsFile to pre-populate from accepted offers
- **RAIL leg specifics** -- to be defined when rail transport requirements are clear
- **AIR leg specifics** -- MAWB/HAWB numbers, ULD types
- **Financial tracking** -- cost/revenue lines per leg or per file (like current FmsProjectLine)
- **Document management** -- linking FmsDocument to files
- **Tracking integration** -- syncing SCD timestamps from shipment_tracking package
- **Promote packages_detail to entity** -- if LCL packages need independent search/filtering, `packages_detail` JSONB can be migrated to a child entity later
