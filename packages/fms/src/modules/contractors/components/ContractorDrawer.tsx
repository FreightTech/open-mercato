'use client'

import * as React from 'react'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Search,
  Edit3,
  Loader2,
  Hash,
  MapPin,
  Check,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Separator } from '@open-mercato/ui/primitives/separator'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useRegonLookup } from '../hooks/useRegonLookup'
import { ContractorLocationsTab } from './ContractorLocationsTab'
import { ContractorContactsTab } from './ContractorContactsTab'
import { ContractorPaymentSection } from './ContractorPaymentSection'
import type { RegonLookupResponse } from '../api/regon-lookup/route'

type DataSource = 'regon' | 'manual'

type ContractorContact = {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  isPrimary: boolean
  isActive: boolean
}

type ContractorPaymentTerms = {
  id: string
  paymentDays: number
  paymentMethod?: string | null
  currencyCode: string
  bankName?: string | null
  bankAccountNumber?: string | null
  bankRoutingNumber?: string | null
  iban?: string | null
  swiftBic?: string | null
  notes?: string | null
}

type ContractorCreditLimit = {
  id: string
  creditLimit: string
  currencyCode: string
  isUnlimited: boolean
  notes?: string | null
}

export type ContractorDetail = {
  id: string
  name: string
  shortName?: string | null
  officialName?: string | null
  parentId?: string | null
  taxId?: string | null
  regon?: string | null
  krs?: string | null
  registrationDate?: string | null
  pkdMainCode?: string | null
  pkdMainDescription?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  roleTypeIds?: string[]
  contacts: ContractorContact[]
  paymentTerms?: ContractorPaymentTerms | null
  creditLimit?: ContractorCreditLimit | null
}

interface ContractorFormData {
  dataSource: DataSource
  nipInput: string
  regonResult: NonNullable<RegonLookupResponse['company']> | null
  name: string
  shortName: string
  officialName: string
  taxId: string
  regon: string
  krs: string
  registrationDate: string
  pkdMainCode: string
  pkdMainDescription: string
  createAddress: boolean
  addressLine: string
  city: string
  state: string
  postalCode: string
  country: string
  roleTypeIds: string[]
  isActive: boolean
}

const initialFormData: ContractorFormData = {
  dataSource: 'regon',
  nipInput: '',
  regonResult: null,
  name: '',
  shortName: '',
  officialName: '',
  taxId: '',
  regon: '',
  krs: '',
  registrationDate: '',
  pkdMainCode: '',
  pkdMainDescription: '',
  createAddress: true,
  addressLine: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'Poland',
  roleTypeIds: [],
  isActive: true,
}

export interface ContractorDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  contractorId?: string
  onSaved?: (contractor: { id: string }) => void
}

export function ContractorDrawer({
  open,
  onOpenChange,
  mode,
  contractorId,
  onSaved,
}: ContractorDrawerProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const { lookup, isLoading: isSearching, reset: resetLookup } = useRegonLookup()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [formData, setFormData] = useState<ContractorFormData>(initialFormData)

  // Fetch contractor data for edit mode
  const { data: contractor, isLoading: isLoadingContractor, refetch } = useQuery({
    queryKey: ['contractor', contractorId],
    queryFn: async () => {
      if (!contractorId) return null
      const response = await apiCall<ContractorDetail>(`/api/contractors/contractors/${contractorId}`)
      if (!response.ok) throw new Error('Failed to load contractor')
      return response.result
    },
    enabled: mode === 'edit' && !!contractorId && open,
  })

  // Reset form when drawer opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && contractor) {
        setFormData({
          dataSource: 'manual',
          nipInput: contractor.taxId ?? '',
          regonResult: null,
          name: contractor.name ?? '',
          shortName: contractor.shortName ?? '',
          officialName: contractor.officialName ?? '',
          taxId: contractor.taxId ?? '',
          regon: contractor.regon ?? '',
          krs: contractor.krs ?? '',
          registrationDate: contractor.registrationDate ?? '',
          pkdMainCode: contractor.pkdMainCode ?? '',
          pkdMainDescription: contractor.pkdMainDescription ?? '',
          createAddress: false,
          addressLine: '',
          city: '',
          state: '',
          postalCode: '',
          country: 'Poland',
          roleTypeIds: contractor.roleTypeIds ?? [],
          isActive: contractor.isActive ?? true,
        })
      } else {
        setFormData(initialFormData)
      }
      setSearchError(null)
      resetLookup()
    }
  }, [open, mode, contractor, resetLookup])

  // Handle REGON search
  const handleSearch = useCallback(async () => {
    if (!formData.nipInput.trim()) {
      setSearchError(t('contractors.regonLookup.enterNipFirst', 'Enter NIP to search'))
      return
    }

    setSearchError(null)

    const result = await lookup({ nip: formData.nipInput.trim() })

    if (result.error) {
      setSearchError(result.error)
      return
    }

    if (!result.company) {
      setSearchError(t('contractors.regonLookup.notFound', 'Company not found in REGON registry'))
      return
    }

    // Auto-fill form with REGON data
    // Use shortName as the display name if available, otherwise use official name
    const displayName = result.company?.shortName || result.company?.name || ''
    setFormData((prev) => ({
      ...prev,
      regonResult: result.company,
      name: prev.name || displayName, // Only fill if empty, let user keep their custom name
      shortName: result.company?.shortName ?? prev.shortName,
      officialName: result.company?.name ?? prev.officialName, // Always store official name from REGON
      taxId: result.company?.nip ?? prev.taxId,
      regon: result.company?.regon ?? prev.regon,
      krs: result.company?.krs ?? prev.krs,
      registrationDate: result.company?.registrationDate ?? prev.registrationDate,
      pkdMainCode: result.company?.pkdMainCode ?? prev.pkdMainCode,
      pkdMainDescription: result.company?.pkdMainDescription ?? prev.pkdMainDescription,
      addressLine: result.company?.address.addressLine ?? prev.addressLine,
      city: result.company?.address.city ?? prev.city,
      state: result.company?.address.state ?? prev.state,
      postalCode: result.company?.address.postalCode ?? prev.postalCode,
      country: result.company?.address.country ?? 'Poland',
    }))

    flash(
      t('contractors.regonLookup.success', 'Company data loaded: {name}').replace('{name}', result.company.name),
      'success'
    )
  }, [formData.nipInput, lookup, t])

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!formData.name.trim()) {
        flash(t('contractors.validation.nameRequired', 'Company name is required'), 'error')
        return
      }

      setIsSubmitting(true)

      try {
        const payload: Record<string, unknown> = {
          name: formData.name.trim(),
          shortName: formData.shortName.trim() || null,
          officialName: formData.officialName.trim() || null,
          taxId: formData.taxId.trim() || null,
          regon: formData.regon.trim() || null,
          krs: formData.krs.trim() || null,
          registrationDate: formData.registrationDate.trim() || null,
          pkdMainCode: formData.pkdMainCode.trim() || null,
          pkdMainDescription: formData.pkdMainDescription.trim() || null,
          roleTypeIds: formData.roleTypeIds,
          isActive: formData.isActive,
        }

        let response: { ok: boolean; result?: { id: string; error?: string } | null }

        if (mode === 'edit' && contractorId) {
          response = await apiCall<{ id: string; error?: string }>(
            `/api/contractors/contractors/${contractorId}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }
          )
        } else {
          response = await apiCall<{ id: string; error?: string }>('/api/contractors/contractors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        }

        if (response.ok && response.result?.id) {
          const newContractorId = response.result.id

          // Create primary address if requested (create mode only)
          if (mode === 'create' && formData.createAddress && formData.addressLine) {
            const addressPayload = {
              contractorId: newContractorId,
              type: 'contractor_billing',
              code: `${formData.name.substring(0, 10).toUpperCase().replace(/\s+/g, '-')}-MAIN`,
              name: formData.name,
              addressLine1: formData.addressLine,
              city: formData.city || null,
              state: formData.state || null,
              postalCode: formData.postalCode || null,
              country: formData.country || 'Poland',
              isPrimary: true,
              isActive: true,
            }

            await apiCall('/api/fms_locations/unified', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(addressPayload),
            })
          }

          flash(
            mode === 'edit'
              ? t('contractors.form.edit.success', 'Contractor updated successfully')
              : t('contractors.form.create.success', 'Contractor created successfully'),
            'success'
          )

          queryClient.invalidateQueries({ queryKey: ['contractors'] })
          queryClient.invalidateQueries({ queryKey: ['contractor', newContractorId] })

          onSaved?.({ id: newContractorId })
          onOpenChange(false)
        } else {
          flash(response.result?.error || 'Failed to save contractor', 'error')
        }
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Failed to save contractor', 'error')
      } finally {
        setIsSubmitting(false)
      }
    },
    [formData, mode, contractorId, queryClient, onSaved, onOpenChange, t]
  )

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit(e as unknown as React.FormEvent)
      }
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    },
    [handleSubmit, onOpenChange]
  )

  // Handle Enter key in NIP input
  const handleNipKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        handleSearch()
      }
    },
    [handleSearch]
  )

  // Handle contractor updated in edit mode
  const handleContractorUpdated = useCallback(() => {
    refetch()
    queryClient.invalidateQueries({ queryKey: ['contractors'] })
  }, [refetch, queryClient])

  const title = useMemo(() => {
    if (mode === 'edit') {
      return contractor?.name ?? t('contractors.drawer.editTitle', 'Edit Contractor')
    }
    return t('contractors.drawer.createTitle', 'Create Contractor')
  }, [mode, contractor?.name, t])

  const description = useMemo(() => {
    if (mode === 'edit') {
      return contractor?.taxId
        ? `NIP: ${contractor.taxId}`
        : t('contractors.drawer.editDescription', 'Edit contractor details')
    }
    return t('contractors.drawer.createDescription', 'Add a new contractor or company')
  }, [mode, contractor, t])

  // Loading state for edit mode
  if (mode === 'edit' && isLoadingContractor) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="flex flex-col p-0"
          style={{ width: '600px', maxWidth: '600px' }}
          overlayClassName="backdrop-blur-none"
        >
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <Spinner className="h-6 w-6" />
            <span className="text-sm text-gray-500">
              {t('contractors.drawer.loading', 'Loading contractor...')}
            </span>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex flex-col p-0"
        style={{ width: mode === 'edit' ? '80rem' : '600px', maxWidth: mode === 'edit' ? '80rem' : '600px' }}
        overlayClassName="backdrop-blur-none"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <div className="bg-blue-500 rounded p-2">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <span>{title}</span>
              </div>
            </SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Data Source Toggle (create mode only) */}
            {mode === 'create' && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t('contractors.drawer.dataSource', 'Data Source')}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, dataSource: 'regon' }))}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                      formData.dataSource === 'regon'
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-input hover:bg-muted/50'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-md ${
                        formData.dataSource === 'regon' ? 'bg-primary/10' : 'bg-muted'
                      }`}
                    >
                      <Search className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-sm">
                        {t('contractors.drawer.regonLookup', 'NIP Lookup')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('contractors.drawer.regonDescription', 'Polish registry')}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, dataSource: 'manual' }))}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                      formData.dataSource === 'manual'
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-input hover:bg-muted/50'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-md ${
                        formData.dataSource === 'manual' ? 'bg-primary/10' : 'bg-muted'
                      }`}
                    >
                      <Edit3 className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-sm">
                        {t('contractors.drawer.manualEntry', 'Manual Entry')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('contractors.drawer.manualDescription', 'Enter details')}
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* NIP Lookup Section (create mode with regon source) */}
            {mode === 'create' && formData.dataSource === 'regon' && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {t('contractors.regonLookup.title', 'NIP Lookup')}
                  </Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        value={formData.nipInput}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, nipInput: e.target.value }))
                        }
                        onKeyDown={handleNipKeyDown}
                        placeholder={t('contractors.drawer.nipPlaceholder', 'e.g. 5261040828')}
                        disabled={isSearching}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleSearch}
                      disabled={isSearching || !formData.nipInput.trim()}
                      className="px-4"
                    >
                      {isSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      <span className="ml-2">{t('contractors.regonLookup.button', 'Search')}</span>
                    </Button>
                  </div>
                  {searchError && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                      {searchError}
                    </div>
                  )}
                  {formData.regonResult && (
                    <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 border border-green-200 flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      {t('contractors.drawer.dataLoaded', 'Company data loaded from REGON')}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Company Details Section (create mode only - edit is done inline in table) */}
            {mode === 'create' && (
              <>
                <Separator />
                <div className="space-y-4">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {t('contractors.drawer.companyDetails', 'Company Details')}
                  </Label>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">
                        {t('contractors.form.fields.name', 'Company Name')} *
                      </Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder={t('contractors.form.placeholders.name', 'Enter company name')}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shortName">{t('contractors.form.fields.shortName', 'Short Name')}</Label>
                      <Input
                        id="shortName"
                        value={formData.shortName}
                        onChange={(e) => setFormData((prev) => ({ ...prev, shortName: e.target.value }))}
                        placeholder={t('contractors.form.placeholders.shortName', 'Enter short name')}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="taxId">{t('contractors.form.fields.taxId', 'Tax ID (NIP)')}</Label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="taxId"
                          value={formData.taxId}
                          onChange={(e) => setFormData((prev) => ({ ...prev, taxId: e.target.value }))}
                          placeholder={t('contractors.form.placeholders.taxId', 'Enter tax ID')}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="regon">{t('contractors.form.fields.regon', 'REGON')}</Label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="regon"
                          value={formData.regon}
                          onChange={(e) => setFormData((prev) => ({ ...prev, regon: e.target.value }))}
                          placeholder={t('contractors.form.placeholders.regon', 'Enter REGON')}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Primary Address Section (create mode only) */}
            {mode === 'create' && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {t('contractors.drawer.primaryAddress', 'Primary Address')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="createAddress"
                        checked={formData.createAddress}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, createAddress: checked }))
                        }
                      />
                      <Label htmlFor="createAddress" className="text-sm cursor-pointer">
                        {t('contractors.drawer.createAddressFromData', 'Create address')}
                      </Label>
                    </div>
                  </div>

                  {formData.createAddress && (
                    <div className="space-y-4 pl-1 border-l-2 border-muted ml-1">
                      <div className="pl-4 space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="addressLine">
                            {t('contractors.addresses.fields.addressLine1', 'Address Line')}
                          </Label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="addressLine"
                              value={formData.addressLine}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, addressLine: e.target.value }))
                              }
                              placeholder="al. Niepodległości 208"
                              className="pl-9"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="city">{t('contractors.addresses.fields.city', 'City')}</Label>
                            <Input
                              id="city"
                              value={formData.city}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, city: e.target.value }))
                              }
                              placeholder="Warszawa"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="postalCode">
                              {t('contractors.addresses.fields.postalCode', 'Postal Code')}
                            </Label>
                            <Input
                              id="postalCode"
                              value={formData.postalCode}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, postalCode: e.target.value }))
                              }
                              placeholder="00-925"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="state">
                              {t('contractors.addresses.fields.state', 'State/Voivodeship')}
                            </Label>
                            <Input
                              id="state"
                              value={formData.state}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, state: e.target.value }))
                              }
                              placeholder="MAZOWIECKIE"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="country">
                              {t('contractors.addresses.fields.country', 'Country')}
                            </Label>
                            <Input
                              id="country"
                              value={formData.country}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, country: e.target.value }))
                              }
                              placeholder="Poland"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Active Status (create mode only - edit is done inline in table) */}
            {mode === 'create' && (
              <>
                <Separator />
                <div className="flex items-center gap-3">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: checked }))}
                  />
                  <Label htmlFor="isActive" className="cursor-pointer">
                    {t('contractors.form.fields.isActive', 'Active')}
                  </Label>
                </div>
              </>
            )}

            {/* Edit Mode: Additional Sections */}
            {mode === 'edit' && contractor && (
              <>
                <Separator className="my-6" />

                {/* Locations Section */}
                <ContractorLocationsTab
                  contractorId={contractor.id}
                  onUpdated={handleContractorUpdated}
                />

                {/* Contacts Section */}
                <ContractorContactsTab
                  contractorId={contractor.id}
                  contacts={contractor.contacts}
                  onUpdated={handleContractorUpdated}
                />

                {/* Payment Section */}
                <ContractorPaymentSection
                  contractorId={contractor.id}
                  taxId={contractor.taxId}
                  paymentTerms={contractor.paymentTerms}
                  creditLimit={contractor.creditLimit}
                  onUpdated={handleContractorUpdated}
                />
              </>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="flex-shrink-0 border-t bg-background p-6">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    {t('common.saving', 'Saving...')}
                  </>
                ) : mode === 'edit' ? (
                  t('contractors.drawer.saveChanges', 'Save Changes')
                ) : (
                  t('contractors.drawer.createContractor', 'Create Contractor')
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
