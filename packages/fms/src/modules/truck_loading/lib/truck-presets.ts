import type { TruckPreset } from './types'

export const TRUCK_PRESETS: TruckPreset[] = [
  {
    id: 'standard',
    label: 'Standard Semi-Trailer',
    width: 245,
    length: 1360,
    height: 280,
    maxWeight: 24000,
  },
  {
    id: 'mega',
    label: 'Mega Trailer',
    width: 245,
    length: 1360,
    height: 300,
    maxWeight: 24000,
  },
  {
    id: 'tandem',
    label: 'Tandem (2x 770cm)',
    width: 245,
    length: 770,
    height: 300,
    maxWeight: 24000,
  },
  {
    id: 'container_20ft',
    label: '20ft Container',
    width: 235,
    length: 590,
    height: 239,
    maxWeight: 21770,
  },
  {
    id: 'container_40ft',
    label: '40ft Container',
    width: 235,
    length: 1203,
    height: 239,
    maxWeight: 26680,
  },
  {
    id: 'container_40hc',
    label: '40ft HC Container',
    width: 235,
    length: 1203,
    height: 269,
    maxWeight: 26460,
  },
]

export function getDefaultTruck(): TruckPreset {
  return TRUCK_PRESETS[0]
}
