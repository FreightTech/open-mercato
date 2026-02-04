'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ContractorHighlights } from '../../../components/ContractorHighlights'
import { ContractorLocationsTab } from '../../../components/ContractorLocationsTab'
import { ContractorContactsTab } from '../../../components/ContractorContactsTab'
import { ContractorSopSection } from '../../../components/ContractorSopSection'
import { ContractorCreditLimitTable } from '../../../components/ContractorCreditLimitTable'
import { ContractorBankAccountTable } from '../../../components/ContractorBankAccountTable'
import { ContractorProjectsSection } from '../../../components/ContractorProjectsSection'
import { ContractorOffersSection } from '../../../components/ContractorOffersSection'
import { useRegonLookup } from '../../../hooks/useRegonLookup'

type ContractorContact = {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  isPrimary: boolean
  isActive: boolean
}

type ContractorBankAccount = {
  id: string
  bankName?: string | null
  iban?: string | null
  swiftBic?: string | null
  currencyCode: string
  isPrimary?: boolean
}

type ContractorCreditLimit = {
  id: string
  creditLimit: string
  currencyCode: string
  isUnlimited: boolean
  paymentDays?: number
  currentExposure?: string
  lastCalculatedAt?: string | null
  notes?: string | null
}

type ContractorDetail = {
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
  bankAccounts: ContractorBankAccount[]
  creditLimit?: ContractorCreditLimit | null
}

export default function ContractorDetailPage({
  params,
}: {
  params?: { id?: string }
}) {
  const contractorId = params?.id
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isDeleting, setIsDeleting] = React.useState(false)
  const { lookup: regonLookup } = useRegonLookup()

  // Fetch contractor data
  const {
    data: contractor,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['contractor', contractorId],
    queryFn: async () => {
      if (!contractorId) return null
      const response = await apiCall<ContractorDetail>(
        `/api/contractors/contractors/${contractorId}`
      )
      if (!response.ok) throw new Error('Failed to load contractor')
      return response.result
    },
    enabled: !!contractorId,
  })

  // Get primary contact info for highlights
  const primaryContact = React.useMemo(() => {
    if (!contractor?.contacts) return null
    return contractor.contacts.find((c) => c.isPrimary) || contractor.contacts[0] || null
  }, [contractor?.contacts])

  // Handle contractor update
  const handleContractorUpdate = React.useCallback(
    async (patch: Record<string, unknown>) => {
      if (!contractorId) return
      const response = await apiCall(`/api/contractors/contractors/${contractorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (response.ok) {
        flash(t('contractors.form.edit.success', 'Contractor updated successfully'), 'success')
        refetch()
        queryClient.invalidateQueries({ queryKey: ['contractors'] })
      } else {
        const errorMsg =
          (response.result as { error?: string })?.error ||
          t('contractors.form.edit.error', 'Failed to update contractor')
        flash(errorMsg, 'error')
        throw new Error(errorMsg)
      }
    },
    [contractorId, refetch, queryClient, t]
  )

  // Handler functions for ContractorHighlights
  const handleNameSave = React.useCallback(
    async (value: string | null) => {
      if (!value) return // Name is required
      await handleContractorUpdate({ name: value })
    },
    [handleContractorUpdate]
  )

  const handleShortNameSave = React.useCallback(
    async (value: string | null) => {
      await handleContractorUpdate({ shortName: value })
    },
    [handleContractorUpdate]
  )

  const handleTaxIdSave = React.useCallback(
    async (value: string | null) => {
      // Build update payload starting with taxId
      const updatePayload: Record<string, unknown> = { taxId: value }

      // If NIP is provided, try to fetch REGON data
      if (value) {
        const cleanNip = value.replace(/[^0-9]/g, '')
        if (cleanNip.length === 10) {
          try {
            const result = await regonLookup({ nip: cleanNip })
            console.log('[REGON Lookup] NIP:', cleanNip, 'Result:', result)
            if (result.company) {
              console.log('[REGON Lookup] Company data:', result.company)
              // Add REGON data to update payload
              updatePayload.officialName = result.company.name
              updatePayload.regon = result.company.regon
              updatePayload.krs = result.company.krs
              updatePayload.registrationDate = result.company.registrationDate
              updatePayload.pkdMainCode = result.company.pkdMainCode
              updatePayload.pkdMainDescription = result.company.pkdMainDescription
              console.log('[REGON Lookup] Update payload:', updatePayload)
            }
          } catch (err) {
            console.error('[REGON Lookup] Error:', err)
            // REGON lookup failed, continue with just taxId update
          }
        }
      }

      await handleContractorUpdate(updatePayload)
    },
    [handleContractorUpdate, regonLookup]
  )

  const handleRegonSave = React.useCallback(
    async (value: string | null) => {
      await handleContractorUpdate({ regon: value })
    },
    [handleContractorUpdate]
  )

  const handleActiveToggle = React.useCallback(async () => {
    if (!contractor) return
    await handleContractorUpdate({ isActive: !contractor.isActive })
  }, [contractor, handleContractorUpdate])

  const handleDelete = React.useCallback(async () => {
    if (!contractorId) return
    const confirmed = window.confirm(
      t('contractors.locations.confirmDelete', 'Are you sure you want to delete this contractor?')
    )
    if (!confirmed) return

    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/contractors/contractors/${contractorId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash(t('contractors.list.actions.deleted', 'Contractor deleted'), 'success')
        queryClient.invalidateQueries({ queryKey: ['contractors'] })
        router.push('/backend/contractors')
      } else {
        const errorMsg =
          (response.result as { error?: string })?.error || 'Delete failed'
        flash(errorMsg, 'error')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [contractorId, queryClient, router, t])

  // Handle data refresh from child components
  const handleContractorUpdated = React.useCallback(() => {
    refetch()
    queryClient.invalidateQueries({ queryKey: ['contractors'] })
  }, [refetch, queryClient])

  // Loading state
  if (isLoading) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-[50vh] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="h-6 w-6" />
            <span>{t('contractors.drawer.loading', 'Loading contractor...')}</span>
          </div>
        </PageBody>
      </Page>
    )
  }

  // Error state
  if (error || !contractor) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
            <Building2 className="h-12 w-12 opacity-50" />
            <p>{t('contractors.drawer.notFound', 'Contractor not found')}</p>
            <Button variant="outline" onClick={() => router.push('/backend/contractors')}>
              {t('contractors.detail.actions.backToList', 'Back to Contractors')}
            </Button>
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div className="space-y-6 max-w-6xl mx-auto">
          {/* Header highlights */}
          <ContractorHighlights
            contractor={{
              id: contractor.id,
              name: contractor.name,
              shortName: contractor.shortName,
              officialName: contractor.officialName,
              taxId: contractor.taxId,
              regon: contractor.regon,
              krs: contractor.krs,
              registrationDate: contractor.registrationDate,
              pkdMainCode: contractor.pkdMainCode,
              pkdMainDescription: contractor.pkdMainDescription,
              isActive: contractor.isActive,
              primaryContactEmail: primaryContact?.email,
              primaryContactPhone: primaryContact?.phone,
            }}
            onNameSave={handleNameSave}
            onShortNameSave={handleShortNameSave}
            onTaxIdSave={handleTaxIdSave}
            onRegonSave={handleRegonSave}
            onActiveToggle={handleActiveToggle}
            onDelete={handleDelete}
            isDeleting={isDeleting}
          />

          {/* Tables */}
          <ContractorLocationsTab
            contractorId={contractor.id}
            onUpdated={handleContractorUpdated}
          />

          <ContractorContactsTab
            contractorId={contractor.id}
            contacts={contractor.contacts}
            onUpdated={handleContractorUpdated}
          />

          {/* SOP Section */}
          <ContractorSopSection contractorId={contractor.id} />

          {/* Credit Limit Section - Full Width */}
          <ContractorCreditLimitTable
            contractorId={contractor.id}
            creditLimit={contractor.creditLimit}
            onUpdated={handleContractorUpdated}
          />

          {/* Bank Accounts Section - Full Width */}
          <ContractorBankAccountTable
            contractorId={contractor.id}
            bankAccounts={contractor.bankAccounts}
            onUpdated={handleContractorUpdated}
          />

          {/* Projects Section */}
          <ContractorProjectsSection contractorId={contractor.id} />

          {/* Offers Section */}
          <ContractorOffersSection contractorId={contractor.id} />
        </div>
      </PageBody>
    </Page>
  )
}
