'use client'

import * as React from 'react'
import { useState, useMemo, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Phone,
  Mail,
  Trash2,
  ArrowLeft,
  MapPin,
} from 'lucide-react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
  ColumnDef,
  KeyboardShortcutsConfig,
} from '@open-mercato/ui/backend/dynamic-table'

interface ContractorContact {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  isPrimary: boolean
  isActive: boolean
}

interface ContractorAddress {
  id: string
  purpose: string
  addressLine?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  isPrimary: boolean
  isActive: boolean
}

interface ContractorDetail {
  id: string
  name: string
  shortName?: string | null
  officialName?: string | null
  taxId?: string | null
  regon?: string | null
  krs?: string | null
  registrationDate?: string | null
  pkdMainCode?: string | null
  pkdMainDescription?: string | null
  isActive: boolean
  contacts: ContractorContact[]
  addresses: ContractorAddress[]
  rfqsCount: number
  offersCount: number
  createdAt: string
  updatedAt: string
}

interface RfqItem {
  id: string
  name: string
  salesStage: string
  amount?: string | null
  currencyCode: string
  originAirportCode?: string | null
  destinationAirportCode?: string | null
  shipmentReadyDate?: string | null
  assignedToName?: string | null
  createdAt: string
}

interface OfferItem {
  id: string
  name: string
  rfqName?: string | null
  status: string
  totalRate?: string | null
  currencyCode: string
  departureDate?: string | null
  awbNumber?: string | null
  createdAt: string
}

// Badge renderer for status columns
const badgeRenderer = (value: string) => {
  if (!value) return '-'
  return (
    <Badge variant="outline" className="font-normal">
      {value}
    </Badge>
  )
}

// Checkbox renderer for boolean columns
const checkboxRenderer = (value: boolean) => {
  return (
    <div className="flex items-center justify-center">
      <input type="checkbox" checked={value} readOnly className="pointer-events-none" />
    </div>
  )
}

export default function FrcContractorDetailPage({
  params: propsParams,
}: {
  params?: { id?: string }
}) {
  const router = useRouter()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const queryClient = useQueryClient()
  const [isDeleting, setIsDeleting] = useState(false)

  // Contact delete state
  const [deleteContactDialogOpen, setDeleteContactDialogOpen] = useState(false)
  const [contactToDelete, setContactToDelete] = useState<string | null>(null)
  const [isDeletingContact, setIsDeletingContact] = useState(false)

  // Address delete state
  const [deleteAddressDialogOpen, setDeleteAddressDialogOpen] = useState(false)
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null)
  const [isDeletingAddress, setIsDeletingAddress] = useState(false)

  // Table refs
  const detailsTableRef = useRef<HTMLDivElement>(null)
  const contactsTableRef = useRef<HTMLDivElement>(null)
  const addressesTableRef = useRef<HTMLDivElement>(null)
  const rfqsTableRef = useRef<HTMLDivElement>(null)
  const offersTableRef = useRef<HTMLDivElement>(null)

  // Get contractorId from props (passed by catch-all route) or fallback to useParams
  const contractorId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  // Fetch contractor data
  const {
    data: contractor,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['frc_contractor', contractorId],
    queryFn: async () => {
      if (!contractorId) return null
      const response = await apiCall<ContractorDetail>(
        `/api/frc_contractors/contractors/${contractorId}`
      )
      if (!response.ok) throw new Error('Failed to load contractor')
      return response.result
    },
    enabled: !!contractorId,
  })

  // Fetch RFQs
  const { data: rfqsData } = useQuery({
    queryKey: ['frc_contractor_rfqs', contractorId],
    queryFn: async () => {
      if (!contractorId) return null
      const response = await apiCall<{ items: RfqItem[]; total: number }>(
        `/api/frc_contractors/contractors/${contractorId}/rfqs?limit=50`
      )
      if (!response.ok) return { items: [], total: 0 }
      return response.result
    },
    enabled: !!contractorId,
  })

  // Fetch Offers
  const { data: offersData } = useQuery({
    queryKey: ['frc_contractor_offers', contractorId],
    queryFn: async () => {
      if (!contractorId) return null
      const response = await apiCall<{ items: OfferItem[]; total: number }>(
        `/api/frc_contractors/contractors/${contractorId}/offers?limit=50`
      )
      if (!response.ok) return { items: [], total: 0 }
      return response.result
    },
    enabled: !!contractorId,
  })

  // Get primary contact
  const primaryContact = useMemo(() => {
    if (!contractor?.contacts) return null
    return contractor.contacts.find((c) => c.isPrimary) || contractor.contacts[0] || null
  }, [contractor?.contacts])

  // Get primary address
  const primaryAddress = useMemo(() => {
    if (!contractor?.addresses) return null
    return contractor.addresses.find((a) => a.isPrimary) || contractor.addresses[0] || null
  }, [contractor?.addresses])

  // ============================================
  // Column Definitions
  // ============================================

  // Contractor Details columns (single editable row)
  const detailsColumns = useMemo(
    (): ColumnDef[] => [
      { data: 'name', title: 'Name', width: 180, type: 'text' },
      { data: 'shortName', title: 'Short Name', width: 140, type: 'text' },
      { data: 'officialName', title: 'Official Name', width: 180, type: 'text' },
      { data: 'taxId', title: 'Tax ID (NIP)', width: 120, type: 'text' },
      { data: 'regon', title: 'REGON', width: 100, type: 'text' },
      { data: 'krs', title: 'KRS', width: 100, type: 'text' },
    ],
    []
  )

  // Contacts columns (editable with CRUD)
  const contactsColumns = useMemo(
    (): ColumnDef[] => [
      { data: 'firstName', title: 'First Name', width: 120, type: 'text' },
      { data: 'lastName', title: 'Last Name', width: 120, type: 'text' },
      { data: 'email', title: 'Email', width: 180, type: 'text' },
      { data: 'phone', title: 'Phone', width: 120, type: 'text' },
      { data: 'isPrimary', title: 'Primary', width: 70, type: 'boolean', renderer: checkboxRenderer },
      { data: 'isActive', title: 'Active', width: 70, type: 'boolean', renderer: checkboxRenderer },
    ],
    []
  )

  // Addresses columns (editable with CRUD)
  const addressesColumns = useMemo(
    (): ColumnDef[] => [
      { data: 'purpose', title: 'Purpose', width: 100, type: 'text' },
      { data: 'addressLine', title: 'Address', width: 200, type: 'text' },
      { data: 'city', title: 'City', width: 120, type: 'text' },
      { data: 'postalCode', title: 'Postal Code', width: 100, type: 'text' },
      { data: 'country', title: 'Country', width: 100, type: 'text' },
      { data: 'isPrimary', title: 'Primary', width: 70, type: 'boolean', renderer: checkboxRenderer },
      { data: 'isActive', title: 'Active', width: 70, type: 'boolean', renderer: checkboxRenderer },
    ],
    []
  )

  // RFQs columns (read-only)
  const rfqsColumns = useMemo(
    (): ColumnDef[] => [
      { data: 'name', title: 'Name', width: 180, type: 'text', readOnly: true },
      { data: 'salesStage', title: 'Stage', width: 100, type: 'text', readOnly: true, renderer: badgeRenderer },
      { data: 'route', title: 'Route', width: 120, type: 'text', readOnly: true },
      { data: 'amountFormatted', title: 'Amount', width: 120, type: 'text', readOnly: true },
      { data: 'assignedToName', title: 'Assigned To', width: 120, type: 'text', readOnly: true },
      { data: 'createdAtFormatted', title: 'Created', width: 100, type: 'text', readOnly: true },
    ],
    []
  )

  // Offers columns (read-only)
  const offersColumns = useMemo(
    (): ColumnDef[] => [
      { data: 'name', title: 'Name', width: 180, type: 'text', readOnly: true },
      { data: 'status', title: 'Status', width: 100, type: 'text', readOnly: true, renderer: badgeRenderer },
      { data: 'rfqName', title: 'RFQ', width: 140, type: 'text', readOnly: true },
      { data: 'totalRateFormatted', title: 'Total Rate', width: 120, type: 'text', readOnly: true },
      { data: 'awbNumber', title: 'AWB', width: 120, type: 'text', readOnly: true },
      { data: 'departureDateFormatted', title: 'Departure', width: 100, type: 'text', readOnly: true },
    ],
    []
  )

  // ============================================
  // Table Data
  // ============================================

  // Contractor Details data (single row)
  const detailsData = useMemo(() => {
    if (!contractor) return []
    return [
      {
        id: contractor.id,
        name: contractor.name || '',
        shortName: contractor.shortName || '',
        officialName: contractor.officialName || '',
        taxId: contractor.taxId || '',
        regon: contractor.regon || '',
        krs: contractor.krs || '',
      },
    ]
  }, [contractor])

  // Contacts data
  const contactsData = useMemo(() => {
    if (!contractor?.contacts) return []
    return contractor.contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      email: c.email || '',
      phone: c.phone || '',
      isPrimary: c.isPrimary,
      isActive: c.isActive,
    }))
  }, [contractor?.contacts])

  // Addresses data
  const addressesData = useMemo(() => {
    if (!contractor?.addresses) return []
    return contractor.addresses.map((a) => ({
      id: a.id,
      purpose: a.purpose || '',
      addressLine: a.addressLine || '',
      city: a.city || '',
      postalCode: a.postalCode || '',
      country: a.country || '',
      isPrimary: a.isPrimary,
      isActive: a.isActive,
    }))
  }, [contractor?.addresses])

  // RFQs data with formatted fields
  const rfqsTableData = useMemo(() => {
    if (!rfqsData?.items) return []
    return rfqsData.items.map((rfq) => ({
      id: rfq.id,
      name: rfq.name,
      salesStage: rfq.salesStage,
      route:
        rfq.originAirportCode && rfq.destinationAirportCode
          ? `${rfq.originAirportCode} → ${rfq.destinationAirportCode}`
          : '-',
      amountFormatted: rfq.amount ? `${rfq.amount} ${rfq.currencyCode}` : '-',
      assignedToName: rfq.assignedToName || '-',
      createdAtFormatted: new Date(rfq.createdAt).toLocaleDateString(),
    }))
  }, [rfqsData?.items])

  // Offers data with formatted fields
  const offersTableData = useMemo(() => {
    if (!offersData?.items) return []
    return offersData.items.map((offer) => ({
      id: offer.id,
      name: offer.name,
      status: offer.status,
      rfqName: offer.rfqName || '-',
      totalRateFormatted: offer.totalRate ? `${offer.totalRate} ${offer.currencyCode}` : '-',
      awbNumber: offer.awbNumber || '-',
      departureDateFormatted: offer.departureDate
        ? new Date(offer.departureDate).toLocaleDateString()
        : '-',
    }))
  }, [offersData?.items])

  // ============================================
  // Event Handlers
  // ============================================

  // Contractor details save handler
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(detailsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const updateData: Record<string, unknown> = {
            [payload.prop]: payload.newValue === '' ? null : payload.newValue,
          }

          const response = await apiCall(`/api/frc_contractors/contractors/${contractorId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
          })

          if (response.ok) {
            dispatch(detailsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            flash('Contractor updated', 'success')
            refetch()
            queryClient.invalidateQueries({ queryKey: ['frc_contractors'] })
          } else {
            throw new Error('Update failed')
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Update failed'
          dispatch(detailsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
          flash(errorMessage, 'error')
        }
      },
    },
    detailsTableRef as React.RefObject<HTMLElement>
  )

  // Contacts table event handlers (using fms API)
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(contactsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const contactId = payload.id as string
          const updateData: Record<string, unknown> = {
            id: contactId,
            [payload.prop]: payload.newValue === '' ? null : payload.newValue,
          }

          const response = await apiCall('/api/contractors/contacts', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
          })

          if (response.ok) {
            dispatch(contactsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            refetch()
          } else {
            throw new Error('Update failed')
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Update failed'
          dispatch(contactsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
          flash(errorMessage, 'error')
        }
      },

      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        try {
          const { _isNew, id, ...rowData } = payload.rowData as Record<string, unknown>

          const response = await apiCall('/api/contractors/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contractorId,
              firstName: rowData.firstName || null,
              lastName: rowData.lastName || null,
              email: rowData.email || null,
              phone: rowData.phone || null,
              isPrimary: rowData.isPrimary ?? false,
              isActive: rowData.isActive ?? true,
            }),
          })

          const result = response.result as { id?: string } | undefined
          if (response.ok && result?.id) {
            dispatch(contactsTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              savedRowData: { ...rowData, id: result.id },
            } as NewRowSaveSuccessEvent)
            flash('Contact added', 'success')
            refetch()
          } else {
            dispatch(contactsTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              error: 'Failed to create contact',
            } as NewRowSaveErrorEvent)
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to create contact'
          dispatch(contactsTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: errorMessage,
          } as NewRowSaveErrorEvent)
          flash(errorMessage, 'error')
        }
      },
    },
    contactsTableRef as React.RefObject<HTMLElement>
  )

  // Addresses table event handlers (using fms API)
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(addressesTableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const addressId = payload.id as string
          const updateData: Record<string, unknown> = {
            id: addressId,
            [payload.prop]: payload.newValue === '' ? null : payload.newValue,
          }

          const response = await apiCall('/api/contractors/addresses', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
          })

          if (response.ok) {
            dispatch(addressesTableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            refetch()
          } else {
            throw new Error('Update failed')
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Update failed'
          dispatch(addressesTableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
          flash(errorMessage, 'error')
        }
      },

      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        try {
          const { _isNew, id, ...rowData } = payload.rowData as Record<string, unknown>

          const response = await apiCall('/api/contractors/addresses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contractorId,
              purpose: rowData.purpose || 'general',
              addressLine: rowData.addressLine || null,
              city: rowData.city || null,
              postalCode: rowData.postalCode || null,
              country: rowData.country || null,
              isPrimary: rowData.isPrimary ?? false,
              isActive: rowData.isActive ?? true,
            }),
          })

          const result = response.result as { id?: string } | undefined
          if (response.ok && result?.id) {
            dispatch(addressesTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              savedRowData: { ...rowData, id: result.id },
            } as NewRowSaveSuccessEvent)
            flash('Address added', 'success')
            refetch()
          } else {
            dispatch(addressesTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              error: 'Failed to create address',
            } as NewRowSaveErrorEvent)
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to create address'
          dispatch(addressesTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: errorMessage,
          } as NewRowSaveErrorEvent)
          flash(errorMessage, 'error')
        }
      },
    },
    addressesTableRef as React.RefObject<HTMLElement>
  )

  // Contact delete handlers
  const handleContactDelete = useCallback((contactId: string) => {
    setContactToDelete(contactId)
    setDeleteContactDialogOpen(true)
  }, [])

  const handleConfirmDeleteContact = useCallback(async () => {
    if (!contactToDelete) return

    setIsDeletingContact(true)
    try {
      const response = await apiCall(`/api/contractors/contacts?id=${contactToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Contact deleted', 'success')
        refetch()
      } else {
        const errorMsg = (response.result as { error?: string })?.error || 'Delete failed'
        flash(errorMsg, 'error')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Delete failed'
      flash(errorMessage, 'error')
    } finally {
      setIsDeletingContact(false)
      setDeleteContactDialogOpen(false)
      setContactToDelete(null)
    }
  }, [contactToDelete, refetch])

  // Address delete handlers
  const handleAddressDelete = useCallback((addressId: string) => {
    setAddressToDelete(addressId)
    setDeleteAddressDialogOpen(true)
  }, [])

  const handleConfirmDeleteAddress = useCallback(async () => {
    if (!addressToDelete) return

    setIsDeletingAddress(true)
    try {
      const response = await apiCall(`/api/contractors/addresses?id=${addressToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Address deleted', 'success')
        refetch()
      } else {
        const errorMsg = (response.result as { error?: string })?.error || 'Delete failed'
        flash(errorMsg, 'error')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Delete failed'
      flash(errorMessage, 'error')
    } finally {
      setIsDeletingAddress(false)
      setDeleteAddressDialogOpen(false)
      setAddressToDelete(null)
    }
  }, [addressToDelete, refetch])

  // Contact row actions
  const contactsRowActions = useCallback(
    (rowData: Record<string, unknown>, rowIndex: number) => [
      {
        id: 'delete',
        label: 'Delete',
        icon: 'trash',
      },
    ],
    []
  )

  // Contact row action handler
  const handleContactRowAction = useCallback(
    (actionId: string, rowData: Record<string, unknown>) => {
      if (actionId === 'delete') {
        handleContactDelete(rowData.id as string)
      }
    },
    [handleContactDelete]
  )

  // Address row actions
  const addressesRowActions = useCallback(
    (rowData: Record<string, unknown>, rowIndex: number) => [
      {
        id: 'delete',
        label: 'Delete',
        icon: 'trash',
      },
    ],
    []
  )

  // Address row action handler
  const handleAddressRowAction = useCallback(
    (actionId: string, rowData: Record<string, unknown>) => {
      if (actionId === 'delete') {
        handleAddressDelete(rowData.id as string)
      }
    },
    [handleAddressDelete]
  )

  // RFQs keyboard shortcuts and row action
  const rfqsKeyboardShortcuts = useMemo(
    (): KeyboardShortcutsConfig => ({
      rowActions: [{ id: 'view', label: 'Open RFQ', key: 'Enter', shift: true }],
    }),
    []
  )

  const handleRfqRowAction = useCallback(
    (actionId: string, rowData: Record<string, unknown>) => {
      if (actionId === 'view') {
        router.push(`/backend/frc-rfqs?id=${rowData.id}`)
      }
    },
    [router]
  )

  const handleRfqRowClick = useCallback(
    (rowIndex: number, rowData: Record<string, unknown>) => {
      router.push(`/backend/frc-rfqs?id=${rowData.id}`)
    },
    [router]
  )

  // Offers keyboard shortcuts and row action
  const offersKeyboardShortcuts = useMemo(
    (): KeyboardShortcutsConfig => ({
      rowActions: [{ id: 'view', label: 'Open Offer', key: 'Enter', shift: true }],
    }),
    []
  )

  const handleOfferRowAction = useCallback(
    (actionId: string, rowData: Record<string, unknown>) => {
      if (actionId === 'view') {
        router.push(`/backend/frc-offers?id=${rowData.id}`)
      }
    },
    [router]
  )

  const handleOfferRowClick = useCallback(
    (rowIndex: number, rowData: Record<string, unknown>) => {
      router.push(`/backend/frc-offers?id=${rowData.id}`)
    },
    [router]
  )

  // ============================================
  // Header Actions
  // ============================================

  const handleActiveToggle = useCallback(async () => {
    if (!contractor || !contractorId) return
    try {
      const response = await apiCall(`/api/frc_contractors/contractors/${contractorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !contractor.isActive }),
      })
      if (response.ok) {
        flash('Contractor updated', 'success')
        refetch()
        queryClient.invalidateQueries({ queryKey: ['frc_contractors'] })
      } else {
        const errorMsg = (response.result as { error?: string })?.error || 'Failed to update'
        flash(errorMsg, 'error')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      flash(errorMessage, 'error')
    }
  }, [contractor, contractorId, refetch, queryClient])

  const handleDelete = useCallback(async () => {
    if (!contractorId) return
    const confirmed = window.confirm('Are you sure you want to delete this contractor?')
    if (!confirmed) return

    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_contractors/contractors/${contractorId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash('Contractor deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['frc_contractors'] })
        router.push('/backend/frc-contractors')
      } else {
        const errorMsg = (response.result as { error?: string })?.error || 'Delete failed'
        flash(errorMsg, 'error')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [contractorId, queryClient, router])

  // ============================================
  // Render
  // ============================================

  // Loading state
  if (!contractorId || isLoading) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-[50vh] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="h-6 w-6" />
            <span>Loading contractor...</span>
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
            <p>Contractor not found</p>
            <Button variant="outline" onClick={() => router.push('/backend/frc-contractors')}>
              Back to Contractors
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
          {/* Back button */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/backend/frc-contractors')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>

          {/* Header Card */}
          <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold">{contractor.name}</h1>
                    <Badge variant={contractor.isActive ? 'default' : 'secondary'}>
                      {contractor.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {contractor.shortName && (
                    <p className="text-gray-500">{contractor.shortName}</p>
                  )}
                  {primaryContact && (
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                      {primaryContact.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          <span>{primaryContact.email}</span>
                        </div>
                      )}
                      {primaryContact.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          <span>{primaryContact.phone}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {primaryAddress && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <MapPin className="w-4 h-4" />
                      <span>
                        {[primaryAddress.addressLine, primaryAddress.city, primaryAddress.postalCode, primaryAddress.country]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleActiveToggle}>
                  {contractor.isActive ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? <Spinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Contractor Details Table */}
          <DynamicTable
            tableRef={detailsTableRef}
            tableName="Details"
            data={detailsData}
            columns={detailsColumns}
            stretchColumns={true}
            emptyMessage="No contractor data"
            uiConfig={{
              hideAddRowButton: true,
              hideActionsColumn: true,
              hideFilterButton: true,
              hideFilterPopover: true,
              hideSearch: true,
              hideBottomBar: true,
            }}
          />

          {/* Contacts Table */}
          <DynamicTable
            tableRef={contactsTableRef}
            tableName={`Contacts (${contractor.contacts.length})`}
            data={contactsData}
            columns={contactsColumns}
            stretchColumns={true}
            rowActions={contactsRowActions}
            onRowAction={handleContactRowAction}
            emptyMessage="No contacts"
            uiConfig={{
              hideFilterButton: true,
              hideFilterPopover: true,
              hideSearch: true,
              hideBottomBar: true,
            }}
          />

          {/* Addresses Table */}
          <DynamicTable
            tableRef={addressesTableRef}
            tableName={`Addresses (${contractor.addresses.length})`}
            data={addressesData}
            columns={addressesColumns}
            stretchColumns={true}
            rowActions={addressesRowActions}
            onRowAction={handleAddressRowAction}
            emptyMessage="No addresses"
            uiConfig={{
              hideFilterButton: true,
              hideFilterPopover: true,
              hideSearch: true,
              hideBottomBar: true,
            }}
          />

          {/* RFQs Table */}
          <DynamicTable
            tableRef={rfqsTableRef}
            tableName={`RFQs (${rfqsData?.total ?? 0})`}
            data={rfqsTableData}
            columns={rfqsColumns}
            stretchColumns={true}
            keyboardShortcuts={rfqsKeyboardShortcuts}
            onRowAction={handleRfqRowAction}
            onRowClick={handleRfqRowClick}
            emptyMessage="No RFQs found for this contractor"
            uiConfig={{
              hideAddRowButton: true,
              hideActionsColumn: true,
              hideFilterButton: true,
              hideFilterPopover: true,
              hideSearch: true,
              hideBottomBar: true,
              rowHoverStyle: 'default',
            }}
          />

          {/* Offers Table */}
          <DynamicTable
            tableRef={offersTableRef}
            tableName={`Offers (${offersData?.total ?? 0})`}
            data={offersTableData}
            columns={offersColumns}
            stretchColumns={true}
            keyboardShortcuts={offersKeyboardShortcuts}
            onRowAction={handleOfferRowAction}
            onRowClick={handleOfferRowClick}
            emptyMessage="No offers found for this contractor"
            uiConfig={{
              hideAddRowButton: true,
              hideActionsColumn: true,
              hideFilterButton: true,
              hideFilterPopover: true,
              hideSearch: true,
              hideBottomBar: true,
              rowHoverStyle: 'default',
            }}
          />
        </div>

        {/* Delete Contact Confirmation Dialog */}
        <Dialog open={deleteContactDialogOpen} onOpenChange={setDeleteContactDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Contact</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this contact? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteContactDialogOpen(false)}
                disabled={isDeletingContact}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDeleteContact}
                disabled={isDeletingContact}
              >
                {isDeletingContact ? <Spinner className="w-4 h-4 mr-2" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Address Confirmation Dialog */}
        <Dialog open={deleteAddressDialogOpen} onOpenChange={setDeleteAddressDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Address</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this address? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteAddressDialogOpen(false)}
                disabled={isDeletingAddress}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDeleteAddress}
                disabled={isDeletingAddress}
              >
                {isDeletingAddress ? <Spinner className="w-4 h-4 mr-2" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
