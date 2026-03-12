# Truck Loading Module - Agent Guidelines

This document describes the truck loading module, a 3D bin-packing visualization tool for freight management.

## Overview

| Property | Value |
|----------|-------|
| Module ID | `truck_loading` |
| Location | `packages/fms/src/modules/truck_loading/` |
| Feature | `truck_loading.view` |
| Nav Group | FMS |
| Backend Path | `/backend/truck-loading` |

**Purpose:** Interactive 3D truck load planning tool that allows users to:
- Select truck/container types from industry presets
- Add cargo items with dimensions, weight, and stackability
- Automatically calculate optimal placement using a bin-packing algorithm
- Visualize results in an interactive 3D scene
- View real-time utilization metrics (floor area, LDM, weight, volume)

## Module Architecture

### File Structure

```
packages/fms/src/modules/truck_loading/
├── acl.ts                          # Feature definitions (truck_loading.view)
├── index.ts                        # Module metadata
├── backend/truck-loading/
│   ├── page.meta.ts                # Page metadata (nav, ACL, breadcrumb)
│   └── page.tsx                    # Page component wrapper
├── components/
│   ├── TruckLoadingPage.tsx        # Main orchestration, state management
│   ├── TruckScene.tsx              # Three.js Canvas, camera, lighting
│   ├── TruckContainer.tsx          # 3D wireframe truck outline
│   ├── CargoBox.tsx                # 3D cargo item with tooltip
│   ├── CargoTable.tsx              # DynamicTable for cargo input
│   ├── TruckSelector.tsx           # Dropdown for truck presets
│   └── LoadingMetricsPanel.tsx     # Utilization bar charts
├── lib/
│   ├── types.ts                    # TypeScript interfaces
│   ├── packing-algorithm.ts        # Core bin-packing logic (593 lines)
│   ├── metrics.ts                  # Utilization calculations
│   ├── truck-presets.ts            # Truck/container dimensions
│   ├── cargo-presets.ts            # Common cargo types (Euro Pallet)
│   ├── colors.ts                   # Color assignment for cargo items
│   └── three-jsx.d.ts              # Three.js JSX type declarations
└── i18n/
    ├── en.json, de.json, es.json, pl.json
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TruckLoadingPage                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ TruckSelector│    │ CargoTable  │    │ Settings    │    │   Reset     │  │
│  │  (presets)  │    │ (add/edit)  │    │ (autoStack) │    │  (clear)    │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └─────────────┘  │
│         │                  │                  │                             │
│         ▼                  ▼                  ▼                             │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │            React State (truck, cargoItems, settings)  │                  │
│  └──────────────────────────┬───────────────────────────┘                  │
│                             │                                               │
│                             ▼                                               │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │              packCargo(truck, cargoItems, settings)   │                  │
│  │                   lib/packing-algorithm.ts            │                  │
│  └──────────────────────────┬───────────────────────────┘                  │
│                             │                                               │
│                             ▼                                               │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │         PackingResult { placed[], unplaced[] }        │                  │
│  └────────────┬─────────────────────────┬───────────────┘                  │
│               │                         │                                   │
│               ▼                         ▼                                   │
│  ┌────────────────────┐    ┌────────────────────────────┐                  │
│  │   calculateMetrics │    │        TruckScene          │                  │
│  │   lib/metrics.ts   │    │   (3D visualization)       │                  │
│  └─────────┬──────────┘    └────────────────────────────┘                  │
│            │                                                                │
│            ▼                                                                │
│  ┌────────────────────┐                                                    │
│  │ LoadingMetricsPanel│                                                    │
│  │  (utilization %)   │                                                    │
│  └────────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Algorithm: BFD-V with Enhanced Stacking

The packing algorithm (`lib/packing-algorithm.ts`) uses a **3D Shelf-Based Best Fit Decreasing Volume (BFD-V) heuristic** with enhanced stacking support.

### Approach

1. **Decreasing Volume** - Cargo items are sorted by volume (largest first) before placement
2. **Best Fit Selection** - For each item, the algorithm scans ALL available spaces and selects the one that minimizes wasted space (not just the first space that fits)
3. **Shelf-Based Space Management** - Maintains a list of available 3D rectangular spaces; starts with entire truck interior as one space
4. **Rotation Support** - Items can be rotated 90 degrees on the floor plane (swap width/length) to find better fits

### Algorithm Steps

```
1. EXPAND cargo items by quantity (e.g., 3x Euro Pallets → 3 separate candidates)
2. SORT candidates by volume descending (largest first)
3. INITIALIZE spaces = [entire truck interior]

4. FOR EACH candidate item:
   a. CHECK weight constraint (skip if would exceed maxWeight)
   b. FIND best fit across all spaces (try both orientations)
   c. IF autoStack enabled, also CHECK stacking positions on placed items
   d. IF placement found:
      - ADD to placed[] array
      - SPLIT the used space into up to 3 new spaces (right, front, top)
   e. ELSE:
      - ADD to unplaced[] array with reason

5. RETURN { placed, unplaced }
```

### Space Splitting

When an item is placed in a space, the remaining space is split into up to 3 new candidate spaces:

```
Before placement:           After placing item A:
┌─────────────────┐         ┌───────┬─────────┐
│                 │         │   A   │  RIGHT  │
│     SPACE       │   →     ├───────┤         │
│                 │         │ FRONT │         │
└─────────────────┘         └───────┴─────────┘
                            (+ TOP space above A if stackable)
```

### Enhanced Stacking Logic

When `autoStack` is enabled, the algorithm also considers stacking positions:

1. **Group by Level** - Finds all stackable items at the same top Y coordinate
2. **Merged Regions** - Detects when adjacent items form a continuous surface (allows larger items to span multiple base items)
3. **Support Validation** - Requires 70% footprint coverage for stability (allows slight overhang)
4. **Priority** - Prefers lower levels and positions closer to origin

```
Merged region example:
┌───────┬───────┐     Item C can be placed spanning both A and B
│   A   │   B   │     if A and B are at the same level and adjacent
├───────┴───────┤
│       C       │
└───────────────┘
```

### Constraints

| Constraint | Implementation |
|------------|----------------|
| Weight limit | Checked before placement; items exceeding remaining capacity go to `unplaced` with `reason: 'weight_exceeded'` |
| Height limit | Item must fit within available vertical space |
| Stackability | Only items marked `stackable: true` can have items placed on top |
| Support | Stacked items require 70% footprint coverage from items below |

## UI Components

| Component | File | Purpose |
|-----------|------|---------|
| **TruckLoadingPage** | `components/TruckLoadingPage.tsx` | Main orchestration; manages state for truck, cargo items, settings; triggers packing on changes |
| **TruckScene** | `components/TruckScene.tsx` | Three.js Canvas wrapper; sets up camera, lighting, orbit controls; renders container and cargo |
| **TruckContainer** | `components/TruckContainer.tsx` | 3D wireframe box showing truck boundaries; floor grid for scale reference |
| **CargoBox** | `components/CargoBox.tsx` | 3D box for each placed cargo item; supports hover/select states; shows tooltip with dimensions |
| **CargoTable** | `components/CargoTable.tsx` | DynamicTable for adding/editing cargo; supports inline editing of all properties |
| **TruckSelector** | `components/TruckSelector.tsx` | Dropdown to select truck type from presets |
| **LoadingMetricsPanel** | `components/LoadingMetricsPanel.tsx` | Horizontal bar charts showing utilization percentages |

## Data Types

### TruckPreset
```typescript
interface TruckPreset {
  id: string           // e.g., 'standard', 'container_40hc'
  label: string        // Display name
  width: number        // Internal width in cm
  length: number       // Internal length in cm
  height: number       // Internal height in cm
  maxWeight: number    // Maximum payload in kg
}
```

### CargoItem (user input)
```typescript
interface CargoItem {
  id: string           // UUID
  name: string         // Display name
  width: number        // Width in cm
  length: number       // Length/depth in cm
  height: number       // Height in cm
  weight: number       // Weight in kg
  quantity: number     // Number of items
  stackable: boolean   // Can items stack on top?
  color: string        // Assigned color for visualization
}
```

### PlacedCargo (algorithm output)
```typescript
interface PlacedCargo {
  cargoItemId: string     // Reference to source CargoItem
  instanceIndex: number   // Which instance (0-based)
  width: number           // Placed width (may differ if rotated)
  length: number          // Placed length
  height: number          // Placed height
  weight: number          // Weight in kg
  posX: number            // X position (left edge)
  posY: number            // Y position (bottom edge)
  posZ: number            // Z position (front edge)
  name: string            // Display name
  color: string           // Display color
  stackable: boolean      // Whether this item is stackable
}
```

### LoadingMetrics
```typescript
interface LoadingMetrics {
  floorAreaPercent: number    // Floor utilization %
  floorAreaUsed: number       // Used floor area (m2)
  floorAreaTotal: number      // Total floor area (m2)
  ldmUsed: number             // Loading meters used
  ldmTotal: number            // Total loading meters
  ldmRemaining: number        // Remaining LDM
  ldmPercent: number          // LDM utilization %
  weightLoaded: number        // Total weight placed (kg)
  weightCapacity: number      // Max weight capacity (kg)
  weightPercent: number       // Weight utilization %
  volumeUsed: number          // Volume used (m3)
  volumeTotal: number         // Total volume (m3)
  volumePercent: number       // Volume utilization %
  itemsPlaced: number         // Number of items placed
  itemsTotal: number          // Total items requested
}
```

## Presets

### Truck Presets (`lib/truck-presets.ts`)

| ID | Label | W x L x H (cm) | Max Weight (kg) |
|----|-------|----------------|-----------------|
| `standard` | Standard Semi-Trailer | 245 x 1360 x 280 | 24,000 |
| `mega` | Mega Trailer | 245 x 1360 x 300 | 24,000 |
| `tandem` | Tandem (2x 770cm) | 245 x 770 x 300 | 24,000 |
| `container_20ft` | 20ft Container | 235 x 590 x 239 | 21,770 |
| `container_40ft` | 40ft Container | 235 x 1203 x 239 | 26,680 |
| `container_40hc` | 40ft HC Container | 235 x 1203 x 269 | 26,460 |

### Cargo Presets (`lib/cargo-presets.ts`)

| ID | Label | W x L x H (cm) | Weight (kg) | Stackable |
|----|-------|----------------|-------------|-----------|
| `euro_pallet` | Euro Pallet (EPAL) | 120 x 80 x 144 | 800 | Yes |
| `custom` | Custom | 100 x 100 x 100 | 100 | No |

## Metrics Calculation

Metrics are calculated in `lib/metrics.ts`:

| Metric | Formula |
|--------|---------|
| **Floor Area** | Sum of floor-level footprints (posY=0) / (truck width x length) |
| **LDM** | Maximum Z position reached (posZ + length) / truck length |
| **Weight** | Sum of placed item weights / truck maxWeight |
| **Volume** | Sum of (width x length x height) for placed items / truck volume |
| **Items** | Count of placed items / total requested items |

Color coding for utilization bars:
- Green: 0-70%
- Amber: 70-90%
- Red: 90-100%

## Advantages

| Advantage | Description |
|-----------|-------------|
| **Real-time feedback** | Packing recalculates immediately on any input change |
| **Visual clarity** | Interactive 3D scene with orbit controls helps users understand placement |
| **No backend required** | Purely client-side computation; no API calls, no latency |
| **Industry presets** | Pre-configured truck types match real-world equipment |
| **Intelligent stacking** | Handles complex multi-item stacking with merged region detection |
| **Comprehensive metrics** | Shows all key logistics KPIs in one view |
| **Theme support** | Adapts to light/dark mode automatically |

## Limitations

| Limitation | Description |
|------------|-------------|
| **Heuristic-based** | BFD-V is not guaranteed to find the globally optimal solution; may underutilize space in edge cases |
| **No persistence** | Data exists only in React state; lost on page refresh; no database storage |
| **Single truck** | Cannot plan for multiple trucks or automatically split shipments |
| **No loading order** | Doesn't consider unloading sequence (LIFO/FIFO constraints for delivery routes) |
| **Simplified physics** | No load distribution, center of gravity, or axle weight calculations |
| **Fixed rotations** | Only 2 orientations (0 and 90 degrees on floor plane); no vertical rotation |
| **No fragile/hazmat** | No special handling rules for fragile items or hazardous materials |

## Alternative Algorithms

| Algorithm | Description | Trade-off |
|-----------|-------------|-----------|
| **Extreme Point (EP)** | Places items at "extreme points" created by previous placements | Better space utilization; more complex implementation |
| **Layer Building** | Fills one horizontal layer completely before starting next | Simpler logic; may leave vertical gaps between layers |
| **Genetic Algorithm** | Evolutionary optimization over many generations | Better solutions possible; significantly slower; non-deterministic |
| **Branch & Bound** | Exact algorithm with tree search and pruning | Guaranteed optimal; exponential time for large instances |
| **Simulated Annealing** | Probabilistic search accepting worse solutions to escape local minima | Good balance of quality and speed; non-deterministic |
| **GRASP** | Greedy Randomized Adaptive Search Procedure | Combines greedy construction with local search; good for large instances |

**When to consider alternatives:**
- If utilization consistently below 80% with the current algorithm, EP or Genetic approaches may help
- For guaranteed optimal solutions (small instances only), Branch & Bound
- For production systems with strict loading order requirements, custom constraint-based approaches

## Dependencies

| Package | Purpose |
|---------|---------|
| `@react-three/fiber` | React renderer for Three.js |
| `@react-three/drei` | Helper components (OrbitControls, PerspectiveCamera, Edges, Grid, Html) |
| `three` | 3D graphics library (peer dependency) |
| `@open-mercato/ui` | DynamicTable, Button, Switch, Card, Tooltip primitives |
| `@open-mercato/shared` | i18n (useT), theming |

## Integration Points

### ACL
```typescript
// acl.ts
export const features = [
  { id: 'truck_loading.view', title: 'Use truck loading planner', module: 'truck_loading' },
]
```

### Navigation
The module appears in the FMS navigation group at order 115:
```typescript
// page.meta.ts
export const metadata = {
  requireAuth: true,
  requireFeatures: ['truck_loading.view'],
  pageTitle: 'Truck Loading',
  pageGroup: 'FMS',
  pageOrder: 115,
}
```

### i18n Keys
```json
{
  "truck_loading": {
    "nav": { "title": "Truck Loading", "group": "FMS" },
    "autoStack": {
      "label": "Auto-stack",
      "tooltip": "Stack cargo vertically on stackable items. Disable to place all items on floor only."
    }
  }
}
```
