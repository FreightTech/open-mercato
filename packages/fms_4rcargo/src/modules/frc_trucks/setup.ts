import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { FrcTruckPreset } from './data/entities'

const DEFAULT_PRESETS = [
  // 245 × 1360 × 270 / 1,000,000 = 89.964 m³
  { name: 'Standard Semi-Trailer', width: 245, length: 1360, height: 270, maxWeight: 24000, volume: 89.96 },
  // 245 × 1360 × 300 / 1,000,000 = 99.96 m³
  { name: 'Mega Trailer', width: 245, length: 1360, height: 300, maxWeight: 24000, volume: 99.96 },
  // Double deck: effective usable volume with both decks (~120 m³)
  { name: 'Double Deck Trailer', width: 245, length: 1360, height: 300, maxWeight: 24000, volume: 120.00 },
  // 240 × 620 × 240 / 1,000,000 = 35.712 m³
  { name: 'Box Truck (7.5t)', width: 240, length: 620, height: 240, maxWeight: 3500, volume: 35.71 },
]

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'frc_trucks.view',
      'frc_trucks.manage',
    ],
    employee: [
      'frc_trucks.view',
      'frc_trucks.manage',
    ],
  },

  async seedDefaults({ em, tenantId, organizationId }) {
    for (const preset of DEFAULT_PRESETS) {
      const exists = await em.findOne(FrcTruckPreset, {
        organizationId,
        tenantId,
        name: preset.name,
      })
      if (!exists) {
        em.persist(em.create(FrcTruckPreset, {
          organizationId,
          tenantId,
          ...preset,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      }
    }
    await em.flush()
  },
}

export default setup
