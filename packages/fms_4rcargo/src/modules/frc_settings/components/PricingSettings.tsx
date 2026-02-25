"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type PricingConfig = {
  airVolumetricFactor: string | null
  seaVolumetricFactor: string | null
  roadVolumetricFactor: string | null
  truckWidthMetres: string | null
  minChargeableWeightKg: string | null
}

const DEFAULT_CONFIG: PricingConfig = {
  airVolumetricFactor: '167',
  seaVolumetricFactor: '1000',
  roadVolumetricFactor: '333',
  truckWidthMetres: '2.4',
  minChargeableWeightKg: null,
}

export function PricingSettings() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()

  const [config, setConfig] = React.useState<PricingConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  // Form state
  const [airFactor, setAirFactor] = React.useState('')
  const [seaFactor, setSeaFactor] = React.useState('')
  const [roadFactor, setRoadFactor] = React.useState('')
  const [truckWidth, setTruckWidth] = React.useState('')
  const [minWeight, setMinWeight] = React.useState('')

  // Load config on mount and scope change
  const loadConfig = React.useCallback(async () => {
    setLoading(true)
    try {
      const call = await apiCall<PricingConfig>('/api/frc_settings/pricing')
      if (call.ok && call.result) {
        setConfig(call.result)
        setAirFactor(call.result.airVolumetricFactor ?? '167')
        setSeaFactor(call.result.seaVolumetricFactor ?? '1000')
        setRoadFactor(call.result.roadVolumetricFactor ?? '333')
        setTruckWidth(call.result.truckWidthMetres ?? '2.4')
        setMinWeight(call.result.minChargeableWeightKg ?? '')
      }
    } catch (err) {
      console.error('frc_settings.pricing.load failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadConfig()
  }, [scopeVersion, loadConfig])

  // Save config
  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        airVolumetricFactor: airFactor || '167',
        seaVolumetricFactor: seaFactor || '1000',
        roadVolumetricFactor: roadFactor || '333',
        truckWidthMetres: truckWidth || '2.4',
        minChargeableWeightKg: minWeight || null,
      }

      const call = await apiCall<PricingConfig>('/api/frc_settings/pricing', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (call.ok && call.result) {
        setConfig(call.result)
        flash(
          t('frc_settings.pricing.messages.saved', 'Pricing settings saved'),
          'success'
        )
      } else {
        flash(
          t('frc_settings.pricing.messages.save_failed', 'Failed to save pricing settings'),
          'error'
        )
      }
    } catch (err) {
      console.error('frc_settings.pricing.save failed', err)
      flash(
        t('frc_settings.pricing.messages.save_failed', 'Failed to save pricing settings'),
        'error'
      )
    } finally {
      setSaving(false)
    }
  }

  // Reset to defaults
  const handleReset = () => {
    setAirFactor('167')
    setSeaFactor('1000')
    setRoadFactor('333')
    setTruckWidth('2.4')
    setMinWeight('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('frc_settings.pricing.defaults.title', 'Default Pricing Settings')}</CardTitle>
        <CardDescription>
          {t('frc_settings.pricing.defaults.description', 'Configure default volumetric conversion factors and calculation parameters for all carriers. Carriers can have individual overrides below.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Volumetric Factors */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">
            {t('frc_settings.pricing.volumetric.title', 'Volumetric Conversion Factors')}
          </h4>
          <p className="text-sm text-muted-foreground">
            {t('frc_settings.pricing.volumetric.description', 'Volumetric factor determines chargeable weight. Higher factor means less volumetric weight for same volume.')}
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Air */}
            <div className="space-y-2">
              <Label htmlFor="airFactor">
                {t('frc_settings.pricing.volumetric.air', 'Air Freight')}
                <span className="ml-1 text-xs text-muted-foreground">(kg/m³)</span>
              </Label>
              <Input
                id="airFactor"
                type="number"
                min="1"
                step="1"
                placeholder="167"
                value={airFactor}
                onChange={(e) => setAirFactor(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('frc_settings.pricing.volumetric.air_hint', 'Standard: 167 kg/m³ (IATA)')}
              </p>
            </div>

            {/* Sea */}
            <div className="space-y-2">
              <Label htmlFor="seaFactor">
                {t('frc_settings.pricing.volumetric.sea', 'Sea Freight')}
                <span className="ml-1 text-xs text-muted-foreground">(kg/m³)</span>
              </Label>
              <Input
                id="seaFactor"
                type="number"
                min="1"
                step="1"
                placeholder="1000"
                value={seaFactor}
                onChange={(e) => setSeaFactor(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('frc_settings.pricing.volumetric.sea_hint', 'Standard: 1000 kg/m³')}
              </p>
            </div>

            {/* Road */}
            <div className="space-y-2">
              <Label htmlFor="roadFactor">
                {t('frc_settings.pricing.volumetric.road', 'Road Freight')}
                <span className="ml-1 text-xs text-muted-foreground">(kg/m³)</span>
              </Label>
              <Input
                id="roadFactor"
                type="number"
                min="1"
                step="1"
                placeholder="333"
                value={roadFactor}
                onChange={(e) => setRoadFactor(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('frc_settings.pricing.volumetric.road_hint', 'Standard: 333 kg/m³')}
              </p>
            </div>
          </div>
        </div>

        {/* Other Settings */}
        <div className="border-t pt-6 space-y-4">
          <h4 className="text-sm font-semibold">
            {t('frc_settings.pricing.other.title', 'Other Calculation Parameters')}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Truck Width */}
            <div className="space-y-2">
              <Label htmlFor="truckWidth">
                {t('frc_settings.pricing.other.truck_width', 'Standard Truck Width')}
                <span className="ml-1 text-xs text-muted-foreground">(metres)</span>
              </Label>
              <Input
                id="truckWidth"
                type="number"
                min="0.1"
                step="0.1"
                placeholder="2.4"
                value={truckWidth}
                onChange={(e) => setTruckWidth(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('frc_settings.pricing.other.truck_width_hint', 'Used for loading metres calculation. Standard: 2.4m')}
              </p>
            </div>

            {/* Min Chargeable Weight */}
            <div className="space-y-2">
              <Label htmlFor="minWeight">
                {t('frc_settings.pricing.other.min_weight', 'Minimum Chargeable Weight')}
                <span className="ml-1 text-xs text-muted-foreground">(kg, optional)</span>
              </Label>
              <Input
                id="minWeight"
                type="number"
                min="0"
                step="0.01"
                placeholder={t('frc_settings.pricing.other.no_minimum', 'No minimum')}
                value={minWeight}
                onChange={(e) => setMinWeight(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('frc_settings.pricing.other.min_weight_hint', 'Leave empty for no minimum chargeable weight')}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            {t('common.reset_defaults', 'Reset to Defaults')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                {t('common.saving', 'Saving...')}
              </>
            ) : (
              t('common.save', 'Save')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
