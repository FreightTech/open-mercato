# NEW FMS File (Teczka) Specification

## Overview

FMS File is a lightweight folder that groups containers (FCL) or packages (LCL) related to a specific transport need for a BCO client. It has no status field — status is derived from the state of legs and containers/packages.

A file is either **FCL** or **LCL** — never mixed. FCL files track containers. LCL files track cargo lots (packages) that may be consolidated into shared containers for certain legs.

### Design Principles

1. **Easy creation** — sparse information is enough: which BCO, how many containers of which sizes, from where to where
2. **Multi-modal transport planning** — ordered chain of transport legs (TRUCK, SHIP, RAIL, AIR, LCL_TRUCK) linking origin to destination
3. **Parallel legs** — legs with the same sequence number run in parallel (e.g., some containers by truck, others by rail)
4. **SCD timestamps** — all departure/arrival timestamps keep full change history as append-only JSONB arrays
5. **No workflow engine** — the file is just a folder, not a state machine
6. **FCL and LCL are separate entity trees** — containers and packages are fundamentally different; each has its own entity and leg-assignment table

### Module Strategy

New `fms_files` module in `packages/fms/src/modules/fms_files/`. Built alongside existing `fms_projects` (no modification to existing module). Independent of offers/RFQs for now.

---

## Data Model

### 6 Entities

| # | Entity | Table | Purpose | Used by |
|---|--------|-------|---------|---------|
| 1 | FmsFile | `fms_files` | The folder/teczka | FCL + LCL |
| 2 | FmsFileContainer | `fms_file_containers` | FCL container with origin/destination | FCL only |
| 3 | FmsFilePackage | `fms_file_packages` | LCL cargo lot with full cargo detail | LCL only |
| 4 | FmsFileLeg | `fms_file_legs` | Transport segment with SCD timestamps | FCL + LCL |
| 5 | FmsFileLegContainer | `fms_file_leg_containers` | Assigns container to leg + type-specific details | FCL only |
| 6 | FmsFileLegPackage | `fms_file_leg_packages` | Assigns package to leg + consolidation container # | LCL only |

---

### Entity 1: `FmsFile`

**Table:** `fms_files`

The folder itself. No status column — status is derived. The `cargo_type` field determines whether the file uses containers (FCL) or packages (LCL). The `shipment_type` field classifies the trade direction (export, import, or local).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | Tenant scope |
| `tenant_id` | uuid | no | | Tenant scope |
| `reference_number` | text | no | | Unique per org, auto-generated (see format below) |
| `shipment_type` | enum: EXP / IMP / LOC | no | | Export, Import, or Local |
| `cargo_type` | enum: FCL / LCL | no | | Determines child entity type |
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
- `containers` -> OneToMany -> FmsFileContainer (FCL only)
- `packages` -> OneToMany -> FmsFilePackage (LCL only)
- `legs` -> OneToMany -> FmsFileLeg

---

### Entity 2: `FmsFileContainer` (FCL only)

**Table:** `fms_file_containers`

A physical steel container. Each defines its own first origin and final destination. Container number may be unknown at creation time.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | |
| `tenant_id` | uuid | no | | |
| `file_id` | uuid | no | | FK -> FmsFile |
| `container_number` | text | yes | | Unknown initially |
| `container_type` | text | no | | Free-form; common values: 20GP/40GP/40HC/45HC/20RF/40RF/40RH/20OT/40OT/20FR/40FR |
| `origin_location_id` | uuid | no | | First origin -> FmsLocation |
| `destination_location_id` | uuid | no | | Final destination -> FmsLocation |
| `sort_order` | int | no | 0 | Display ordering |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |
| `deleted_at` | timestamptz | yes | | Soft delete |

**Indexes:**
- `fms_file_containers_file_idx` on (file_id)

**Relationships:**
- `file` -> ManyToOne -> FmsFile

---

### Entity 3: `FmsFilePackage` (LCL only)

**Table:** `fms_file_packages`

A cargo lot (loose packages) with full cargo detail. Each defines its own first origin and final destination. Packages get consolidated into shared containers for SHIP/RAIL legs.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | |
| `tenant_id` | uuid | no | | |
| `file_id` | uuid | no | | FK -> FmsFile |
| `origin_location_id` | uuid | no | | First origin -> FmsLocation |
| `destination_location_id` | uuid | no | | Final destination -> FmsLocation |
| `sort_order` | int | no | 0 | Display ordering |
| **Cargo detail fields:** | | | | |
| `commodity_description` | text | yes | | |
| `package_type` | enum | yes | | PLT/CTN/PKG/UNT/BOX/CRT/DRM/BAG |
| `package_count` | int | yes | | |
| `length` | numeric(10,2) | yes | | |
| `width` | numeric(10,2) | yes | | |
| `height` | numeric(10,2) | yes | | |
| `dimension_unit` | enum | yes | | cm/in/m/ft |
| `gross_weight` | numeric(12,3) | yes | | |
| `net_weight` | numeric(12,3) | yes | | |
| `weight_unit` | enum | yes | | kg/lb/ton/mt |
| `volume` | numeric(12,3) | yes | | |
| `volume_unit` | enum | yes | | cbm/cft/liter |
| `is_hazardous` | boolean | no | false | |
| `hazmat_class` | text | yes | | |
| `un_number` | text | yes | | |
| `temperature_min` | numeric(6,2) | yes | | Reefer min |
| `temperature_max` | numeric(6,2) | yes | | Reefer max |
| `declared_value` | numeric(18,2) | yes | | |
| `declared_value_currency` | text | yes | | |
| `marks_and_numbers` | text | yes | | Shipping marks |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |
| `deleted_at` | timestamptz | yes | | Soft delete |

**Indexes:**
- `fms_file_packages_file_idx` on (file_id)

**Relationships:**
- `file` -> ManyToOne -> FmsFile

---

### Entity 4: `FmsFileLeg`

**Table:** `fms_file_legs`

A transport segment. Parallel legs share the same `leg_sequence` number. Ship/Air-specific fields are nullable columns on the same table. All 6 departure/arrival timestamps use SCD JSONB arrays for full change history.

The `bl_number` field holds the Master B/L for SHIP legs (shared across all containers/packages on the leg).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | |
| `tenant_id` | uuid | no | | |
| `file_id` | uuid | no | | FK -> FmsFile |
| `leg_sequence` | int | no | | Same number = parallel legs |
| `type` | enum | no | | TRUCK / SHIP / RAIL / AIR / LCL_TRUCK |
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

| Type | Description | Used by |
|------|-------------|---------|
| `TRUCK` | FCL truck transport (container on chassis) | FCL |
| `SHIP` | Vessel transport | FCL + LCL |
| `RAIL` | Rail transport | FCL + LCL |
| `AIR` | Air freight | FCL + LCL |
| `LCL_TRUCK` | Loose cargo truck (no container) | LCL |

**Indexes:**
- `fms_file_legs_file_idx` on (file_id)
- `fms_file_legs_sequence_idx` on (file_id, leg_sequence)

**Relationships:**
- `file` -> ManyToOne -> FmsFile
- `legContainers` -> OneToMany -> FmsFileLegContainer (FCL)
- `legPackages` -> OneToMany -> FmsFileLegPackage (LCL)

---

### Entity 5: `FmsFileLegContainer` (FCL only)

**Table:** `fms_file_leg_containers`

Assigns a container to a leg. Type-specific per-container data uses nullable columns on a single table.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | |
| `tenant_id` | uuid | no | | |
| `leg_id` | uuid | no | | FK -> FmsFileLeg |
| `container_id` | uuid | no | | FK -> FmsFileContainer |
| **TRUCK-specific:** | | | | |
| `truck_plate` | text | yes | | |
| `trailer_plate` | text | yes | | |
| `driver_full_name` | text | yes | | |
| `driver_id_number` | text | yes | | |
| `driver_phone` | text | yes | | |
| **SHIP-specific (per-container):** | | | | |
| `seal_number` | text | yes | | |
| `bl_number` | text | yes | | Individual container B/L |
| `notes` | text | yes | | |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |
| `deleted_at` | timestamptz | yes | | Soft delete |

**Unique constraint:** `(organization_id, leg_id, container_id)`

**Indexes:**
- `fms_file_leg_containers_leg_idx` on (leg_id)
- `fms_file_leg_containers_container_idx` on (container_id)

**Relationships:**
- `leg` -> ManyToOne -> FmsFileLeg
- `container` -> ManyToOne -> FmsFileContainer

---

### Entity 6: `FmsFileLegPackage` (LCL only)

**Table:** `fms_file_leg_packages`

Assigns a package (cargo lot) to a leg. Tracks which consolidation container the cargo rides in for SHIP/RAIL legs, plus the House B/L. For LCL_TRUCK legs, tracks truck and driver info.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | gen_random_uuid() | PK |
| `organization_id` | uuid | no | | |
| `tenant_id` | uuid | no | | |
| `leg_id` | uuid | no | | FK -> FmsFileLeg |
| `package_id` | uuid | no | | FK -> FmsFilePackage |
| **Consolidation (SHIP/RAIL legs):** | | | | |
| `consolidation_container_number` | text | yes | | Which shared container this cargo is in |
| `hbl_number` | text | yes | | House B/L number |
| **LCL_TRUCK-specific:** | | | | |
| `truck_plate` | text | yes | | |
| `driver_full_name` | text | yes | | |
| `driver_phone` | text | yes | | |
| `notes` | text | yes | | |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |
| `deleted_at` | timestamptz | yes | | Soft delete |

**Unique constraint:** `(organization_id, leg_id, package_id)`

**Indexes:**
- `fms_file_leg_packages_leg_idx` on (leg_id)
- `fms_file_leg_packages_package_idx` on (package_id)

**Relationships:**
- `leg` -> ManyToOne -> FmsFileLeg
- `package` -> ManyToOne -> FmsFilePackage

---

## Entity Usage by File Type

| Entity | FCL File | LCL File |
|--------|----------|----------|
| FmsFile | yes | yes |
| FmsFileContainer | yes | no |
| FmsFilePackage | no | yes |
| FmsFileLeg | yes | yes |
| FmsFileLegContainer | yes (TRUCK/SHIP legs) | no |
| FmsFileLegPackage | no | yes (all leg types) |

---

## B/L Number Placement

| Level | Field | Scope |
|-------|-------|-------|
| **Leg** (`FmsFileLeg.bl_number`) | Master B/L | Shared across all containers/packages on the SHIP leg |
| **Leg-Container** (`FmsFileLegContainer.bl_number`) | Individual container B/L | Per-container B/L for FCL SHIP legs |
| **Leg-Package** (`FmsFileLegPackage.hbl_number`) | House B/L | Per-cargo-lot House B/L for LCL SHIP legs |

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

---

## Computed Derived Status

The file has no `status` column. Status is derived from container/package assignments and leg timestamps.

| Derived Status | Condition |
|----------------|-----------|
| **Empty** | No containers/packages or no legs |
| **Planning** | Has containers/packages but not all have a complete leg chain (origin -> destination) |
| **Ready** | All containers/packages have a complete leg chain from their origin to their destination |
| **In Transit** | At least one leg has ATD but no ATA |
| **Delivered** | All containers'/packages' final legs have ATA |
| **Partially Delivered** | Some final legs have ATA, others don't |

For FCL files, the unit tracked is the container via FmsFileLegContainer.
For LCL files, the unit tracked is the package via FmsFileLegPackage.

---

## Computed Warnings

Warnings are computed at query time (not stored). A validation service checks for:

| Warning | Rule |
|---------|------|
| **Schedule conflict** | For any container/package assigned to consecutive legs N and N+1: leg N's primary ETA or ATA is after leg N+1's primary PTD or ETD |
| **Uncovered container/package** | Container's/package's `origin_location_id` does not match the `origin_location_id` of its first assigned leg, or `destination_location_id` does not match the `destination_location_id` of its last assigned leg |
| **Route gap** | For any container/package assigned to consecutive legs N and N+1: leg N's `destination_location_id` != leg N+1's `origin_location_id` |
| **Unassigned container/package** | Container/package is not assigned to any leg |

For FCL files, warnings operate on container -> leg chains via FmsFileLegContainer.
For LCL files, warnings operate on package -> leg chains via FmsFileLegPackage.

---

## ER Diagram

```
┌──────────────────────┐
│       FmsFile         │
│──────────────────────│
│ refNumber             │
│ shipmentType EXP/IMP/LOC │
│ cargoType FCL/LCL     │
│ contractorId          ├──────► Contractor (BCO)
│ assigneeId            ├──────► User
└──┬────┬────┬─────────┘
   │    │    │
   │    │    │ 1:N (FCL only)           1:N (LCL only)
   │    │    ▼                          │
   │    │  ┌──────────────────┐        ▼
   │    │  │ FmsFileContainer  │  ┌──────────────────┐
   │    │  │──────────────────│  │ FmsFilePackage     │
   │    │  │ containerNumber   │  │──────────────────│
   │    │  │ containerType     │  │ commodity/dims    │
   │    │  │ (20GP/40HC/...)   │  │ weight/volume     │
   │    │  │ originLocationId  │  │ hazmat/temp       │
   │    │  │ destinationLocId  │  │ marks/numbers     │
   │    │  └────────┬─────────┘  │ originLocationId  │
   │    │           │            │ destinationLocId  │
   │    │           │            └────────┬─────────┘
   │    │           │                     │
   │    │ 1:N       │                     │
   │    ▼           │                     │
   │  ┌──────────────────┐               │
   │  │   FmsFileLeg      │               │
   │  │──────────────────│               │
   │  │ legSequence       │  (same = parallel)
   │  │ type (TRUCK/SHIP/ │
   │  │  RAIL/AIR/LCL_TRUCK)│
   │  │ origin/dest       ├──► FmsLocation
   │  │ *_timestamps      │  (6 SCD JSONB arrays)
   │  │ carrierId         ├──► Contractor
   │  │ blNumber          │  (Master B/L for SHIP)
   │  │ vessel/flight     │  (nullable, type-specific)
   │  └──┬────────────┬──┘
   │     │            │
   │     │ 1:N        │ 1:N
   │     ▼            ▼
   │  ┌─────────────────┐  ┌──────────────────┐
   │  │FmsFileLeg       │  │FmsFileLeg        │
   │  │Container (FCL)  │  │Package (LCL)     │
   │  │─────────────────│  │──────────────────│
   │  │ legId+contId    │  │ legId+pkgId      │
   │  │ truck plates    │  │ consolidation    │
   │  │ driver info     │  │   container #    │
   │  │ seal number     │  │ hbl number       │
   │  │ bl number       │  │ truck/driver     │
   │  └────────▲────────┘  └────────▲─────────┘
   │           │                     │
   │      N:1  │                N:1  │
   │  FmsFileContainer       FmsFilePackage
   │
```

---

## Design Decisions Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Parallel legs | Same `leg_sequence` number | Simple, intuitive. Sequence 1 -> 2 means "after". Two legs at sequence 2 means "parallel" |
| 2 | Type-specific data | Single table, nullable columns | Simpler queries and code vs. separate tables per transport type |
| 3 | Vessel data placement | On the leg (not per-container) | All containers on a sea leg share the same vessel |
| 4 | File status | No status column -- derived | The file is just a folder. Status comes from data |
| 5 | Container sizes | Enum (20GP, 40GP, 40HC, 45HC, 20RF, 40RF, 40RH) | Consistent, searchable, prevents typos |
| 6 | Carrier reference | FK to Contractor | Carriers are contractors with a 'carrier' role type |
| 7 | LCL detail level | Full cargo fields on FmsFilePackage | Includes dims, weight, hazmat, temperature, declared value, marks |
| 8 | Offer integration | Independent for now | No link to offers/RFQs. Can add optional FK later |
| 9 | Module approach | New `fms_files` module | Clean slate alongside existing `fms_projects` |
| 10 | Timestamps | 6 SCD JSONB arrays per leg | Full change history. Planned/Estimated/Actual x Departure/Arrival |
| 11 | Timestamp sources | Existing 5 (carrier_api, manual, ais, port, edi) | Sufficient for all current use cases |
| 12 | Timestamp utilities | Copied into fms_files module | Consistent with existing per-module copy pattern |
| 13 | FCL vs LCL | Separate entity trees, one type per file | Containers and packages are fundamentally different. `cargo_type` on FmsFile determines which entities are used |
| 14 | LCL tracking unit | The package/cargo lot | The forwarder doesn't control the consolidation container. Packages are the primary tracked unit |
| 15 | LCL consolidation | Optional `consolidation_container_number` on FmsFileLegPackage | Track which shared container the cargo rides in for SHIP/RAIL legs, when known |
| 16 | LCL truck transport | Separate `LCL_TRUCK` leg type | Loose cargo on a truck (no container). Different from FCL `TRUCK` (container on chassis) |
| 17 | B/L placement | Master B/L on leg, individual/House B/L on leg-container/leg-package | Clean separation: MBL shared on leg, per-unit B/L on assignment entities |
| 18 | Shipment type | `EXP / IMP / LOC` enum on FmsFile | Required for reference number generation and trade direction classification |
| 19 | Reference number | `{TYPE}/{CARGO}/{SEQ}/{YEAR}/{CONTRACTOR}` | Follows existing `fms_projects` pattern. SELECT MAX + increment with retry on unique constraint violation |
| 20 | Soft delete | `deleted_at` on all 6 entities | Consistent with every other FMS entity. Preserves audit trail for containers, packages, legs, and assignments |
| 21 | Container type | Free-form text with UI suggestions | Matches `fms_projects` pattern. Synced containers may have ISO 6346 codes (e.g., "22G1") that don't match human-readable codes |
| 22 | Audit columns | `created_by`/`updated_by` on FmsFile and FmsFileLeg | Track which user created/modified records. Other child entities inherit context from parent |
| 23 | PTD/PTA timestamps | New concepts (not in existing codebase) | Existing `fms_projects` only has ETD/ETA/ATD/ATA. PTD/PTA track the original schedule at booking time, separate from evolving estimates |

---

## UI Wireframes

### Wire 1: File List Page

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
│  ├───┼──────────────────────┼────────┼─────┼─────┼──────────┼─────────────┤│
│  │ 4 │ LOC/FCL/0001/2026/  │Part.   │ FCL │ LOC │ Hamburg  │ Hamburg     ││
│  │   │ HAMBSUD              │Deliv.  │     │     │ Sud      │             ││
│  └───┴──────────────────────┴────────┴─────┴─────┴──────────┴─────────────┘│
│  ┌────────────────────────────────────────────────── (continued columns) ──┐│
│  │ Destination    │ Containers/Pkgs│ Assignee    │ Created    │ Actions    ││
│  ├────────────────┼────────────────┼─────────────┼────────────┼────────────┤│
│  │ Rotterdam      │ 32x 40HC       │ J. Kowalski │ 12 Mar '26 │ ...        ││
│  │ Warsaw         │ 5 packages     │ A. Nowak    │ 10 Mar '26 │ ...        ││
│  │ Rotterdam      │ 8x 20GP        │ J. Kowalski │ 8 Mar '26  │ ...        ││
│  │ Gdynia         │ 2x 40HC        │ --          │ 5 Mar '26  │ ...        ││
│  └────────────────┴────────────────┴─────────────┴────────────┴────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

**List page notes:**
- **Status** column shows derived status as a colored badge (not editable)
- **Type** column shows FCL/LCL badge
- **Ship** column shows EXP/IMP/LOC
- **Containers/Pkgs** column shows count + types summary for FCL, or package count for LCL
- Perspective tabs (All, My Files, In Transit) are user-configurable via DynamicTable
- Clicking a row navigates to the file detail page

---

### Wire 2: File Detail -- FCL File (Header + Warnings)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Dashboard / Files / Details                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  EXP/FCL/0012/2026/MAERSK  [FCL] [EXP] [In Transit]           Delete      │
│                                                                             │
│  ┌─────────────┬───────────────┬───────────┬────────────────────────────┐  │
│  │ CLIENT      │ ASSIGNEE      │ CONTAINERS│ CREATED                    │  │
│  │ Maersk Ltd  │ J. Kowalski   │ 32x 40HC  │ 12 Mar 2026               │  │
│  └─────────────┴───────────────┴───────────┴────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ NOTES                                                          [Edit]│  │
│  │ Fibre optic cables shipment, handle with care. Booking confirmed.   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌── Warnings (2) ─────────────────────────────────────────────────────┐  │
│  │ ! Schedule conflict: Leg 2 (SHIP) ETA Apr 27 is after              │  │
│  │   Leg 3 (TRUCK) PTD Apr 25 for containers MSMU3828891, MSMU3826055 │  │
│  │ ! Unassigned container: MSMU3827827 is not assigned to any leg     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
```

**Header notes:**
- Reference number is the page title, followed by inline badges for cargo type, shipment type, and derived status
- Key metadata displayed as a compact key-value grid (similar to current FMS Project header)
- Warnings banner appears below header only when computed warnings exist
- Each warning message identifies the affected containers/packages by number

---

### Wire 3: File Detail -- Transport Legs (FCL)

The transport legs section is the centerpiece of the file detail page. Each leg renders as a card with origin-destination header, 6 SCD timestamps, carrier/booking info, and a nested table of assigned containers.

```
│                                                                             │
│  === Transport Legs =======================================     [+ Add Leg] │
│                                                                             │
│  ┌─ Leg 1: TRUCK ──────────────────────────────────────────────────────┐   │
│  │ Gdansk (Factory) ───────────────────────────> Gdansk (Port)         │   │
│  │                                                                      │   │
│  │ PTD: 5 Mar    ETD: 5 Mar    ATD: 5 Mar 08:30                       │   │
│  │ PTA: 5 Mar    ETA: 5 Mar    ATA: 5 Mar 11:15                       │   │
│  │                                                                      │   │
│  │ Carrier: TransLog Sp.z.o.o    Booking: TL-2026-0451                 │   │
│  │                                                                      │   │
│  │ Containers on this leg (32/32):                          [Assign All]│   │
│  │ ┌──────────────┬──────┬────────────┬───────────┬──────────┬────────┐│   │
│  │ │ Container #  │ Type │ Truck Plate│ Trailer   │ Driver   │ Seal # ││   │
│  │ ├──────────────┼──────┼────────────┼───────────┼──────────┼────────┤│   │
│  │ │ MSMU3828891  │ 40HC │ WGD 12345  │ WGD 67890 │ J. Nowak │ SL001  ││   │
│  │ │ MSMU3826055  │ 40HC │ WGD 12345  │ WGD 67891 │ J. Nowak │ SL002  ││   │
│  │ │ ... +30 more │      │            │           │          │        ││   │
│  │ └──────────────┴──────┴────────────┴───────────┴──────────┴────────┘│   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─ Leg 2: SHIP ───────────────────────────────────────────────────────┐   │
│  │ Gdansk (Port) ──────────────────────────────> Rotterdam (Port)      │   │
│  │                                                                      │   │
│  │ PTD: 12 Mar   ETD: 12 Mar   ATD: 12 Mar 18:00                      │   │
│  │ PTA: 8 Apr    ETA: 27 Apr   ATA: --                                 │   │
│  │                             ^^^^^^ (updated 3x, click for history)  │   │
│  │                                                                      │   │
│  │ Carrier: MSC    Booking: 177LFNFND60342    Master B/L: MSCUSHA12345 │   │
│  │ Vessel: MSC POSITANO    IMO: 9930561    Voyage: FE412A              │   │
│  │                                                                      │   │
│  │ Containers on this leg (32/32):                                      │   │
│  │ ┌──────────────┬──────┬────────────┬─────────────────────┬─────────┐│   │
│  │ │ Container #  │ Type │ Seal #     │ B/L                 │ Status  ││   │
│  │ ├──────────────┼──────┼────────────┼─────────────────────┼─────────┤│   │
│  │ │ MSMU3828891  │ 40HC │ MSC-00123  │ MSCUSHA12345-01     │In Trans.││   │
│  │ │ MSMU3826055  │ 40HC │ MSC-00124  │ MSCUSHA12345-02     │In Trans.││   │
│  │ │ ... +30 more │      │            │                     │         ││   │
│  │ └──────────────┴──────┴────────────┴─────────────────────┴─────────┘│   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─ Leg 3a: TRUCK ─── (parallel) ───── Leg 3b: TRUCK ─────────────────┐   │
│  │                        │                                             │   │
│  │ Rotterdam (Port) -->   │ Rotterdam (Port) -->                       │   │
│  │   Rotterdam (Depot A)  │   Rotterdam (Depot B)                      │   │
│  │                        │                                             │   │
│  │ PTD: 28 Apr            │ PTD: 28 Apr                                │   │
│  │ Carrier: EuroTransit   │ Carrier: NL Logistics                      │   │
│  │                        │                                             │   │
│  │ Containers: 20/32      │ Containers: 12/32                          │   │
│  │ ┌─────────────┬──────┐ │ ┌─────────────┬──────┐                    │   │
│  │ │ Container # │ ...  │ │ │ Container # │ ...  │                    │   │
│  │ │ MSMU3828891 │      │ │ │ MSMU3826034 │      │                    │   │
│  │ │ ...+19 more │      │ │ │ ...+11 more │      │                    │   │
│  │ └─────────────┴──────┘ │ └─────────────┴──────┘                    │   │
│  └────────────────────────┴─────────────────────────────────────────────┘   │
```

**Leg card notes:**
- Each leg is a collapsible card showing origin -> destination as a header
- 6 SCD timestamps displayed in two rows (departure / arrival). PTD/ETD/ATD on top, PTA/ETA/ATA below
- Timestamps that have been updated multiple times show a "click for history" hint; clicking opens a popover with the full SCD history (source, value, date per entry)
- SHIP legs show vessel/IMO/voyage; AIR legs show flight number; TRUCK legs show nothing extra at leg level
- The nested container/package table shows columns relevant to the leg type (truck: plates/driver, ship: seal/B/L)
- Parallel legs (same `leg_sequence`) render side-by-side in columns within one visual row
- "Assign All" button bulk-assigns all unassigned containers/packages to the leg

---

### Wire 4: File Detail -- Containers Section (FCL)

```
│                                                                             │
│  === Containers (32) ==========================================     [+ Add] │
│                                                                             │
│  ┌──────────────┬──────┬────────────────┬──────────────────┬──────────────┐│
│  │ Container #  │ Type │ Origin         │ Destination      │ Leg Coverage ││
│  ├──────────────┼──────┼────────────────┼──────────────────┼──────────────┤│
│  │ MSMU3828891  │ 40HC │ Gdansk (Fact.) │ Rotterdam (Dep.A)│ ======== 3/3 ││
│  │ MSMU3826055  │ 40HC │ Gdansk (Fact.) │ Rotterdam (Dep.A)│ ======== 3/3 ││
│  │ MSMU3826034  │ 40HC │ Gdansk (Fact.) │ Rotterdam (Dep.B)│ ======== 3/3 ││
│  │ MSMU3827827  │ 40HC │ Gdansk (Fact.) │ Rotterdam (Dep.A)│ ! ...... 0/3 ││
│  │ ... +28 more │      │                │                  │              ││
│  └──────────────┴──────┴────────────────┴──────────────────┴──────────────┘│
│                                                                             │
│  "Leg Coverage" shows a mini progress bar: how many legs of the             │
│  container's required chain (origin -> destination) are assigned.            │
│  A warning icon appears when coverage is incomplete.                         │
```

**Containers section notes:**
- Shows all containers belonging to the file with their own origin/destination
- "Leg Coverage" column shows a progress indicator: N assigned legs out of M required legs in the chain from the container's origin to its destination
- Containers with 0 coverage show a warning icon (maps to "Unassigned container" computed warning)
- Container number is editable inline (may be unknown at creation)
- Clicking a container row could expand to show its full leg-by-leg journey

---

### Wire 5: File Detail -- LCL Variant (Packages + Legs)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  IMP/LCL/0003/2026/ACME  [LCL] [IMP] [Ready]                  Delete      │
│                                                                             │
│  CLIENT: Acme Corp    ASSIGNEE: A. Nowak    PACKAGES: 5    CREATED: 10 Mar │
│                                                                             │
│  === Packages (5) ==================================================[+ Add]│
│                                                                             │
│  ┌──┬─────────────────┬─────┬────┬─────────┬───────┬──────┬──────────────┐│
│  │# │ Commodity       │ Pkgs│Type│ Gross Wt│ Volume│ Haz? │ Origin->Dest ││
│  ├──┼─────────────────┼─────┼────┼─────────┼───────┼──────┼──────────────┤│
│  │1 │ Electronics     │ 12  │PLT │ 2,400kg │ 14cbm │  No  │ Rott -> Wawa ││
│  │2 │ Auto parts      │ 8   │CTN │ 960kg   │ 6cbm  │  No  │ Rott -> Wawa ││
│  │3 │ Chemicals (CL3) │ 4   │DRM │ 800kg   │ 3cbm  │ !Yes │ Rott -> Lodz ││
│  │4 │ Textiles        │ 20  │BOX │ 1,200kg │ 18cbm │  No  │ Rott -> Wawa ││
│  │5 │ Machine parts   │ 2   │CRT │ 3,000kg │ 8cbm  │  No  │ Rott -> Wawa ││
│  └──┴─────────────────┴─────┴────┴─────────┴───────┴──────┴──────────────┘│
│                                                                             │
│  === Transport Legs =======================================     [+ Add Leg] │
│                                                                             │
│  ┌─ Leg 1: SHIP ───────────────────────────────────────────────────────┐   │
│  │ Rotterdam (Port) ──────────────────────────────> Gdynia (Port)      │   │
│  │                                                                      │   │
│  │ PTD: 15 Mar   ETD: 15 Mar   ATD: 15 Mar 06:00                      │   │
│  │ PTA: 18 Mar   ETA: 18 Mar   ATA: 18 Mar 14:30                      │   │
│  │                                                                      │   │
│  │ Carrier: Unifeeder    Master B/L: UFDR-NL-PL-2026-0088             │   │
│  │ Vessel: RITA          Voyage: 2026-W12                              │   │
│  │                                                                      │   │
│  │ Packages on this leg (5/5):                                          │   │
│  │ ┌───┬──────────────┬──────────────────────┬─────────────────────────┐│   │
│  │ │ # │ Commodity    │ Consol. Container #  │ House B/L              ││   │
│  │ ├───┼──────────────┼──────────────────────┼─────────────────────────┤│   │
│  │ │ 1 │ Electronics  │ TRIU8801234          │ HBL-ACME-001           ││   │
│  │ │ 2 │ Auto parts   │ TRIU8801234          │ HBL-ACME-002           ││   │
│  │ │ 3 │ Chemicals    │ TRIU8805678          │ HBL-ACME-003           ││   │
│  │ │ 4 │ Textiles     │ TRIU8801234          │ HBL-ACME-004           ││   │
│  │ │ 5 │ Machine parts│ TRIU8805678          │ HBL-ACME-005           ││   │
│  │ └───┴──────────────┴──────────────────────┴─────────────────────────┘│   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─ Leg 2a: LCL_TRUCK (parallel) ─── Leg 2b: LCL_TRUCK ──────────────┐   │
│  │                         │                                            │   │
│  │ Gdynia --> Warsaw       │ Gdynia --> Lodz                           │   │
│  │ Carrier: PL Transport   │ Carrier: SpedPol                          │   │
│  │                         │                                            │   │
│  │ Packages: 4/5           │ Packages: 1/5                             │   │
│  │ ┌───┬──────────┬──────┐ │ ┌───┬──────────┬──────┐                  │   │
│  │ │ # │ Commodity│Driver│ │ │ # │ Commodity│Driver│                  │   │
│  │ │ 1 │ Electron.│M.Wis.│ │ │ 3 │ Chemicals│P.Zaj.│                  │   │
│  │ │ 2 │ Auto pts │M.Wis.│ │ └───┴──────────┴──────┘                  │   │
│  │ │ 4 │ Textiles │M.Wis.│ │                                          │   │
│  │ │ 5 │ Mach.pts │M.Wis.│ │                                          │   │
│  │ └───┴──────────┴──────┘ │                                          │   │
│  └─────────────────────────┴────────────────────────────────────────────┘   │
```

**LCL variant notes:**
- Packages section replaces the Containers section
- Package table shows cargo detail summary: commodity, count, type, weight, volume, hazmat flag
- Hazardous packages are highlighted with a warning icon
- Each package has its own origin -> destination (shown as abbreviated location names)
- SHIP leg nested table shows consolidation container number + House B/L per package
- LCL_TRUCK leg nested table shows driver info per package (no container involved)
- Parallel LCL_TRUCK legs handle different packages going to different destinations

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

### UI Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Legs are the centerpiece** | The transport legs section is the main content area; each leg is a collapsible card with nested container/package tables |
| **Parallel = side-by-side** | Legs with the same `leg_sequence` render in columns within one visual row |
| **Derived status = badge** | Status is a non-editable colored badge, computed from data |
| **Warnings at the top** | Warning banner below header, only when warnings exist. Each warning links to affected items |
| **SCD history on click** | Timestamps that changed show update count; clicking opens a popover with full history |
| **Inline editing** | Container numbers, seal numbers, B/L numbers, driver info are editable inline in the nested tables |
| **Context-sensitive columns** | Nested tables inside leg cards show columns relevant to the leg type (TRUCK: plates/driver, SHIP: seal/B/L, LCL_TRUCK: driver only) |
| **Easy creation** | Create dialog asks for minimal info; containers/packages and legs are added after file creation |

---

## Future Considerations (Out of Scope)

- **Offer integration** -- optional `offer_id` FK on FmsFile to pre-populate from accepted offers
- **RAIL leg specifics** -- to be defined when rail transport requirements are clear
- **AIR leg specifics** -- MAWB/HAWB numbers, ULD types, additional per-package fields for LCL air
- **Financial tracking** -- cost/revenue lines per leg or per file (like current FmsProjectLine)
- **Document management** -- linking FmsDocument to files
- **Tracking integration** -- syncing SCD timestamps from shipment_tracking package
- **Transport table view** -- aggregated view of all containers across files with enriched leg data
