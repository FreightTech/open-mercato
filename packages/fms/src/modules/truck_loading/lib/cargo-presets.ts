export interface CargoPreset {
  id: string
  label: string
  width: number
  length: number
  height: number
  weight: number
  stackable: boolean
}

export const CARGO_PRESETS: CargoPreset[] = [
  {
    id: 'euro_pallet',
    label: 'Euro Pallet (EPAL)',
    width: 120,
    length: 80,
    height: 144,
    weight: 800,
    stackable: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    width: 100,
    length: 100,
    height: 100,
    weight: 100,
    stackable: false,
  },
]

export function getDefaultCargoPreset(): CargoPreset {
  return CARGO_PRESETS[0]
}
