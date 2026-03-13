'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Trash2, Check } from 'lucide-react'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  ColumnDef,
  NewRowSaveEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import type { DynamicTableCreateHandlerContext } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { RegonLookupResponse } from '../../api/regon-lookup/route'

type RoleType = {
  id: string
  name: string
  code: string
  color?: string | null
  category: string
}

type ContractorRow = {
  id: string
  name: string
  taxId: string
  regon: string
  isActive: boolean
  roleTypeIds: string[]
  primaryContactId: string
  primaryContactEmail: string
  primaryContactPhone: string
}

type RoleOption = {
  value: string
  label: string
  color?: string | null
}

// Multi-select dropdown editor for roles
const MultiSelectEditor = ({
  value,
  options,
  onChange,
  onSave,
  onCancel,
}: {
  value: string[]
  options: RoleOption[]
  onChange: (val: string[]) => void
  onSave: (val: string[], clearEditing?: boolean) => void
  onCancel: () => void
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    Array.isArray(value) ? value : []
  )
  const [showDropdown, setShowDropdown] = useState(true)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, openAbove: false })
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const cellRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const maxHeight = 250
      const openAbove = spaceBelow < maxHeight && spaceAbove > spaceBelow + 100
      setPosition({
        top: openAbove ? rect.top - 2 : rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 200),
        openAbove,
      })
      cellRef.current.focus()
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isOutsideCell = cellRef.current && !cellRef.current.contains(e.target as Node)
      const isOutsideDropdown = !dropdownRef.current || !dropdownRef.current.contains(e.target as Node)

      if (isOutsideCell && isOutsideDropdown) {
        setShowDropdown(false)
        onSave(selectedIds, true)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onSave, selectedIds])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [options])

  useEffect(() => {
    if (dropdownRef.current && showDropdown) {
      const highlighted = dropdownRef.current.children[highlightedIndex] as HTMLElement | undefined
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, showDropdown])

  const handleToggle = (optionValue: string) => {
    const newIds = selectedIds.includes(optionValue)
      ? selectedIds.filter((id) => id !== optionValue)
      : [...selectedIds, optionValue]
    setSelectedIds(newIds)
    onChange(newIds)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex((prev) =>
        prev < options.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (showDropdown && options.length > 0 && highlightedIndex < options.length) {
        e.stopPropagation()
        handleToggle(options[highlightedIndex].value)
      } else {
        setShowDropdown(false)
        onSave(selectedIds, false)
      }
    } else if (e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      if (showDropdown && options.length > 0 && highlightedIndex < options.length) {
        handleToggle(options[highlightedIndex].value)
      }
    } else if (e.key === 'Tab') {
      setShowDropdown(false)
      onSave(selectedIds, false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setShowDropdown(false)
      onCancel()
    }
  }

  const selectedLabels = options
    .filter((opt) => selectedIds.includes(opt.value))
    .map((opt) => opt.label)
    .join(', ')

  return (
    <>
      <div
        ref={cellRef}
        className="hot-cell-editor flex items-center min-h-[28px] px-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
      >
        <span className="truncate text-sm">
          {selectedLabels || 'Select roles...'}
        </span>
      </div>

      {showDropdown && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="bg-popover border border-border rounded-md shadow-lg text-popover-foreground"
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
            maxHeight: '250px',
            overflowY: 'auto',
            zIndex: 10000,
            ...(position.openAbove ? { transform: 'translateY(-100%)' } : {}),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map((option, index) => {
            const isSelected = selectedIds.includes(option.value)
            const isHighlighted = index === highlightedIndex
            return (
              <div
                key={option.value}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm ${
                  isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                } ${isSelected ? 'bg-accent/50' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleToggle(option.value)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
              </div>
            )
          })}
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No roles available</div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

function mapApiItem(item: Record<string, unknown>): ContractorRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null
  return {
    id,
    name: typeof item.name === 'string' ? item.name : '',
    taxId: typeof item.taxId === 'string' ? item.taxId : '',
    regon: typeof item.regon === 'string' ? item.regon : '',
    isActive: item.isActive === true,
    roleTypeIds: Array.isArray(item.roleTypeIds) ? item.roleTypeIds as string[] : [],
    primaryContactId: typeof item.primaryContactId === 'string' ? item.primaryContactId : '',
    primaryContactEmail: typeof item.primaryContactEmail === 'string' ? item.primaryContactEmail : '',
    primaryContactPhone: typeof item.primaryContactPhone === 'string' ? item.primaryContactPhone : '',
  }
}

// Global ref for contractor click handler (used by ContractorNameRenderer)
let onContractorClickHandler: ((contractorId: string) => void) | null = null

export function setContractorClickHandler(handler: ((contractorId: string) => void) | null) {
  onContractorClickHandler = handler
}

// Global ref for contractor delete handler (used by DeleteButton)
let onContractorDeleteHandler: ((row: ContractorRow) => void) | null = null

export function setContractorDeleteHandler(handler: ((row: ContractorRow) => void) | null) {
  onContractorDeleteHandler = handler
}

const DeleteButton = ({ row }: { row: ContractorRow }) => {
  if (!row.id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onContractorDeleteHandler?.(row)
      }}
      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete contractor"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

const ContractorNameRenderer = ({ value, rowData }: { value: string; rowData: { id: string } }) => {
  const isUnsavedRow = !rowData.id || rowData.id === ''
  const displayValue = value || '-'

  if (isUnsavedRow) {
    return <span className="font-medium">{displayValue}</span>
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onContractorClickHandler && rowData.id) {
          onContractorClickHandler(rowData.id)
        }
      }}
      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
    >
      {displayValue}
    </button>
  )
}

// Static columns definition
const COLUMNS: ColumnDef[] = [
  {
    data: 'name',
    title: 'Name',
    type: 'text',
    width: 220,
    renderer: (value: string, rowData: { id: string }) => <ContractorNameRenderer value={value} rowData={rowData} />,
  },
  {
    data: 'taxId',
    title: 'Tax ID (NIP)',
    type: 'text',
    width: 160,
  },
  { data: 'primaryContactEmail', title: 'Email', type: 'text', width: 180 },
  { data: 'primaryContactPhone', title: 'Phone', type: 'text', width: 140 },
  {
    data: 'roleTypeIds',
    title: 'Roles',
    type: 'text',
    width: 200,
    // editor and renderer are added dynamically in the component to access roleTypesMap
  },
  { data: 'isActive', title: 'Active', type: 'boolean', width: 80 },
]

export default function ContractorsPage() {
  const t = useT()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()

  // Fetch role types for dropdown (outside the hook — feeds dynamic columns)
  const { data: roleTypesData } = useQuery({
    queryKey: ['contractor-role-types'],
    queryFn: async () => {
      const response = await apiCall<{ items: RoleType[] }>('/api/contractors/role-types')
      if (!response.ok) throw new Error('Failed to load role types')
      return response.result?.items ?? []
    },
  })

  const roleTypesMap = useMemo(() => {
    const map = new Map<string, RoleType>()
    ;(roleTypesData ?? []).forEach((rt) => map.set(rt.id, rt))
    return map
  }, [roleTypesData])

  const roleOptionsWithColor = useMemo(() =>
    (roleTypesData ?? []).map((rt) => ({
      value: rt.id,
      label: rt.name,
      color: rt.color,
    })),
    [roleTypesData]
  )

  // Dynamic columns with role type editor/renderer
  const columns = useMemo(() => {
    return COLUMNS.map((col) => {
      if (col.data === 'roleTypeIds') {
        return {
          ...col,
          editor: (
            value: unknown,
            onChange: (val: unknown) => void,
            onSave: (val?: unknown, clearEditing?: boolean) => void,
            onCancel: () => void,
          ) => {
            const currentValue = Array.isArray(value) ? value : []
            return (
              <MultiSelectEditor
                value={currentValue}
                options={roleOptionsWithColor}
                onChange={(val) => onChange(val)}
                onSave={(val, clear) => onSave(val, clear)}
                onCancel={onCancel}
              />
            )
          },
          renderer: (value: unknown, rowData: Record<string, unknown>) => {
            const ids = rowData?.roleTypeIds
            const roleTypeIds = Array.isArray(ids) ? ids : (Array.isArray(value) ? value : [])

            if (roleTypeIds.length === 0) {
              return <span className="text-gray-400">-</span>
            }
            return (
              <span className="flex gap-1 overflow-hidden">
                {roleTypeIds.map((roleTypeId: string) => {
                  const roleType = roleTypesMap.get(roleTypeId)
                  if (!roleType) return null
                  return (
                    <Badge
                      key={roleTypeId}
                      variant="outline"
                      style={roleType.color ? { borderColor: roleType.color, color: roleType.color } : undefined}
                    >
                      {roleType.name}
                    </Badge>
                  )
                })}
              </span>
            )
          },
        }
      }
      return col
    })
  }, [roleOptionsWithColor, roleTypesMap])

  // Navigation handler
  const handleViewContractor = useCallback((contractorId: string) => {
    router.push(`/backend/contractors/${contractorId}`)
  }, [router])

  useEffect(() => {
    setContractorClickHandler(handleViewContractor)
    return () => setContractorClickHandler(null)
  }, [handleViewContractor])

  // Custom new row handler — REGON lookup + geocoding
  const handleNewRowSave = useCallback(async (
    payload: NewRowSaveEvent,
    ctx: DynamicTableCreateHandlerContext,
  ) => {
    const { rowIndex, rowData } = payload

    dispatch(ctx.tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

    try {
      const toBoolean = (val: unknown): boolean => {
        if (typeof val === 'boolean') return val
        if (val === 'true' || val === '1') return true
        if (val === 'false' || val === '0') return false
        return true
      }

      let contractorData: {
        name: string
        taxId?: string
        regon?: string
        roleTypeIds?: string[]
        isActive: boolean
      } = {
        name: rowData.name?.trim() || '',
        isActive: toBoolean(rowData.isActive),
      }

      if (rowData.taxId && typeof rowData.taxId === 'string' && rowData.taxId.trim()) {
        contractorData.taxId = rowData.taxId.trim()
      }
      if (rowData.regon && typeof rowData.regon === 'string' && rowData.regon.trim()) {
        contractorData.regon = rowData.regon.trim()
      }
      if (Array.isArray(rowData.roleTypeIds) && rowData.roleTypeIds.length > 0) {
        contractorData.roleTypeIds = rowData.roleTypeIds
      }

      let regonAddress: {
        addressLine: string | null
        city: string | null
        state: string | null
        postalCode: string | null
        country: string | null
      } | null = null

      // If NIP is provided, attempt REGON lookup
      const nip = contractorData.taxId?.replace(/[^0-9]/g, '')
      if (nip && nip.length === 10) {
        const regonResponse = await apiCall<RegonLookupResponse>(
          `/api/contractors/regon-lookup?nip=${encodeURIComponent(nip)}`
        )

        if (regonResponse.ok && regonResponse.result?.company) {
          const company = regonResponse.result.company

          if (!contractorData.name || contractorData.name.trim() === '') {
            contractorData.name = company.name
          }
          if (!contractorData.regon) {
            contractorData.regon = company.regon
          }

          regonAddress = company.address
        }
      }

      if (!contractorData.name || contractorData.name.trim() === '') {
        throw new Error(t('contractors.validation.nameRequired', 'Company name is required'))
      }

      const createResponse = await apiCall<{ id: string; error?: string }>(
        '/api/contractors/contractors',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contractorData),
        }
      )

      if (!createResponse.ok || !createResponse.result?.id) {
        const error = createResponse.result?.error || t('contractors.form.create.error', 'Failed to create contractor')
        throw new Error(error)
      }

      const contractorId = createResponse.result.id
      let locationCreated = false

      // If we have address data from REGON, geocode and create location
      if (regonAddress && (regonAddress.addressLine || regonAddress.city)) {
        try {
          const addressParts = [
            regonAddress.addressLine,
            regonAddress.postalCode,
            regonAddress.city,
            regonAddress.country || 'Poland',
          ].filter(Boolean)
          const addressString = addressParts.join(', ')

          const autocompleteResponse = await apiCall<{
            suggestions: Array<{ placeId: string; description: string }>
            available: boolean
          }>(`/api/fms_locations/places/autocomplete?input=${encodeURIComponent(addressString)}`)

          if (
            autocompleteResponse.ok &&
            autocompleteResponse.result?.suggestions?.length &&
            autocompleteResponse.result.suggestions.length > 0
          ) {
            const placeId = autocompleteResponse.result.suggestions[0].placeId

            const detailsResponse = await apiCall<{
              details: { lat: number; lng: number; formattedAddress: string }
              available: boolean
            }>(`/api/fms_locations/places/details?placeId=${encodeURIComponent(placeId)}`)

            if (detailsResponse.ok && detailsResponse.result?.details) {
              const details = detailsResponse.result.details

              const locationResponse = await apiCall<{ id: string; error?: string }>(
                '/api/fms_locations/contractor-addresses',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contractorId,
                    name: contractorData.name,
                    type: 'contractor_billing',
                    addressLine1: regonAddress.addressLine,
                    city: regonAddress.city,
                    state: regonAddress.state,
                    postalCode: regonAddress.postalCode,
                    country: regonAddress.country || 'Poland',
                    lat: details.lat,
                    lng: details.lng,
                    googlePlaceId: placeId,
                    isPrimary: true,
                    isActive: true,
                  }),
                }
              )

              locationCreated = locationResponse.ok
            }
          }
        } catch (geoError) {
          console.warn('[Contractor] Geocoding failed:', geoError)
        }
      }

      const successMessage = locationCreated
        ? t('contractors.inline.successWithAddress', 'Contractor created with primary address')
        : t('contractors.form.create.success', 'Contractor created successfully')

      flash(successMessage, 'success')

      dispatch(ctx.tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex,
        savedRowData: { ...contractorData, id: contractorId },
      })

      ctx.invalidate()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('contractors.form.create.error', 'Failed to create contractor')
      flash(errorMessage, 'error')

      dispatch(ctx.tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex,
        error: errorMessage,
      })
    }
  }, [t])

  const table = useDynamicTablePage<ContractorRow>({
    source: '/api/contractors/contractors',
    columns,
    tableName: t('contractors.title', 'Contractors'),
    perspectives: 'contractors',
    filterSuggestions: 'contractors:contractor',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    queryKey: 'contractors',
    queryKeyDeps: [scopeVersion],
    mapApiItem,
    delete: {
      title: t('contractors.deleteDialog.title', 'Delete Contractor'),
      description: t('contractors.deleteDialog.description', 'Are you sure you want to delete this contractor? This will also delete all associated addresses, contacts, and roles. This action cannot be undone.'),
      nameColumn: 'name',
    },
    create: {
      handler: handleNewRowSave,
    },
    hooks: {
      beforeCellEdit: (payload: CellEditSaveEvent, rowData: ContractorRow) => {
        if (payload.prop === 'roleTypeIds') {
          const roleTypeIds = Array.isArray(payload.newValue) ? payload.newValue : []
          return {
            url: `/api/contractors/contractors/${rowData.id}`,
            payload: { roleTypeIds },
          }
        }
        if (payload.prop === 'primaryContactEmail' || payload.prop === 'primaryContactPhone') {
          const fieldName = payload.prop === 'primaryContactEmail' ? 'email' : 'phone'
          const fieldValue = payload.newValue === '' ? null : payload.newValue

          if (rowData.primaryContactId) {
            return {
              url: '/api/contractors/contacts',
              payload: { id: rowData.primaryContactId, contractorId: rowData.id, [fieldName]: fieldValue },
            }
          } else {
            return {
              url: '/api/contractors/contacts',
              method: 'POST' as const,
              payload: {
                contractorId: rowData.id,
                firstName: '',
                lastName: '',
                [fieldName]: fieldValue,
                isPrimary: true,
                isActive: true,
              },
            }
          }
        }
        // Default: regular contractor field update
        return {
          url: `/api/contractors/contractors/${rowData.id}`,
          payload: { [payload.prop]: payload.newValue === '' ? null : payload.newValue },
        }
      },
      afterMutation: (type) => {
        if (type === 'cellEdit') {
          flash(t('contractors.form.edit.success', 'Updated successfully'), 'success')
        }
      },
    },
    tableProps: {
      height: 'fill',
      enableComments: true,
      commentsEntityType: 'fms_contractor',
      commentsViewContext: 'contractors',
      uiConfig: {
        hideAddRowButton: false,
        borderless: true,
      },
      keyboardShortcuts: {
        rowActions: [
          { id: 'view', label: 'Open contractor', key: 'Enter', shift: true },
          { id: 'delete', label: 'Delete contractor', key: 'd', ctrlOrCmd: true },
        ],
      },
    },
  })

  // Register global handlers for renderers
  useEffect(() => {
    setContractorDeleteHandler((row) => table.setRowToDelete(row))
    return () => setContractorDeleteHandler(null)
  }, [table.setRowToDelete])

  const actionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as ContractorRow
    if (!row?.id) return null
    return <DeleteButton row={row} />
  }, [])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as ContractorRow
    if (actionId === 'view' && row.id) {
      handleViewContractor(row.id)
    } else if (actionId === 'delete' && row.id) {
      table.setRowToDelete(row)
    }
  }, [handleViewContractor, table.setRowToDelete])

  if (table.isLoading) {
    return (
      <div className="-m-4 lg:-m-6">
        <TableSkeleton rows={10} columns={6} />
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <DynamicTable
        {...table.props}
        actionsRenderer={actionsRenderer}
        onRowAction={handleRowAction}
      />
      {table.deleteDialog}
    </div>
  )
}
