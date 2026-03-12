"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Trash2, Plus, Pencil } from 'lucide-react'
import { CarrierSearchAutocomplete } from './CarrierSearchAutocomplete'

type TransportMode = 'air' | 'sea' | 'road'

type CarrierOverride = {
  id: string
  carrierId: string
  carrierName: string
  transportMode: TransportMode
  volumetricFactor: string | null
  minChargeableWeightKg: string | null
  createdAt: string
  updatedAt: string
}

type CarrierOption = {
  id: string
  name: string
}

export function CarrierPricingOverrides() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()

  const [overrides, setOverrides] = React.useState<CarrierOverride[]>([])
  const [loading, setLoading] = React.useState(true)

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingOverride, setEditingOverride] = React.useState<CarrierOverride | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Form state
  const [selectedCarrier, setSelectedCarrier] = React.useState<CarrierOption | null>(null)
  const [transportMode, setTransportMode] = React.useState<TransportMode>('air')
  const [volumetricFactor, setVolumetricFactor] = React.useState('')
  const [minWeight, setMinWeight] = React.useState('')

  // Load overrides
  const loadOverrides = React.useCallback(async () => {
    setLoading(true)
    try {
      const call = await apiCall<{ items: CarrierOverride[] }>('/api/frc_settings/pricing/carriers')
      if (call.ok && call.result) {
        setOverrides(call.result.items)
      }
    } catch (err) {
      console.error('frc_settings.pricing.carriers.load failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadOverrides()
  }, [scopeVersion, loadOverrides])

  // Open dialog for new override
  const handleAdd = () => {
    setEditingOverride(null)
    setSelectedCarrier(null)
    setTransportMode('air')
    setVolumetricFactor('')
    setMinWeight('')
    setDialogOpen(true)
  }

  // Open dialog for editing
  const handleEdit = (override: CarrierOverride) => {
    setEditingOverride(override)
    setSelectedCarrier({ id: override.carrierId, name: override.carrierName })
    setTransportMode(override.transportMode)
    setVolumetricFactor(override.volumetricFactor ?? '')
    setMinWeight(override.minChargeableWeightKg ?? '')
    setDialogOpen(true)
  }

  // Delete override
  const handleDelete = async (override: CarrierOverride) => {
    if (!confirm(t('frc_settings.pricing.carriers.confirm_delete', `Delete override for ${override.carrierName}?`))) {
      return
    }

    try {
      const call = await apiCall(`/api/frc_settings/pricing/carriers/${override.carrierId}`, {
        method: 'DELETE',
      })

      if (call.ok) {
        flash(
          t('frc_settings.pricing.carriers.deleted', 'Carrier override deleted'),
          'success'
        )
        void loadOverrides()
      } else {
        flash(
          t('frc_settings.pricing.carriers.delete_failed', 'Failed to delete carrier override'),
          'error'
        )
      }
    } catch (err) {
      console.error('frc_settings.pricing.carriers.delete failed', err)
      flash(
        t('frc_settings.pricing.carriers.delete_failed', 'Failed to delete carrier override'),
        'error'
      )
    }
  }

  // Save override (create or update)
  const handleSave = async () => {
    if (!selectedCarrier) {
      flash(t('frc_settings.pricing.carriers.select_carrier', 'Please select a carrier'), 'error')
      return
    }

    if (!volumetricFactor && !minWeight) {
      flash(t('frc_settings.pricing.carriers.enter_values', 'Please enter at least one override value'), 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        carrierId: selectedCarrier.id,
        carrierName: selectedCarrier.name,
        transportMode,
        volumetricFactor: volumetricFactor || null,
        minChargeableWeightKg: minWeight || null,
      }

      const isEdit = editingOverride !== null
      const url = isEdit
        ? `/api/frc_settings/pricing/carriers/${selectedCarrier.id}`
        : '/api/frc_settings/pricing/carriers'
      const method = isEdit ? 'PUT' : 'POST'

      const call = await apiCall<CarrierOverride>(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (call.ok) {
        flash(
          isEdit
            ? t('frc_settings.pricing.carriers.updated', 'Carrier override updated')
            : t('frc_settings.pricing.carriers.created', 'Carrier override created'),
          'success'
        )
        setDialogOpen(false)
        void loadOverrides()
      } else {
        flash(
          t('frc_settings.pricing.carriers.save_failed', 'Failed to save carrier override'),
          'error'
        )
      }
    } catch (err) {
      console.error('frc_settings.pricing.carriers.save failed', err)
      flash(
        t('frc_settings.pricing.carriers.save_failed', 'Failed to save carrier override'),
        'error'
      )
    } finally {
      setSaving(false)
    }
  }

  // Get mode badge variant
  const getModeVariant = (mode: TransportMode) => {
    switch (mode) {
      case 'air': return 'default'
      case 'sea': return 'secondary'
      case 'road': return 'outline'
    }
  }

  // Get default factor for mode
  const getDefaultFactor = (mode: TransportMode) => {
    switch (mode) {
      case 'air': return '167'
      case 'sea': return '1000'
      case 'road': return '333'
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('frc_settings.pricing.carriers.title', 'Carrier Overrides')}</CardTitle>
            <CardDescription>
              {t('frc_settings.pricing.carriers.description', 'Configure pricing overrides for specific carriers. These take precedence over default settings.')}
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAdd} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t('frc_settings.pricing.carriers.add', 'Add Override')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingOverride
                    ? t('frc_settings.pricing.carriers.edit_title', 'Edit Carrier Override')
                    : t('frc_settings.pricing.carriers.add_title', 'Add Carrier Override')}
                </DialogTitle>
                <DialogDescription>
                  {t('frc_settings.pricing.carriers.dialog_description', 'Set custom pricing parameters for this carrier.')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Carrier Selection */}
                <div className="space-y-2">
                  <Label>{t('frc_settings.pricing.carriers.carrier', 'Carrier')}</Label>
                  <CarrierSearchAutocomplete
                    value={selectedCarrier}
                    onChange={setSelectedCarrier}
                    disabled={editingOverride !== null}
                  />
                </div>

                {/* Transport Mode */}
                <div className="space-y-2">
                  <Label>{t('frc_settings.pricing.carriers.transport_mode', 'Transport Mode')}</Label>
                  <select
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value as TransportMode)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="air">{t('frc_settings.pricing.mode.air', 'Air Freight')}</option>
                    <option value="sea">{t('frc_settings.pricing.mode.sea', 'Sea Freight')}</option>
                    <option value="road">{t('frc_settings.pricing.mode.road', 'Road Freight')}</option>
                  </select>
                </div>

                {/* Volumetric Factor */}
                <div className="space-y-2">
                  <Label htmlFor="dialogVolumetricFactor">
                    {t('frc_settings.pricing.carriers.volumetric_factor', 'Volumetric Factor')}
                    <span className="ml-1 text-xs text-muted-foreground">(kg/m³)</span>
                  </Label>
                  <Input
                    id="dialogVolumetricFactor"
                    type="number"
                    min="1"
                    step="1"
                    placeholder={getDefaultFactor(transportMode)}
                    value={volumetricFactor}
                    onChange={(e) => setVolumetricFactor(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('frc_settings.pricing.carriers.volumetric_hint', `Leave empty to use default (${getDefaultFactor(transportMode)} kg/m³)`)}
                  </p>
                </div>

                {/* Min Chargeable Weight */}
                <div className="space-y-2">
                  <Label htmlFor="dialogMinWeight">
                    {t('frc_settings.pricing.carriers.min_weight', 'Min Chargeable Weight')}
                    <span className="ml-1 text-xs text-muted-foreground">(kg)</span>
                  </Label>
                  <Input
                    id="dialogMinWeight"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t('frc_settings.pricing.carriers.use_default', 'Use default')}
                    value={minWeight}
                    onChange={(e) => setMinWeight(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                  {t('common.cancel', 'Cancel')}
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
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : overrides.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('frc_settings.pricing.carriers.empty', 'No carrier overrides configured.')}</p>
            <p className="text-sm mt-1">
              {t('frc_settings.pricing.carriers.empty_hint', 'All carriers will use the default pricing settings above.')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('frc_settings.pricing.carriers.column.carrier', 'Carrier')}</TableHead>
                <TableHead>{t('frc_settings.pricing.carriers.column.mode', 'Mode')}</TableHead>
                <TableHead className="text-right">{t('frc_settings.pricing.carriers.column.volumetric', 'Volumetric Factor')}</TableHead>
                <TableHead className="text-right">{t('frc_settings.pricing.carriers.column.min_weight', 'Min Weight')}</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((override) => (
                <TableRow key={override.id}>
                  <TableCell className="font-medium">{override.carrierName}</TableCell>
                  <TableCell>
                    <Badge variant={getModeVariant(override.transportMode)}>
                      {override.transportMode.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {override.volumetricFactor ? `${override.volumetricFactor} kg/m³` : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {override.minChargeableWeightKg ? `${override.minChargeableWeightKg} kg` : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(override)}
                        title={t('common.edit', 'Edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(override)}
                        title={t('common.delete', 'Delete')}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
