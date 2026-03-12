'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Trash2, Search } from 'lucide-react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { loadInitialContractors } from '../../../lib/initialSuggestions'

export interface ClientContact {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  isActive: boolean
}

export interface ClientAddress {
  id: string
  purpose: string
  addressLine: string | null
  city: string | null
  postalCode: string | null
  country: string | null
  isPrimary: boolean
  isActive: boolean
}

export interface ClientData {
  id: string
  name: string
  shortName: string | null
  taxId: string | null
  contacts: ClientContact[]
  addresses: ClientAddress[]
}

interface OfferClientSectionProps {
  offerId: string
  carrierId: string | null
  onClientChange: (carrierId: string | null) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

function getPrimaryContact(contacts: ClientContact[]): ClientContact | null {
  const active = contacts.filter((c) => c.isActive)
  return active.find((c) => c.isPrimary) ?? active[0] ?? null
}

function getPrimaryAddress(addresses: ClientAddress[]): ClientAddress | null {
  const active = addresses.filter((a) => a.isActive)
  return active.find((a) => a.isPrimary) ?? active.find((a) => a.purpose === 'office') ?? active[0] ?? null
}

function formatContactName(contact: ClientContact | null): string | null {
  if (!contact) return null
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null
}

function formatAddress(address: ClientAddress | null): string | null {
  if (!address) return null
  return [address.city, address.country].filter(Boolean).join(', ') || null
}

export function OfferClientSection({
  offerId,
  carrierId,
  onClientChange,
  tableRef: externalTableRef,
  siblingTableRefs,
}: OfferClientSectionProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Fetch client details when carrierId exists
  const { data: client, isLoading } = useQuery({
    queryKey: ['frc_contractor', carrierId],
    queryFn: async () => {
      if (!carrierId) return null
      const call = await apiCall<ClientData>(`/api/frc_contractors/contractors/${carrierId}`)
      if (!call.ok) return null
      return call.result ?? null
    },
    enabled: !!carrierId,
  })

  // Entity search editor config for contractors
  const contractorEditorConfig = useMemo(
    () => ({
      entityType: 'contractors:contractor',
      extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
        JSON.stringify({
          id: r.recordId,
          name: r.presenter?.title || '',
        }),
      formatOption: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) => ({
        primary: r.presenter?.title || `Client ${r.recordId.slice(0, 8)}...`,
        secondary: r.presenter?.subtitle,
      }),
      placeholder: t('frc_offers.detail.client.searchPlaceholder', 'Search customers...'),
      minQueryLength: 1,
      noResultsText: t('frc_offers.detail.client.noResults', 'No customers found'),
      initialSuggestions: {
        loadItems: loadInitialContractors,
        limit: 4,
      },
    }),
    [t]
  )

  // Compute primary contact and address
  const primaryContact = useMemo(() => {
    if (!client?.contacts) return null
    return getPrimaryContact(client.contacts)
  }, [client])

  const primaryAddress = useMemo(() => {
    if (!client?.addresses) return null
    return getPrimaryAddress(client.addresses)
  }, [client])

  // Build table data - always show exactly one row
  const tableData = useMemo(() => {
    if (carrierId && client) {
      return [
        {
          id: carrierId,
          customerName: client.name,
          shortName: client.shortName,
          taxId: client.taxId,
          contactName: formatContactName(primaryContact),
          contactEmail: primaryContact?.email ?? null,
          contactPhone: primaryContact?.phone ?? null,
          address: formatAddress(primaryAddress),
          hasClient: true,
        },
      ]
    }
    // Empty row for search
    return [
      {
        id: 'empty-row',
        customerName: '',
        shortName: null,
        taxId: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        address: null,
        hasClient: false,
      },
    ]
  }, [carrierId, client, primaryContact, primaryAddress])

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'customerName',
        title: t('frc_offers.detail.client.columns.name', 'Customer Name'),
        width: 200,
        type: 'text',
        editor: createEntitySearchEditor(contractorEditorConfig),
        renderer: (value: unknown, row: Record<string, unknown>) => {
          const hasClient = row.hasClient as boolean
          const clientId = row.id as string

          if (!hasClient || !value) {
            return (
              <span className="text-muted-foreground italic flex items-center gap-1">
                <Search className="h-3 w-3" />
                {t('frc_offers.detail.client.clickToSearch', 'Click to search...')}
              </span>
            )
          }

          // If value is a JSON string (from entity search), parse to get name
          let displayName = value as string
          if (typeof value === 'string' && value.startsWith('{')) {
            try {
              const parsed = JSON.parse(value)
              displayName = parsed.name || value
            } catch {
              // Keep as is
            }
          }

          return (
            <Link
              href={`/backend/frc-contractors/${clientId}`}
              className="text-primary hover:underline font-medium"
            >
              {displayName}
            </Link>
          )
        },
      },
      {
        data: 'shortName',
        title: t('frc_offers.detail.client.columns.shortName', 'Short Name'),
        width: 120,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          if (!value) return <span className="text-muted-foreground">-</span>
          return value as string
        },
      },
      {
        data: 'taxId',
        title: t('frc_offers.detail.client.columns.taxId', 'Tax ID'),
        width: 120,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          if (!value) return <span className="text-muted-foreground">-</span>
          return <span className="font-mono text-sm">{value as string}</span>
        },
      },
      {
        data: 'contactName',
        title: t('frc_offers.detail.client.columns.contact', 'Contact'),
        width: 150,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          if (!value) return <span className="text-muted-foreground">-</span>
          return value as string
        },
      },
      {
        data: 'contactEmail',
        title: t('frc_offers.detail.client.columns.email', 'Email'),
        width: 180,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          if (!value) return <span className="text-muted-foreground">-</span>
          return <span className="text-sm">{value as string}</span>
        },
      },
      {
        data: 'contactPhone',
        title: t('frc_offers.detail.client.columns.phone', 'Phone'),
        width: 120,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          if (!value) return <span className="text-muted-foreground">-</span>
          return <span className="text-sm">{value as string}</span>
        },
      },
      {
        data: 'address',
        title: t('frc_offers.detail.client.columns.address', 'Address'),
        width: 150,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          if (!value) return <span className="text-muted-foreground">-</span>
          return value as string
        },
      },
    ],
    [t, contractorEditorConfig]
  )

  const handleCellSave = useCallback(
    async (
      _rowId: string,
      field: string,
      value: unknown,
      rowIndex: number,
      colIndex: number
    ) => {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
        rowIndex,
        colIndex,
      } as CellSaveStartEvent)

      try {
        if (field === 'customerName') {
          // User selected from search
          let parsedValue: { id?: string; name?: string } = {}
          try {
            parsedValue = JSON.parse(String(value))
          } catch {
            // Not JSON - ignore, user must select from search
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex,
              colIndex,
            } as CellSaveSuccessEvent)
            return
          }

          if (parsedValue.id) {
            // User selected a client
            await onClientChange(parsedValue.id)
            flash(t('frc_offers.detail.client.assigned', 'Client assigned'), 'success')
          }
        }

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
          rowIndex,
          colIndex,
        } as CellSaveSuccessEvent)
      } catch (error) {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
          rowIndex,
          colIndex,
          error: error instanceof Error ? error.message : 'Failed to save',
        } as CellSaveErrorEvent)
        flash(error instanceof Error ? error.message : 'Failed to save', 'error')
      }
    },
    [tableRef, onClientChange, t]
  )

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        handleCellSave(
          payload.id as string,
          payload.prop,
          payload.newValue,
          payload.rowIndex,
          payload.colIndex
        )
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleClearClient = useCallback(async () => {
    const confirmed = window.confirm(
      t('frc_offers.detail.client.clearConfirm', 'Remove client from this offer?')
    )
    if (!confirmed) return

    try {
      await onClientChange(null)
      flash(t('frc_offers.detail.client.cleared', 'Client removed'), 'success')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to remove client', 'error')
    }
  }, [onClientChange, t])

  const actionsRenderer = useCallback(
    (rowData: Record<string, unknown>) => {
      const hasClient = rowData.hasClient as boolean
      if (!hasClient) return null

      return (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleClearClient()
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title={t('frc_offers.detail.client.clear', 'Remove client')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )
    },
    [handleClearClient, t]
  )

  // Loading state while fetching client details
  if (carrierId && isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName=""
        idColumnName="id"
        width="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        actionsRenderer={actionsRenderer}
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
}
