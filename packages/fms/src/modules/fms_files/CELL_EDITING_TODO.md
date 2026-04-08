# FMS Files — Cell Editing TODO

Columns that are **currently read-only** in the transport page Units view but should be editable in the future.
The legs view (ALL/TRUCK/SEA/RAIL/AIR tabs) columns that are read-only in the Units tab but editable in the legs tab:

## Units View (Transport Page) — Read-only in Units tab

| Column | Data Key | Current State | Notes |
|--------|----------|--------------|-------|
| Leg Mode | `legType_N` | readOnly: true | Set at leg creation, not editable inline |
| Leg Origin | `legOrigin_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Leg Destination | `legDestination_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Carrier | `carrierName_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Booking # | `bookingNumber_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Master B/L | `masterBl_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Vessel | `vesselName_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Voyage | `voyageNumber_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Flight # | `flightNumber_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Gate-in C/O | `gateInCutoff_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Docs C/O | `documentationCutoff_N` | readOnly: true | Editable on legs view but read-only on units tab |
| VGM C/O | `vgmCutoff_N` | readOnly: true | Editable on legs view but read-only on units tab |
| DG C/O | `dangerousGoodsCutoff_N` | readOnly: true | Editable on legs view but read-only on units tab |
| DEM (days) | `demFreeTime_N` | readOnly: true | Editable on legs view but read-only on units tab |
| DET (days) | `detFreeTime_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Truck Plate | `truckPlate_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Trailer | `trailerPlate_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Driver | `driverFullName_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Seal # | `sealNumber_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Unit B/L | `unitBl_N` | readOnly: true | Editable on legs view but read-only on units tab |
| Notes | `notes_N` | readOnly: true | Editable on legs view but read-only on units tab |

## File Detail Page (TransportView) — Cell Editing Gaps

| Area | Column | Notes |
|------|--------|-------|
| Entity search editors | Origin, Destination, Carrier, Drop-off Location | Need dedicated tests for entity search popup interaction |
| DateTime editors | PTD, ETD, ATD, PTA, ETA, ATA, Cutoffs, Drop-off Time | Need calendar/picker interaction tests |
| Boolean editors | isHazardous | Need checkbox toggle test |

## Both Pages — Read-only columns (by design, no TODO)

These columns are intentionally read-only and should NOT be editable:

- `referenceNumber` — auto-generated, immutable
- `derivedStatus` — computed at query time
- `legSequence` — set at creation
- `legType` / `type` — set at creation
- `cargoType` — set at file creation
- `shipmentType` — set at file creation
- `contractorName` — set at file creation
- `assigneeName` — set via file update, not cell edit
