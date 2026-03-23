# FMS Files — Entity Diagram

```mermaid
erDiagram

  FmsFile {
    uuid id PK
    uuid organization_id
    uuid tenant_id
    text reference_number "UNIQUE per org. Format: TYPE/CARGO/NNNN/YEAR/CONTRACTOR_SHORT. e.g. EXP/FCL/0001/2026/MAERSK"
    text shipment_type "EXP | IMP | LOC"
    text cargo_type "FCL | LCL — never mixed within a file"
    uuid contractor_id "BCO client (Contractor)"
    uuid assignee_id "nullable — user handling the file"
    text notes "nullable"
    timestamptz created_at
    uuid created_by "nullable"
    timestamptz updated_at
    uuid updated_by "nullable"
    timestamptz deleted_at "nullable — soft delete"
  }

  FmsFileUnit {
    uuid id PK
    uuid organization_id
    uuid tenant_id
    uuid file_id FK
    text cargo_type "FCL | LCL — denormalized from FmsFile for query convenience"
    uuid origin_location_id "first origin (FmsLocation)"
    uuid destination_location_id "final destination (FmsLocation)"
    text commodity_description "nullable — FCL: optional; LCL: summary of all packages"
    numeric gross_weight "nullable (12,3) — FCL: container cargo; LCL: total weight"
    text weight_unit "nullable — kg / lb / ton / mt"
    numeric volume "nullable (12,3) — FCL: optional; LCL: total volume"
    text volume_unit "nullable — cbm / cft / liter"
    boolean is_hazardous "default false — FCL: hazmat flag; LCL: true if ANY package is hazardous"
    text container_number "nullable — FCL ONLY: physical container id (may be unknown at creation)"
    text container_type "nullable — FCL ONLY: 20GP / 40GP / 40HC / 45HC / 20RF / 40RF / etc."
    int package_count "nullable — LCL ONLY: total number of packages"
    jsonb packages_detail "nullable — LCL ONLY: PackageDetail[] per-package breakdown"
    int sort_order "default 0 — display ordering"
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at "nullable — soft delete"
  }

  FmsFileLeg {
    uuid id PK
    uuid organization_id
    uuid tenant_id
    uuid file_id FK
    int leg_sequence "SAME number = legs run in PARALLEL (e.g. some containers by truck, others by rail)"
    text type "TRUCK | SHIP | RAIL | AIR"
    uuid origin_location_id "FmsLocation"
    uuid destination_location_id "FmsLocation"
    jsonb ptd_timestamps "nullable — SCD: Planned Departure history [ {value, offset, source, updatedAt} ]"
    jsonb etd_timestamps "nullable — SCD: Estimated Departure history"
    jsonb atd_timestamps "nullable — SCD: Actual Departure history"
    jsonb pta_timestamps "nullable — SCD: Planned Arrival history"
    jsonb eta_timestamps "nullable — SCD: Estimated Arrival history"
    jsonb ata_timestamps "nullable — SCD: Actual Arrival history"
    text booking_number "nullable"
    uuid carrier_id "nullable — FK Contractor"
    text bl_number "nullable — SHIP ONLY: MASTER B/L (shared across all units on this leg)"
    text vessel_name "nullable — SHIP ONLY"
    text vessel_imo "nullable — SHIP ONLY"
    text voyage_number "nullable — SHIP ONLY"
    text flight_number "nullable — AIR ONLY"
    text aircraft_type "nullable — AIR ONLY"
    text notes "nullable"
    timestamptz created_at
    uuid created_by "nullable"
    timestamptz updated_at
    uuid updated_by "nullable"
    timestamptz deleted_at "nullable — soft delete"
  }

  FmsFileUnitLeg {
    uuid id PK
    uuid organization_id
    uuid tenant_id
    uuid unit_id FK
    uuid leg_id FK
    text truck_plate "nullable — TRUCK ONLY"
    text trailer_plate "nullable — TRUCK ONLY"
    text driver_full_name "nullable — TRUCK ONLY"
    text driver_id_number "nullable — TRUCK ONLY"
    text driver_phone "nullable — TRUCK ONLY"
    text seal_number "nullable — SHIP: FCL=seal on container; LCL=null"
    text bl_number "nullable — SHIP: FCL=per-container B/L; LCL=House B/L"
    text consolidation_container_number "nullable — LCL ONLY: shared container number for SHIP/RAIL legs"
    text notes "nullable"
    text ptd "nullable — TRUCK ONLY: plain text timestamp, per-unit (not SCD)"
    text etd "nullable — TRUCK ONLY: plain text timestamp, per-unit"
    text atd "nullable — TRUCK ONLY: plain text timestamp, per-unit"
    text pta "nullable — TRUCK ONLY: plain text timestamp, per-unit"
    text eta "nullable — TRUCK ONLY: plain text timestamp, per-unit"
    text ata "nullable — TRUCK ONLY: plain text timestamp, per-unit"
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at "nullable — soft delete"
  }

  FmsFileNote {
    uuid id PK
    uuid organization_id
    uuid tenant_id
    uuid file_id FK
    text body
    uuid author_user_id "nullable"
    text author_name "nullable"
    uuid attachment_id "nullable"
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at "nullable — soft delete"
  }

  FmsFile ||--o{ FmsFileUnit : "units (OneToMany)"
  FmsFile ||--o{ FmsFileLeg : "legs (OneToMany)"
  FmsFile ||--o{ FmsFileNote : "notes (OneToMany)"
  FmsFileUnit ||--o{ FmsFileUnitLeg : "unitLegs (OneToMany)"
  FmsFileLeg ||--o{ FmsFileUnitLeg : "unitLegs (OneToMany)"
```

---

## SCD Timestamp Pattern (on `FmsFileLeg`)

Each of the 6 JSONB columns is an **append-only array** of `LegTimestampEntry`:

```ts
type LegTimestampEntry = {
  value: string           // ISO 8601 datetime
  offset: string | null   // e.g. "+08:00" or "Z"
  source: 'carrier_api' | 'manual' | 'ais' | 'port' | 'edi'
  updatedAt: string       // when this entry was recorded
  sourceEventId?: string | null
}
```

- **No "current" column** — resolved at read time: entry with latest `updatedAt` wins.
- **PTD/PTA** are new concepts; legacy `FmsSeaContainer` only had ETD/ETA/ATD/ATA.
- Deduplication: appending the same `value+source` pair is a no-op.

## Timestamp Routing by Leg Type

| Leg type | Where timestamps live | Semantics |
|---|---|---|
| **TRUCK** | `FmsFileUnitLeg.ptd/etd/atd/pta/eta/ata` (plain text) | Per-unit — each truck dispatches independently |
| **SHIP / RAIL / AIR** | `FmsFileLeg.*Timestamps` (SCD JSONB) | Shared — all units on the leg depart/arrive together |

## `cargo_type` Split Logic

| Field | FCL | LCL |
|---|---|---|
| Units per file | One per container | One for the whole file |
| `container_number` / `container_type` | Populated | `null` |
| `package_count` / `packages_detail` | `null` | Populated |
| `consolidation_container_number` (UnitLeg) | `null` | Shared container for SHIP/RAIL |
| `bl_number` (UnitLeg) | Per-container B/L | House B/L |

## B/L Number Placement

| Level | Field | Scope |
|---|---|---|
| `FmsFileLeg.bl_number` | Master B/L | Shared across all units on the SHIP leg |
| `FmsFileUnitLeg.bl_number` | Per-unit B/L | FCL: container B/L · LCL: House B/L |
| `FmsFileUnitLeg.consolidation_container_number` | Shared container | LCL only, for SHIP/RAIL |

## Derived File Status (no `status` column)

| Status | Condition |
|---|---|
| **Empty** | No units or no legs |
| **Planning** | Has units but leg chain is incomplete |
| **Ready** | All units have a complete origin→destination leg chain |
| **In Transit** | At least one leg has ATD but no ATA |
| **Delivered** | All final legs have ATA |
| **Partially Delivered** | Some final legs have ATA, others don't |
