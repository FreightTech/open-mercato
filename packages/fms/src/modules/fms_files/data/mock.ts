/**
 * Mock data for FMS Files UI prototype.
 * This file provides static data for all wireframe screens so the team can review
 * the UI without any backend/API integration.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShipmentType = 'EXP' | 'IMP' | 'LOC'
export type CargoType = 'FCL' | 'LCL'
export type LegType = 'TRUCK' | 'SHIP' | 'RAIL' | 'AIR'
export type DerivedStatus = 'Empty' | 'Planning' | 'Ready' | 'In Transit' | 'Delivered' | 'Partially Delivered'

export type TimestampEntry = {
  value: string
  offset: string | null
  source: 'carrier_api' | 'manual' | 'ais' | 'port' | 'edi'
  updatedAt: string
}

export type MockWarning = {
  type: 'schedule_conflict' | 'uncovered' | 'route_gap' | 'unassigned'
  message: string
  affectedItems: string[]
}

export type MockContainer = {
  id: string
  containerNumber: string | null
  containerType: string
  originName: string
  destinationName: string
  sortOrder: number
}

export type MockPackage = {
  id: string
  commodityDescription: string
  packageType: string
  packageCount: number
  grossWeight: number
  weightUnit: string
  volume: number
  volumeUnit: string
  isHazardous: boolean
  hazmatClass: string | null
  originName: string
  destinationName: string
  sortOrder: number
}

export type MockLegContainer = {
  containerId: string
  containerNumber: string | null
  containerType: string
  truckPlate?: string
  trailerPlate?: string
  driverFullName?: string
  sealNumber?: string
  blNumber?: string
}

export type MockLegPackage = {
  packageId: string
  commodityDescription: string
  consolidationContainerNumber?: string
  hblNumber?: string
  truckPlate?: string
  driverFullName?: string
  driverPhone?: string
}

export type MockLeg = {
  id: string
  legSequence: number
  type: LegType
  originName: string
  destinationName: string
  ptdTimestamps: TimestampEntry[] | null
  etdTimestamps: TimestampEntry[] | null
  atdTimestamps: TimestampEntry[] | null
  ptaTimestamps: TimestampEntry[] | null
  etaTimestamps: TimestampEntry[] | null
  ataTimestamps: TimestampEntry[] | null
  bookingNumber: string | null
  carrierName: string | null
  blNumber: string | null
  vesselName: string | null
  vesselImo: string | null
  voyageNumber: string | null
  flightNumber: string | null
  notes: string | null
  legContainers: MockLegContainer[]
  legPackages: MockLegPackage[]
}

export type MockFile = {
  id: string
  referenceNumber: string
  shipmentType: ShipmentType
  cargoType: CargoType
  contractorName: string
  assigneeName: string | null
  notes: string | null
  derivedStatus: DerivedStatus
  createdAt: string
  containers: MockContainer[]
  packages: MockPackage[]
  legs: MockLeg[]
  warnings: MockWarning[]
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function ts(value: string, source: TimestampEntry['source'] = 'manual', updatedAt?: string): TimestampEntry {
  return {
    value,
    offset: null,
    source,
    updatedAt: updatedAt ?? new Date().toISOString(),
  }
}

// ─── FCL File (32 containers, 3 legs with parallel last leg) ──────────────────

const fclContainers: MockContainer[] = Array.from({ length: 32 }, (_, i) => ({
  id: `cnt-${i + 1}`,
  containerNumber: i === 3 ? null : `MSMU38${String(28000 + i).padStart(5, '0')}`,
  containerType: '40HC',
  originName: 'Gdansk (Factory)',
  destinationName: i < 20 ? 'Rotterdam (Depot A)' : 'Rotterdam (Depot B)',
  sortOrder: i,
}))

const fclLegs: MockLeg[] = [
  {
    id: 'leg-1',
    legSequence: 1,
    type: 'TRUCK',
    originName: 'Gdansk (Factory)',
    destinationName: 'Gdansk (Port)',
    ptdTimestamps: [ts('2026-03-05T00:00:00Z')],
    etdTimestamps: [ts('2026-03-05T00:00:00Z')],
    atdTimestamps: [ts('2026-03-05T08:30:00Z', 'manual')],
    ptaTimestamps: [ts('2026-03-05T00:00:00Z')],
    etaTimestamps: [ts('2026-03-05T00:00:00Z')],
    ataTimestamps: [ts('2026-03-05T11:15:00Z', 'manual')],
    bookingNumber: 'TL-2026-0451',
    carrierName: 'TransLog Sp.z.o.o',
    blNumber: null,
    vesselName: null,
    vesselImo: null,
    voyageNumber: null,
    flightNumber: null,
    notes: null,
    legContainers: fclContainers.map((c) => ({
      containerId: c.id,
      containerNumber: c.containerNumber,
      containerType: c.containerType,
      truckPlate: 'WGD 12345',
      trailerPlate: 'WGD 67890',
      driverFullName: 'Jan Nowak',
      sealNumber: `SL${String(c.sortOrder + 1).padStart(3, '0')}`,
    })),
    legPackages: [],
  },
  {
    id: 'leg-2',
    legSequence: 2,
    type: 'SHIP',
    originName: 'Gdansk (Port)',
    destinationName: 'Rotterdam (Port)',
    ptdTimestamps: [ts('2026-03-12T00:00:00Z')],
    etdTimestamps: [ts('2026-03-12T00:00:00Z')],
    atdTimestamps: [ts('2026-03-12T18:00:00Z', 'carrier_api')],
    ptaTimestamps: [ts('2026-04-08T00:00:00Z')],
    etaTimestamps: [
      ts('2026-04-08T00:00:00Z', 'carrier_api', '2026-03-12T18:00:00Z'),
      ts('2026-04-20T00:00:00Z', 'carrier_api', '2026-03-20T12:00:00Z'),
      ts('2026-04-27T00:00:00Z', 'carrier_api', '2026-03-28T08:00:00Z'),
    ],
    ataTimestamps: null,
    bookingNumber: '177LFNFND60342',
    carrierName: 'MSC',
    blNumber: 'MSCUSHA12345',
    vesselName: 'MSC POSITANO',
    vesselImo: '9930561',
    voyageNumber: 'FE412A',
    flightNumber: null,
    notes: null,
    legContainers: fclContainers.map((c) => ({
      containerId: c.id,
      containerNumber: c.containerNumber,
      containerType: c.containerType,
      sealNumber: `MSC-${String(c.sortOrder + 123).padStart(5, '0')}`,
      blNumber: `MSCUSHA12345-${String(c.sortOrder + 1).padStart(2, '0')}`,
    })),
    legPackages: [],
  },
  {
    id: 'leg-3a',
    legSequence: 3,
    type: 'TRUCK',
    originName: 'Rotterdam (Port)',
    destinationName: 'Rotterdam (Depot A)',
    ptdTimestamps: [ts('2026-04-28T00:00:00Z')],
    etdTimestamps: null,
    atdTimestamps: null,
    ptaTimestamps: [ts('2026-04-28T00:00:00Z')],
    etaTimestamps: null,
    ataTimestamps: null,
    bookingNumber: null,
    carrierName: 'EuroTransit BV',
    blNumber: null,
    vesselName: null,
    vesselImo: null,
    voyageNumber: null,
    flightNumber: null,
    notes: null,
    legContainers: fclContainers.slice(0, 20).map((c) => ({
      containerId: c.id,
      containerNumber: c.containerNumber,
      containerType: c.containerType,
      truckPlate: 'NL-AB-123',
      driverFullName: 'Peter van Dijk',
    })),
    legPackages: [],
  },
  {
    id: 'leg-3b',
    legSequence: 3,
    type: 'TRUCK',
    originName: 'Rotterdam (Port)',
    destinationName: 'Rotterdam (Depot B)',
    ptdTimestamps: [ts('2026-04-28T00:00:00Z')],
    etdTimestamps: null,
    atdTimestamps: null,
    ptaTimestamps: [ts('2026-04-28T00:00:00Z')],
    etaTimestamps: null,
    ataTimestamps: null,
    bookingNumber: null,
    carrierName: 'NL Logistics',
    blNumber: null,
    vesselName: null,
    vesselImo: null,
    voyageNumber: null,
    flightNumber: null,
    notes: null,
    legContainers: fclContainers.slice(20).map((c) => ({
      containerId: c.id,
      containerNumber: c.containerNumber,
      containerType: c.containerType,
      truckPlate: 'NL-CD-456',
      driverFullName: 'Hans de Vries',
    })),
    legPackages: [],
  },
]

export const MOCK_FCL_FILE: MockFile = {
  id: 'file-fcl-1',
  referenceNumber: 'EXP/FCL/0012/2026/MAERSK',
  shipmentType: 'EXP',
  cargoType: 'FCL',
  contractorName: 'Maersk Ltd',
  assigneeName: 'J. Kowalski',
  notes: 'Fibre optic cables shipment, handle with care. Booking confirmed.',
  derivedStatus: 'In Transit',
  createdAt: '2026-03-12',
  containers: fclContainers,
  packages: [],
  legs: fclLegs,
  warnings: [
    {
      type: 'schedule_conflict',
      message: 'Leg 2 (SHIP) ETA Apr 27 is after Leg 3 (TRUCK) PTD Apr 25',
      affectedItems: ['MSMU3828000', 'MSMU3828001'],
    },
    {
      type: 'unassigned',
      message: 'Container not assigned to any leg',
      affectedItems: ['(no number)'],
    },
  ],
}

// ─── LCL File (5 packages, 2 legs with parallel last leg) ─────────────────────

const lclPackages: MockPackage[] = [
  {
    id: 'pkg-1', commodityDescription: 'Electronics', packageType: 'PLT', packageCount: 12,
    grossWeight: 2400, weightUnit: 'kg', volume: 14, volumeUnit: 'cbm',
    isHazardous: false, hazmatClass: null, originName: 'Rotterdam (Port)', destinationName: 'Warsaw', sortOrder: 0,
  },
  {
    id: 'pkg-2', commodityDescription: 'Auto parts', packageType: 'CTN', packageCount: 8,
    grossWeight: 960, weightUnit: 'kg', volume: 6, volumeUnit: 'cbm',
    isHazardous: false, hazmatClass: null, originName: 'Rotterdam (Port)', destinationName: 'Warsaw', sortOrder: 1,
  },
  {
    id: 'pkg-3', commodityDescription: 'Chemicals (CL3)', packageType: 'DRM', packageCount: 4,
    grossWeight: 800, weightUnit: 'kg', volume: 3, volumeUnit: 'cbm',
    isHazardous: true, hazmatClass: '3', originName: 'Rotterdam (Port)', destinationName: 'Lodz', sortOrder: 2,
  },
  {
    id: 'pkg-4', commodityDescription: 'Textiles', packageType: 'BOX', packageCount: 20,
    grossWeight: 1200, weightUnit: 'kg', volume: 18, volumeUnit: 'cbm',
    isHazardous: false, hazmatClass: null, originName: 'Rotterdam (Port)', destinationName: 'Warsaw', sortOrder: 3,
  },
  {
    id: 'pkg-5', commodityDescription: 'Machine parts', packageType: 'CRT', packageCount: 2,
    grossWeight: 3000, weightUnit: 'kg', volume: 8, volumeUnit: 'cbm',
    isHazardous: false, hazmatClass: null, originName: 'Rotterdam (Port)', destinationName: 'Warsaw', sortOrder: 4,
  },
]

const lclLegs: MockLeg[] = [
  {
    id: 'lcl-leg-1',
    legSequence: 1,
    type: 'SHIP',
    originName: 'Rotterdam (Port)',
    destinationName: 'Gdynia (Port)',
    ptdTimestamps: [ts('2026-03-15T00:00:00Z')],
    etdTimestamps: [ts('2026-03-15T00:00:00Z')],
    atdTimestamps: [ts('2026-03-15T06:00:00Z', 'carrier_api')],
    ptaTimestamps: [ts('2026-03-18T00:00:00Z')],
    etaTimestamps: [ts('2026-03-18T00:00:00Z')],
    ataTimestamps: [ts('2026-03-18T14:30:00Z', 'carrier_api')],
    bookingNumber: 'UF-NL-PL-0088',
    carrierName: 'Unifeeder',
    blNumber: 'UFDR-NL-PL-2026-0088',
    vesselName: 'RITA',
    vesselImo: '9812345',
    voyageNumber: '2026-W12',
    flightNumber: null,
    notes: null,
    legContainers: [],
    legPackages: lclPackages.map((p) => ({
      packageId: p.id,
      commodityDescription: p.commodityDescription,
      consolidationContainerNumber: p.id === 'pkg-3' || p.id === 'pkg-5' ? 'TRIU8805678' : 'TRIU8801234',
      hblNumber: `HBL-ACME-${String(p.sortOrder + 1).padStart(3, '0')}`,
    })),
  },
  {
    id: 'lcl-leg-2a',
    legSequence: 2,
    type: 'TRUCK',
    originName: 'Gdynia (Port)',
    destinationName: 'Warsaw',
    ptdTimestamps: [ts('2026-03-19T00:00:00Z')],
    etdTimestamps: [ts('2026-03-19T00:00:00Z')],
    atdTimestamps: null,
    ptaTimestamps: [ts('2026-03-20T00:00:00Z')],
    etaTimestamps: [ts('2026-03-20T00:00:00Z')],
    ataTimestamps: null,
    bookingNumber: 'PL-TR-0912',
    carrierName: 'PL Transport',
    blNumber: null,
    vesselName: null,
    vesselImo: null,
    voyageNumber: null,
    flightNumber: null,
    notes: null,
    legContainers: [],
    legPackages: lclPackages
      .filter((p) => p.destinationName === 'Warsaw')
      .map((p) => ({
        packageId: p.id,
        commodityDescription: p.commodityDescription,
        truckPlate: 'WGD 99887',
        driverFullName: 'M. Wisniewski',
        driverPhone: '+48 600 111 222',
      })),
  },
  {
    id: 'lcl-leg-2b',
    legSequence: 2,
    type: 'TRUCK',
    originName: 'Gdynia (Port)',
    destinationName: 'Lodz',
    ptdTimestamps: [ts('2026-03-19T00:00:00Z')],
    etdTimestamps: [ts('2026-03-19T00:00:00Z')],
    atdTimestamps: null,
    ptaTimestamps: [ts('2026-03-20T00:00:00Z')],
    etaTimestamps: [ts('2026-03-20T00:00:00Z')],
    ataTimestamps: null,
    bookingNumber: 'SP-0334',
    carrierName: 'SpedPol',
    blNumber: null,
    vesselName: null,
    vesselImo: null,
    voyageNumber: null,
    flightNumber: null,
    notes: null,
    legContainers: [],
    legPackages: lclPackages
      .filter((p) => p.destinationName === 'Lodz')
      .map((p) => ({
        packageId: p.id,
        commodityDescription: p.commodityDescription,
        truckPlate: 'ELD 55667',
        driverFullName: 'P. Zajac',
        driverPhone: '+48 600 333 444',
      })),
  },
]

export const MOCK_LCL_FILE: MockFile = {
  id: 'file-lcl-1',
  referenceNumber: 'IMP/LCL/0003/2026/ACME',
  shipmentType: 'IMP',
  cargoType: 'LCL',
  contractorName: 'Acme Corp',
  assigneeName: 'A. Nowak',
  notes: null,
  derivedStatus: 'Ready',
  createdAt: '2026-03-10',
  containers: [],
  packages: lclPackages,
  legs: lclLegs,
  warnings: [],
}

// ─── List page data ───────────────────────────────────────────────────────────

export type MockFileListRow = {
  id: string
  referenceNumber: string
  derivedStatus: DerivedStatus
  cargoType: CargoType
  shipmentType: ShipmentType
  contractorName: string
  originName: string
  destinationName: string
  containerSummary: string
  assigneeName: string | null
  createdAt: string
}

export const MOCK_FILE_LIST: MockFileListRow[] = [
  {
    id: 'file-fcl-1', referenceNumber: 'EXP/FCL/0012/2026/MAERSK', derivedStatus: 'In Transit',
    cargoType: 'FCL', shipmentType: 'EXP', contractorName: 'Maersk Ltd',
    originName: 'Shanghai', destinationName: 'Rotterdam',
    containerSummary: '32x 40HC', assigneeName: 'J. Kowalski', createdAt: '2026-03-12',
  },
  {
    id: 'file-lcl-1', referenceNumber: 'IMP/LCL/0003/2026/ACME', derivedStatus: 'Ready',
    cargoType: 'LCL', shipmentType: 'IMP', contractorName: 'Acme Corp',
    originName: 'Rotterdam', destinationName: 'Warsaw',
    containerSummary: '5 packages', assigneeName: 'A. Nowak', createdAt: '2026-03-10',
  },
  {
    id: 'file-fcl-2', referenceNumber: 'EXP/FCL/0011/2026/CMACGM', derivedStatus: 'Planning',
    cargoType: 'FCL', shipmentType: 'EXP', contractorName: 'CMA CGM',
    originName: 'Gdansk', destinationName: 'Rotterdam',
    containerSummary: '8x 20GP', assigneeName: 'J. Kowalski', createdAt: '2026-03-08',
  },
  {
    id: 'file-fcl-3', referenceNumber: 'LOC/FCL/0001/2026/HAMBSUD', derivedStatus: 'Partially Delivered',
    cargoType: 'FCL', shipmentType: 'LOC', contractorName: 'Hamburg Sud',
    originName: 'Hamburg', destinationName: 'Gdynia',
    containerSummary: '2x 40HC', assigneeName: null, createdAt: '2026-03-05',
  },
  {
    id: 'file-fcl-4', referenceNumber: 'IMP/FCL/0007/2026/EVERGRN', derivedStatus: 'Delivered',
    cargoType: 'FCL', shipmentType: 'IMP', contractorName: 'Evergreen',
    originName: 'Ningbo', destinationName: 'Gdansk',
    containerSummary: '4x 40HC, 2x 20RF', assigneeName: 'A. Nowak', createdAt: '2026-02-15',
  },
  {
    id: 'file-lcl-2', referenceNumber: 'EXP/LCL/0002/2026/DHL', derivedStatus: 'Empty',
    cargoType: 'LCL', shipmentType: 'EXP', contractorName: 'DHL Global',
    originName: 'Warsaw', destinationName: 'London',
    containerSummary: '0 packages', assigneeName: null, createdAt: '2026-03-14',
  },
]

// ─── Unified Transport Table (FmsFileUnit rows across all files) ──────────────

export type MockTransportRow = {
  id: string
  fileId: string
  referenceNumber: string
  cargoType: CargoType
  shipmentType: ShipmentType
  containerNumber: string | null
  containerType: string | null
  commodityDescription: string | null
  grossWeight: number | null
  weightUnit: string | null
  volume: number | null
  volumeUnit: string | null
  packageCount: number | null
  isHazardous: boolean
  originName: string
  destinationName: string
  contractorName: string
  assigneeName: string | null
  derivedStatus: DerivedStatus
  createdAt: string
}

export const MOCK_TRANSPORT_TABLE: MockTransportRow[] = [
  // FCL file: 32 units (showing first 6 + summary)
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `unit-fcl-${i + 1}`,
    fileId: 'file-fcl-1',
    referenceNumber: 'EXP/FCL/0012/2026/MAERSK',
    cargoType: 'FCL' as CargoType,
    shipmentType: 'EXP' as ShipmentType,
    containerNumber: i === 3 ? null : `MSMU38${String(28000 + i).padStart(5, '0')}`,
    containerType: '40HC',
    commodityDescription: 'Fibre optic cables',
    grossWeight: 22000 + i * 500,
    weightUnit: 'kg',
    volume: null,
    volumeUnit: null,
    packageCount: null,
    isHazardous: false,
    originName: 'Gdansk (Factory)',
    destinationName: i < 4 ? 'Rotterdam (Depot A)' : 'Rotterdam (Depot B)',
    contractorName: 'Maersk Ltd',
    assigneeName: 'J. Kowalski',
    derivedStatus: 'In Transit' as DerivedStatus,
    createdAt: '2026-03-12',
  })),
  // LCL file: 1 unit (consolidated)
  {
    id: 'unit-lcl-1',
    fileId: 'file-lcl-1',
    referenceNumber: 'IMP/LCL/0003/2026/ACME',
    cargoType: 'LCL',
    shipmentType: 'IMP',
    containerNumber: null,
    containerType: null,
    commodityDescription: 'Electronics, Auto parts, Chemicals, Textiles, Machine parts',
    grossWeight: 8360,
    weightUnit: 'kg',
    volume: 49,
    volumeUnit: 'cbm',
    packageCount: 46,
    isHazardous: true,
    originName: 'Rotterdam (Port)',
    destinationName: 'Warsaw',
    contractorName: 'Acme Corp',
    assigneeName: 'A. Nowak',
    derivedStatus: 'Ready',
    createdAt: '2026-03-10',
  },
  // Another FCL file: 2 units
  {
    id: 'unit-fcl-extra-1',
    fileId: 'file-fcl-3',
    referenceNumber: 'LOC/FCL/0001/2026/HAMBSUD',
    cargoType: 'FCL',
    shipmentType: 'LOC',
    containerNumber: 'SUDU7712345',
    containerType: '40HC',
    commodityDescription: null,
    grossWeight: 18500,
    weightUnit: 'kg',
    volume: null,
    volumeUnit: null,
    packageCount: null,
    isHazardous: false,
    originName: 'Hamburg (Port)',
    destinationName: 'Gdynia (Port)',
    contractorName: 'Hamburg Sud',
    assigneeName: null,
    derivedStatus: 'Partially Delivered',
    createdAt: '2026-03-05',
  },
  {
    id: 'unit-fcl-extra-2',
    fileId: 'file-fcl-3',
    referenceNumber: 'LOC/FCL/0001/2026/HAMBSUD',
    cargoType: 'FCL',
    shipmentType: 'LOC',
    containerNumber: 'SUDU7712346',
    containerType: '40HC',
    commodityDescription: null,
    grossWeight: 21200,
    weightUnit: 'kg',
    volume: null,
    volumeUnit: null,
    packageCount: null,
    isHazardous: false,
    originName: 'Hamburg (Port)',
    destinationName: 'Gdynia (Port)',
    contractorName: 'Hamburg Sud',
    assigneeName: null,
    derivedStatus: 'Delivered',
    createdAt: '2026-03-05',
  },
]

// ─── Detail page: structured data for DynamicTables ──────────────────────────

// Units table rows (FmsFileUnit)
export type MockUnitRow = {
  id: string
  containerNumber: string | null
  containerType: string | null
  commodityDescription: string | null
  grossWeight: number | null
  weightUnit: string | null
  volume: number | null
  volumeUnit: string | null
  packageCount: number | null
  isHazardous: boolean
  originName: string
  destinationName: string
  legCoverage: string // e.g. "3/3" or "0/3"
}

export const MOCK_FCL_UNITS: MockUnitRow[] = Array.from({ length: 6 }, (_, i) => ({
  id: `unit-${i + 1}`,
  containerNumber: i === 3 ? null : `MSMU38${String(28000 + i).padStart(5, '0')}`,
  containerType: '40HC',
  commodityDescription: null,
  grossWeight: 22000 + i * 500,
  weightUnit: 'kg',
  volume: null,
  volumeUnit: null,
  packageCount: null,
  isHazardous: false,
  originName: 'Gdansk (Factory)',
  destinationName: i < 4 ? 'Rotterdam (Depot A)' : 'Rotterdam (Depot B)',
  legCoverage: i === 3 ? '0/3' : '3/3',
}))

export const MOCK_LCL_UNITS: MockUnitRow[] = [{
  id: 'unit-lcl-1',
  containerNumber: null,
  containerType: null,
  commodityDescription: 'Electronics, Auto parts, Chemicals, Textiles, Machine parts',
  grossWeight: 8360,
  weightUnit: 'kg',
  volume: 49,
  volumeUnit: 'cbm',
  packageCount: 46,
  isHazardous: true,
  originName: 'Rotterdam (Port)',
  destinationName: 'Warsaw',
  legCoverage: '2/2',
}]

// Package detail rows (from packages_detail JSONB for LCL)
export type MockPackageRow = {
  id: string
  commodityDescription: string
  packageType: string
  packageCount: number
  grossWeight: number
  weightUnit: string
  volume: number
  volumeUnit: string
  isHazardous: boolean
  hazmatClass: string | null
}

export const MOCK_LCL_PACKAGES: MockPackageRow[] = [
  { id: 'p1', commodityDescription: 'Electronics', packageType: 'PLT', packageCount: 12, grossWeight: 2400, weightUnit: 'kg', volume: 14, volumeUnit: 'cbm', isHazardous: false, hazmatClass: null },
  { id: 'p2', commodityDescription: 'Auto parts', packageType: 'CTN', packageCount: 8, grossWeight: 960, weightUnit: 'kg', volume: 6, volumeUnit: 'cbm', isHazardous: false, hazmatClass: null },
  { id: 'p3', commodityDescription: 'Chemicals (CL3)', packageType: 'DRM', packageCount: 4, grossWeight: 800, weightUnit: 'kg', volume: 3, volumeUnit: 'cbm', isHazardous: true, hazmatClass: '3' },
  { id: 'p4', commodityDescription: 'Textiles', packageType: 'BOX', packageCount: 20, grossWeight: 1200, weightUnit: 'kg', volume: 18, volumeUnit: 'cbm', isHazardous: false, hazmatClass: null },
  { id: 'p5', commodityDescription: 'Machine parts', packageType: 'CRT', packageCount: 2, grossWeight: 3000, weightUnit: 'kg', volume: 8, volumeUnit: 'cbm', isHazardous: false, hazmatClass: null },
]

// Legs overview table rows (FmsFileLeg)
export type MockLegRow = {
  id: string
  legSequence: number
  type: LegType
  originName: string
  destinationName: string
  carrierName: string | null
  bookingNumber: string | null
  blNumber: string | null
  vesselName: string | null
  vesselImo: string | null
  voyageNumber: string | null
  flightNumber: string | null
  ptd: string | null
  etd: string | null
  atd: string | null
  pta: string | null
  eta: string | null
  ata: string | null
  etaUpdateCount: number
}

export const MOCK_FCL_LEGS: MockLegRow[] = [
  { id: 'leg-1', legSequence: 1, type: 'TRUCK', originName: 'Gdansk (Factory)', destinationName: 'Gdansk (Port)', carrierName: 'TransLog Sp.z.o.o', bookingNumber: 'TL-2026-0451', blNumber: null, vesselName: null, vesselImo: null, voyageNumber: null, flightNumber: null, ptd: '5 Mar', etd: '5 Mar', atd: '5 Mar 08:30', pta: '5 Mar', eta: '5 Mar', ata: '5 Mar 11:15', etaUpdateCount: 1 },
  { id: 'leg-2', legSequence: 2, type: 'SHIP', originName: 'Gdansk (Port)', destinationName: 'Rotterdam (Port)', carrierName: 'MSC', bookingNumber: '177LFNFND60342', blNumber: 'MSCUSHA12345', vesselName: 'MSC POSITANO', vesselImo: '9930561', voyageNumber: 'FE412A', flightNumber: null, ptd: '12 Mar', etd: '12 Mar', atd: '12 Mar 18:00', pta: '8 Apr', eta: '27 Apr', ata: null, etaUpdateCount: 3 },
  { id: 'leg-3a', legSequence: 3, type: 'TRUCK', originName: 'Rotterdam (Port)', destinationName: 'Rotterdam (Depot A)', carrierName: 'EuroTransit BV', bookingNumber: null, blNumber: null, vesselName: null, vesselImo: null, voyageNumber: null, flightNumber: null, ptd: '28 Apr', etd: null, atd: null, pta: '28 Apr', eta: null, ata: null, etaUpdateCount: 0 },
  { id: 'leg-3b', legSequence: 3, type: 'TRUCK', originName: 'Rotterdam (Port)', destinationName: 'Rotterdam (Depot B)', carrierName: 'NL Logistics', bookingNumber: null, blNumber: null, vesselName: null, vesselImo: null, voyageNumber: null, flightNumber: null, ptd: '28 Apr', etd: null, atd: null, pta: '28 Apr', eta: null, ata: null, etaUpdateCount: 0 },
]

export const MOCK_LCL_LEGS: MockLegRow[] = [
  { id: 'lcl-leg-1', legSequence: 1, type: 'SHIP', originName: 'Rotterdam (Port)', destinationName: 'Gdynia (Port)', carrierName: 'Unifeeder', bookingNumber: 'UF-NL-PL-0088', blNumber: 'UFDR-NL-PL-2026-0088', vesselName: 'RITA', vesselImo: '9812345', voyageNumber: '2026-W12', flightNumber: null, ptd: '15 Mar', etd: '15 Mar', atd: '15 Mar 06:00', pta: '18 Mar', eta: '18 Mar', ata: '18 Mar 14:30', etaUpdateCount: 1 },
  { id: 'lcl-leg-2', legSequence: 2, type: 'TRUCK', originName: 'Gdynia (Port)', destinationName: 'Warsaw', carrierName: 'PL Transport', bookingNumber: 'PL-TR-0912', blNumber: null, vesselName: null, vesselImo: null, voyageNumber: null, flightNumber: null, ptd: '19 Mar', etd: '19 Mar', atd: null, pta: '20 Mar', eta: '20 Mar', ata: null, etaUpdateCount: 0 },
]

// Unit-Leg assignment rows (FmsFileUnitLeg) — per leg
export type MockUnitLegRow = {
  id: string
  unitId: string
  containerNumber: string | null
  containerType: string | null
  grossWeight: number | null
  weightUnit: string | null
  truckPlate: string | null
  trailerPlate: string | null
  driverFullName: string | null
  driverPhone: string | null
  sealNumber: string | null
  blNumber: string | null
  consolidationContainerNumber: string | null
  notes: string | null
}

// FCL: unit-leg rows per leg
export const MOCK_FCL_UNITLEG_LEG1: MockUnitLegRow[] = MOCK_FCL_UNITS.filter(u => u.containerNumber !== null).map((u, i) => ({
  id: `ul-1-${i}`, unitId: u.id, containerNumber: u.containerNumber, containerType: u.containerType,
  grossWeight: u.grossWeight, weightUnit: u.weightUnit,
  truckPlate: 'WGD 12345', trailerPlate: 'WGD 67890', driverFullName: 'Jan Nowak', driverPhone: '+48 600 555 666',
  sealNumber: `SL${String(i + 1).padStart(3, '0')}`, blNumber: null, consolidationContainerNumber: null, notes: null,
}))

export const MOCK_FCL_UNITLEG_LEG2: MockUnitLegRow[] = MOCK_FCL_UNITS.filter(u => u.containerNumber !== null).map((u, i) => ({
  id: `ul-2-${i}`, unitId: u.id, containerNumber: u.containerNumber, containerType: u.containerType,
  grossWeight: u.grossWeight, weightUnit: u.weightUnit,
  truckPlate: null, trailerPlate: null, driverFullName: null, driverPhone: null,
  sealNumber: `MSC-${String(i + 123).padStart(5, '0')}`, blNumber: `MSCUSHA12345-${String(i + 1).padStart(2, '0')}`, consolidationContainerNumber: null, notes: null,
}))

export const MOCK_FCL_UNITLEG_LEG3A: MockUnitLegRow[] = MOCK_FCL_UNITS.slice(0, 4).filter(u => u.containerNumber !== null).map((u, i) => ({
  id: `ul-3a-${i}`, unitId: u.id, containerNumber: u.containerNumber, containerType: u.containerType,
  grossWeight: u.grossWeight, weightUnit: u.weightUnit,
  truckPlate: 'NL-AB-123', trailerPlate: 'NL-AB-456', driverFullName: 'Peter van Dijk', driverPhone: '+31 6 1234 5678',
  sealNumber: null, blNumber: null, consolidationContainerNumber: null, notes: null,
}))

export const MOCK_FCL_UNITLEG_LEG3B: MockUnitLegRow[] = MOCK_FCL_UNITS.slice(4, 6).map((u, i) => ({
  id: `ul-3b-${i}`, unitId: u.id, containerNumber: u.containerNumber, containerType: u.containerType,
  grossWeight: u.grossWeight, weightUnit: u.weightUnit,
  truckPlate: 'NL-CD-456', trailerPlate: 'NL-CD-789', driverFullName: 'Hans de Vries', driverPhone: '+31 6 9876 5432',
  sealNumber: null, blNumber: null, consolidationContainerNumber: null, notes: null,
}))

// LCL: unit-leg rows per leg (1 row each since 1 unit)
export const MOCK_LCL_UNITLEG_LEG1: MockUnitLegRow[] = [{
  id: 'ul-lcl-1', unitId: 'unit-lcl-1', containerNumber: null, containerType: null,
  grossWeight: 8360, weightUnit: 'kg',
  truckPlate: null, trailerPlate: null, driverFullName: null, driverPhone: null,
  sealNumber: null, blNumber: 'HBL-ACME-001', consolidationContainerNumber: 'TRIU8801234', notes: null,
}]

export const MOCK_LCL_UNITLEG_LEG2: MockUnitLegRow[] = [{
  id: 'ul-lcl-2', unitId: 'unit-lcl-1', containerNumber: null, containerType: null,
  grossWeight: 8360, weightUnit: 'kg',
  truckPlate: 'WGD 99887', trailerPlate: null, driverFullName: 'M. Wisniewski', driverPhone: '+48 600 111 222',
  sealNumber: null, blNumber: null, consolidationContainerNumber: null, notes: null,
}]

// Map leg IDs to their unit-leg data
export const MOCK_FCL_UNITLEG_MAP: Record<string, MockUnitLegRow[]> = {
  'leg-1': MOCK_FCL_UNITLEG_LEG1,
  'leg-2': MOCK_FCL_UNITLEG_LEG2,
  'leg-3a': MOCK_FCL_UNITLEG_LEG3A,
  'leg-3b': MOCK_FCL_UNITLEG_LEG3B,
}

export const MOCK_LCL_UNITLEG_MAP: Record<string, MockUnitLegRow[]> = {
  'lcl-leg-1': MOCK_LCL_UNITLEG_LEG1,
  'lcl-leg-2': MOCK_LCL_UNITLEG_LEG2,
}

// ─── Transport Leg Table (1 row per unit-leg assignment) ──────────────────────

export type MockTransportLegRow = {
  id: string
  // File
  fileId: string
  referenceNumber: string
  cargoType: CargoType
  shipmentType: ShipmentType
  contractorName: string
  assigneeName: string | null
  derivedStatus: DerivedStatus
  // Unit
  unitId: string
  containerNumber: string | null
  containerType: string | null
  commodityDescription: string | null
  grossWeight: number | null
  weightUnit: string | null
  volume: number | null
  volumeUnit: string | null
  packageCount: number | null
  isHazardous: boolean
  unitOrigin: string
  unitDestination: string
  // Leg (null when unit is unassigned to any leg)
  legId: string | null
  legSequence: number | null
  legType: LegType | null
  legOrigin: string | null
  legDestination: string | null
  carrierName: string | null
  bookingNumber: string | null
  masterBl: string | null
  vesselName: string | null
  vesselImo: string | null
  voyageNumber: string | null
  flightNumber: string | null
  ptd: string | null
  etd: string | null
  atd: string | null
  pta: string | null
  eta: string | null
  ata: string | null
  etaUpdateCount: number
  // Unit-Leg assignment
  truckPlate: string | null
  trailerPlate: string | null
  driverFullName: string | null
  driverPhone: string | null
  sealNumber: string | null
  unitBl: string | null
  consolidationContainer: string | null
  notes: string | null
  createdAt: string
}

function buildTransportLegRows(): MockTransportLegRow[] {
  const rows: MockTransportLegRow[] = []

  // FCL file: 5 units × legs they're assigned to
  const fclFile = { fileId: 'file-fcl-1', referenceNumber: 'EXP/FCL/0012/2026/MAERSK', cargoType: 'FCL' as CargoType, shipmentType: 'EXP' as ShipmentType, contractorName: 'Maersk Ltd', assigneeName: 'J. Kowalski', derivedStatus: 'In Transit' as DerivedStatus, createdAt: '2026-03-12' }

  const fclUnits = MOCK_FCL_UNITS
  const fclLegs = MOCK_FCL_LEGS
  const fclUnitLegMap = MOCK_FCL_UNITLEG_MAP

  // Helper: build rows for one file
  function addFileRows(
    fileFields: typeof fclFile,
    units: MockUnitRow[],
    legs: MockLegRow[],
    unitLegMap: Record<string, MockUnitLegRow[]>,
  ) {
    const assignedUnitIds = new Set<string>()

    // Rows for assigned units (1 row per unit × leg)
    for (const leg of legs) {
      const unitLegs = unitLegMap[leg.id] ?? []
      for (const ul of unitLegs) {
        const unit = units.find((u) => u.id === ul.unitId)
        if (!unit) continue
        assignedUnitIds.add(ul.unitId)
        rows.push({
          id: `tlr-${leg.id}-${ul.unitId}`,
          ...fileFields,
          unitId: ul.unitId,
          containerNumber: unit.containerNumber,
          containerType: unit.containerType,
          commodityDescription: unit.commodityDescription,
          grossWeight: unit.grossWeight,
          weightUnit: unit.weightUnit,
          volume: unit.volume,
          volumeUnit: unit.volumeUnit,
          packageCount: unit.packageCount,
          isHazardous: unit.isHazardous,
          unitOrigin: unit.originName,
          unitDestination: unit.destinationName,
          legId: leg.id,
          legSequence: leg.legSequence,
          legType: leg.type,
          legOrigin: leg.originName,
          legDestination: leg.destinationName,
          carrierName: leg.carrierName,
          bookingNumber: leg.bookingNumber,
          masterBl: leg.blNumber,
          vesselName: leg.vesselName,
          vesselImo: leg.vesselImo,
          voyageNumber: leg.voyageNumber,
          flightNumber: leg.flightNumber,
          ptd: leg.ptd,
          etd: leg.etd,
          atd: leg.atd,
          pta: leg.pta,
          eta: leg.eta,
          ata: leg.ata,
          etaUpdateCount: leg.etaUpdateCount,
          truckPlate: ul.truckPlate,
          trailerPlate: ul.trailerPlate,
          driverFullName: ul.driverFullName,
          driverPhone: ul.driverPhone,
          sealNumber: ul.sealNumber,
          unitBl: ul.blNumber,
          consolidationContainer: ul.consolidationContainerNumber,
          notes: ul.notes,
          createdAt: fileFields.createdAt,
        })
      }
    }

    // Rows for unassigned units (1 row per unit, all leg/assignment fields null)
    for (const unit of units) {
      if (assignedUnitIds.has(unit.id)) continue
      rows.push({
        id: `tlr-unassigned-${unit.id}`,
        ...fileFields,
        unitId: unit.id,
        containerNumber: unit.containerNumber,
        containerType: unit.containerType,
        commodityDescription: unit.commodityDescription,
        grossWeight: unit.grossWeight,
        weightUnit: unit.weightUnit,
        volume: unit.volume,
        volumeUnit: unit.volumeUnit,
        packageCount: unit.packageCount,
        isHazardous: unit.isHazardous,
        unitOrigin: unit.originName,
        unitDestination: unit.destinationName,
        legId: null,
        legSequence: null,
        legType: null,
        legOrigin: null,
        legDestination: null,
        carrierName: null,
        bookingNumber: null,
        masterBl: null,
        vesselName: null,
        vesselImo: null,
        voyageNumber: null,
        flightNumber: null,
        ptd: null,
        etd: null,
        atd: null,
        pta: null,
        eta: null,
        ata: null,
        etaUpdateCount: 0,
        truckPlate: null,
        trailerPlate: null,
        driverFullName: null,
        driverPhone: null,
        sealNumber: null,
        unitBl: null,
        consolidationContainer: null,
        notes: null,
        createdAt: fileFields.createdAt,
      })
    }
  }

  addFileRows(fclFile, fclUnits, fclLegs, fclUnitLegMap)

  // LCL file
  const lclFile = { fileId: 'file-lcl-1', referenceNumber: 'IMP/LCL/0003/2026/ACME', cargoType: 'LCL' as CargoType, shipmentType: 'IMP' as ShipmentType, contractorName: 'Acme Corp', assigneeName: 'A. Nowak', derivedStatus: 'Ready' as DerivedStatus, createdAt: '2026-03-10' }

  addFileRows(lclFile, MOCK_LCL_UNITS, MOCK_LCL_LEGS, MOCK_LCL_UNITLEG_MAP)

  return rows
}

export const MOCK_TRANSPORT_LEG_TABLE: MockTransportLegRow[] = buildTransportLegRows()

// ─── Helper: get latest timestamp ─────────────────────────────────────────────

export function getLatestTimestampValue(entries: TimestampEntry[] | null): string | null {
  if (!entries || entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return sorted[0].value
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const day = d.getUTCDate()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[d.getUTCMonth()]
  const hours = d.getUTCHours()
  const minutes = d.getUTCMinutes()
  if (hours === 0 && minutes === 0) return `${day} ${month}`
  return `${day} ${month} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
