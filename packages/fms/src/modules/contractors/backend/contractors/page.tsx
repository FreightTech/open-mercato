'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Trash2, Check } from 'lucide-react'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
  useFilterSuggestions,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  FilterRow,
  ColumnDef,
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  PerspectiveChangeEvent,
  SortRule,
  KeyboardShortcutsConfig,
  NewRowSaveEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog'
import type { RegonLookupResponse } from '../../api/regon-lookup/route'

type PrimaryAddress = {
  addressLine?: string | null
  city?: string | null
  country?: string | null
}

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
  taxId?: string | null
  regon?: string | null
  isActive: boolean
  createdAt?: string
  roleTypeIds?: string[]
  primaryContactId?: string | null
  primaryContactEmail?: string | null
  primaryContactPhone?: string | null
  primaryAddress?: PrimaryAddress | null
}

type ContractorsResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
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
      // Focus the cell to enable keyboard navigation
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

  // Reset highlighted index when options change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [options])

  // Scroll highlighted option into view
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
      // If dropdown is open and we have options, toggle the highlighted option
      if (showDropdown && options.length > 0 && highlightedIndex < options.length) {
        e.stopPropagation() // Prevent navigation hook from moving to next row
        handleToggle(options[highlightedIndex].value)
      } else {
        // Save without clearing editing - navigation hook will handle it
        setShowDropdown(false)
        onSave(selectedIds, false)
      }
    } else if (e.key === ' ') {
      // Space bar toggles the highlighted option
      e.preventDefault()
      e.stopPropagation()
      if (showDropdown && options.length > 0 && highlightedIndex < options.length) {
        handleToggle(options[highlightedIndex].value)
      }
    } else if (e.key === 'Tab') {
      // Save without clearing editing - navigation hook will handle it
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
    taxId: typeof item.taxId === 'string' ? item.taxId : null,
    regon: typeof item.regon === 'string' ? item.regon : null,
    isActive: item.isActive === true,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
    roleTypeIds: Array.isArray(item.roleTypeIds) ? item.roleTypeIds as string[] : [],
    primaryContactId: typeof item.primaryContactId === 'string' ? item.primaryContactId : null,
    primaryContactEmail: typeof item.primaryContactEmail === 'string' ? item.primaryContactEmail : null,
    primaryContactPhone: typeof item.primaryContactPhone === 'string' ? item.primaryContactPhone : null,
    primaryAddress: item.primaryAddress as PrimaryAddress | null ?? null,
  }
}

// Transform API perspective format to DynamicTable format
function apiToDynamicTable(dto: PerspectiveDto, allColumns: string[]): PerspectiveConfig {
  const { columnOrder = [], columnVisibility = {} } = dto.settings

  const visible = columnOrder.length > 0
    ? columnOrder.filter(col => columnVisibility[col] !== false)
    : allColumns
  const hidden = allColumns.filter(col => !visible.includes(col))

  const apiFilters = dto.settings.filters as Record<string, unknown> | undefined
  const filters: FilterRow[] = Array.isArray(apiFilters)
    ? apiFilters as FilterRow[]
    : (apiFilters?.rows as FilterRow[]) ?? []
  const color = apiFilters?._color as PerspectiveConfig['color']

  const sorting: SortRule[] = (dto.settings.sorting ?? []).map(s => ({
    id: s.id,
    field: s.id,
    direction: (s.desc ? 'desc' : 'asc') as 'asc' | 'desc'
  }))

  return { id: dto.id, name: dto.name, color, columns: { visible, hidden }, filters, sorting }
}

// Transform DynamicTable perspective format to API format
function dynamicTableToApi(config: PerspectiveConfig): PerspectiveSettings {
  const columnVisibility: Record<string, boolean> = {}
  config.columns.visible.forEach(col => columnVisibility[col] = true)
  config.columns.hidden.forEach(col => columnVisibility[col] = false)

  return {
    columnOrder: config.columns.visible,
    columnVisibility,
    filters: { rows: config.filters, _color: config.color },
    sorting: config.sorting.map(s => ({
      id: s.field,
      desc: s.direction === 'desc'
    })),
  }
}

// Global ref to store the contractor click handler
let onContractorClickHandler: ((contractorId: string) => void) | null = null

export function setContractorClickHandler(handler: ((contractorId: string) => void) | null) {
  onContractorClickHandler = handler
}

// Global ref to store the contractor delete handler
let onContractorDeleteHandler: ((contractorId: string) => void) | null = null

export function setContractorDeleteHandler(handler: ((contractorId: string) => void) | null) {
  onContractorDeleteHandler = handler
}

const DeleteButton = ({ id }: { id: string }) => {
  if (!id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onContractorDeleteHandler && id) {
          onContractorDeleteHandler(id)
        }
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
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [contractorToDelete, setContractorToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Server-side filter suggestions for large datasets
  const loadFilterSuggestions = useFilterSuggestions({
    entityType: 'contractors:contractor',
  })

  // Handler to navigate to contractor detail page
  const handleViewContractor = useCallback((contractorId: string) => {
    router.push(`/backend/contractors/${contractorId}`)
  }, [router])

  // Register the contractor click handler for the renderer
  useEffect(() => {
    setContractorClickHandler(handleViewContractor)
    return () => setContractorClickHandler(null)
  }, [handleViewContractor])

  // Register the contractor delete handler for the renderer
  const openDeleteDialog = useCallback((contractorId: string) => {
    setContractorToDelete(contractorId)
    setDeleteDialogOpen(true)
  }, [])

  useEffect(() => {
    setContractorDeleteHandler(openDeleteDialog)
    return () => setContractorDeleteHandler(null)
  }, [openDeleteDialog])

  const handleDeleteConfirm = useCallback(async () => {
    if (!contractorToDelete) return
    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/contractors/contractors/${contractorToDelete}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash(t('contractors.list.actions.deleted', 'Contractor deleted'), 'success')
        setDeleteDialogOpen(false)
        setContractorToDelete(null)
        queryClient.invalidateQueries({ queryKey: ['contractors'] })
      } else {
        const error = (response.result as { error?: string })?.error ?? 'Delete failed'
        flash(error, 'error')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [contractorToDelete, queryClient, t])

  const actionsRenderer = useCallback((rowData: { id: string }) => {
    if (!rowData?.id) return null
    return <DeleteButton id={rowData.id} />
  }, [])

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open contractor', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete contractor', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    if (actionId === 'view' && rowData.id) {
      handleViewContractor(rowData.id)
    } else if (actionId === 'delete' && rowData.id) {
      openDeleteDialog(rowData.id)
    }
  }, [handleViewContractor, openDeleteDialog])

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('search', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))
    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters])

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['contractors', queryParams, scopeVersion],
    queryFn: async () => {
      const call = await apiCall<ContractorsResponse>(`/api/contractors/contractors?${queryParams}`)
      if (!call.ok) throw new Error('Failed to load contractors')
      const payload = call.result ?? {}
      const items = Array.isArray(payload.items) ? payload.items : []
      return {
        items: items.map((item) => mapApiItem(item as Record<string, unknown>)).filter((row): row is ContractorRow => !!row),
        total: typeof payload.total === 'number' ? payload.total : items.length,
        totalPages: typeof payload.totalPages === 'number' ? payload.totalPages : 1,
      }
    },
    placeholderData: (previousData) => previousData, // Keep previous data while loading new data
  })

  // Fetch role types for dropdown
  const { data: roleTypesData } = useQuery({
    queryKey: ['contractor-role-types'],
    queryFn: async () => {
      const response = await apiCall<{ items: RoleType[] }>('/api/contractors/role-types')
      if (!response.ok) throw new Error('Failed to load role types')
      return response.result?.items ?? []
    },
  })

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'contractors'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/contractors')
      return response.ok ? response.result : null
    }
  })

  const roleTypesMap = useMemo(() => {
    const map = new Map<string, RoleType>()
    ;(roleTypesData ?? []).forEach((rt) => map.set(rt.id, rt))
    return map
  }, [roleTypesData])

  // Role type options with colors for the editor
  const roleOptionsWithColor = useMemo(() =>
    (roleTypesData ?? []).map((rt) => ({
      value: rt.id,
      label: rt.name,
      color: rt.color,
    })),
    [roleTypesData]
  )

  // Create dynamic columns with role type options, custom editor and renderer
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
            // Get roleTypeIds from rowData since value might be transformed
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

  // Transform API perspectives to DynamicTable format
  useEffect(() => {
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map(c => c.data)
      const transformed = perspectivesData.perspectives.map(p => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, columns])

  const tableData = useMemo(() => {
    return (data?.items ?? []).map((contractor) => ({
      id: contractor.id,
      name: contractor.name,
      taxId: contractor.taxId ?? '',
      regon: contractor.regon ?? '',
      primaryContactId: contractor.primaryContactId ?? '',
      primaryContactEmail: contractor.primaryContactEmail ?? '',
      primaryContactPhone: contractor.primaryContactPhone ?? '',
      roleTypeIds: contractor.roleTypeIds ?? [],
      isActive: contractor.isActive,
    }))
  }, [data?.items])

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      const selectedCell = tableRef.current?.querySelector('td[data-cell-selected="true"]') as HTMLElement | null
      if (!selectedCell) return
      const rowIndex = selectedCell.getAttribute('data-row')
      if (rowIndex === null) return
      const row = tableData[Number(rowIndex)] as { id: string } | undefined
      if (row?.id) {
        openDeleteDialog(row.id)
      }
    }
  }, [tableData, openDeleteDialog])

  // Handle inline creation with REGON lookup and geocoding
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    const { rowIndex, rowData } = payload

    console.log('[Contractor] NEW_ROW_SAVE triggered with rowData:', JSON.stringify(rowData, null, 2))

    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

    try {
      // Helper to coerce boolean values (table may send strings)
      const toBoolean = (val: unknown): boolean => {
        if (typeof val === 'boolean') return val
        if (val === 'true' || val === '1') return true
        if (val === 'false' || val === '0') return false
        return true // default to active
      }

      // Start with user-entered data - only include fields with values
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

      // Only include optional fields if they have values
      if (rowData.taxId && typeof rowData.taxId === 'string' && rowData.taxId.trim()) {
        contractorData.taxId = rowData.taxId.trim()
      }
      if (rowData.regon && typeof rowData.regon === 'string' && rowData.regon.trim()) {
        contractorData.regon = rowData.regon.trim()
      }
      if (Array.isArray(rowData.roleTypeIds) && rowData.roleTypeIds.length > 0) {
        contractorData.roleTypeIds = rowData.roleTypeIds
      }

      console.log('[Contractor] Built contractorData:', JSON.stringify(contractorData, null, 2))

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
        console.log('[Contractor] Looking up NIP:', nip)
        const regonResponse = await apiCall<RegonLookupResponse>(
          `/api/contractors/regon-lookup?nip=${encodeURIComponent(nip)}`
        )

        console.log('[Contractor] REGON response:', regonResponse.ok, regonResponse.result)

        if (regonResponse.ok && regonResponse.result?.company) {
          const company = regonResponse.result.company
          console.log('[Contractor] REGON company data:', company)
          console.log('[Contractor] REGON address:', company.address)

          // Auto-populate fields from REGON (user data takes precedence if filled)
          if (!contractorData.name || contractorData.name.trim() === '') {
            contractorData.name = company.name
          }
          if (!contractorData.regon) {
            contractorData.regon = company.regon
          }

          // Store address data for geocoding
          regonAddress = company.address
        } else {
          console.log('[Contractor] REGON lookup returned no company data')
        }
      }

      // Validate that we have a name
      if (!contractorData.name || contractorData.name.trim() === '') {
        throw new Error(t('contractors.validation.nameRequired', 'Company name is required'))
      }

      // Create the contractor
      console.log('[Contractor] Creating contractor with final data:', JSON.stringify(contractorData, null, 2))
      const createResponse = await apiCall<{ id: string; error?: string }>(
        '/api/contractors/contractors',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contractorData),
        }
      )
      console.log('[Contractor] Create response:', createResponse.ok, createResponse.result)

      if (!createResponse.ok || !createResponse.result?.id) {
        const error = createResponse.result?.error || t('contractors.form.create.error', 'Failed to create contractor')
        throw new Error(error)
      }

      const contractorId = createResponse.result.id
      let locationCreated = false

      // If we have address data from REGON, geocode and create location
      console.log('[Contractor] Checking address for geocoding:', regonAddress)
      if (regonAddress && (regonAddress.addressLine || regonAddress.city)) {
        try {
          // Build address string for geocoding
          const addressParts = [
            regonAddress.addressLine,
            regonAddress.postalCode,
            regonAddress.city,
            regonAddress.country || 'Poland',
          ].filter(Boolean)
          const addressString = addressParts.join(', ')
          console.log('[Contractor] Geocoding address string:', addressString)

          // Get place suggestions
          const autocompleteResponse = await apiCall<{
            suggestions: Array<{ placeId: string; description: string }>
            available: boolean
          }>(`/api/fms_locations/places/autocomplete?input=${encodeURIComponent(addressString)}`)

          console.log('[Contractor] Autocomplete response:', autocompleteResponse.ok, autocompleteResponse.result)

          if (
            autocompleteResponse.ok &&
            autocompleteResponse.result?.suggestions?.length &&
            autocompleteResponse.result.suggestions.length > 0
          ) {
            const placeId = autocompleteResponse.result.suggestions[0].placeId
            console.log('[Contractor] Selected placeId:', placeId)

            // Get place details (coordinates)
            const detailsResponse = await apiCall<{
              details: {
                lat: number
                lng: number
                formattedAddress: string
              }
              available: boolean
            }>(`/api/fms_locations/places/details?placeId=${encodeURIComponent(placeId)}`)

            console.log('[Contractor] Place details response:', detailsResponse.ok, detailsResponse.result)

            if (detailsResponse.ok && detailsResponse.result?.details) {
              const details = detailsResponse.result.details

              // Create contractor address/location
              const locationPayload = {
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
              }
              console.log('[Contractor] Creating location with payload:', locationPayload)

              const locationResponse = await apiCall<{ id: string; error?: string }>(
                '/api/fms_locations/contractor-addresses',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(locationPayload),
                }
              )

              console.log('[Contractor] Location creation response:', locationResponse.ok, locationResponse.result)
              locationCreated = locationResponse.ok
            } else {
              console.warn('[Contractor] Place details not available')
            }
          } else {
            console.warn('[Contractor] No autocomplete suggestions found')
          }
        } catch (geoError) {
          // Geocoding failed but contractor was created - log but don't fail
          console.warn('[Contractor] Geocoding failed:', geoError)
        }
      } else {
        console.log('[Contractor] No address data from REGON to geocode')
      }

      // Success
      const successMessage = locationCreated
        ? t('contractors.inline.successWithAddress', 'Contractor created with primary address')
        : t('contractors.form.create.success', 'Contractor created successfully')

      flash(successMessage, 'success')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex,
        savedRowData: { ...contractorData, id: contractorId },
      })

      queryClient.invalidateQueries({ queryKey: ['contractors'] })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('contractors.form.create.error', 'Failed to create contractor')
      flash(errorMessage, 'error')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex,
        error: errorMessage,
      })
    }
  }, [queryClient, t])

  useEventHandlers(
    {
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,

      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        })

        try {
          let response: { ok: boolean; result?: { error?: string; id?: string } | null }
          const rowData = tableData[payload.rowIndex]
          const primaryContactId = rowData?.primaryContactId

          if (payload.prop === 'roleTypeIds') {
            // Update role type IDs
            const roleTypeIds = Array.isArray(payload.newValue) ? payload.newValue : []
            response = await apiCall<{ error?: string }>(`/api/contractors/contractors/${payload.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roleTypeIds }),
            })
          } else if (payload.prop === 'primaryContactEmail' || payload.prop === 'primaryContactPhone') {
            // Update primary contact field
            const fieldName = payload.prop === 'primaryContactEmail' ? 'email' : 'phone'
            const fieldValue = payload.newValue === '' ? null : payload.newValue

            if (primaryContactId) {
              // Update existing contact
              response = await apiCall<{ error?: string }>('/api/contractors/contacts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: primaryContactId, contractorId: payload.id, [fieldName]: fieldValue }),
              })
            } else {
              // Create new primary contact
              response = await apiCall<{ error?: string; id?: string }>('/api/contractors/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contractorId: payload.id,
                  firstName: '',
                  lastName: '',
                  [fieldName]: fieldValue,
                  isPrimary: true,
                  isActive: true,
                }),
              })
            }
          } else {
            // Regular contractor field update
            response = await apiCall<{ error?: string }>(`/api/contractors/contractors/${payload.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue === '' ? null : payload.newValue }),
            })
          }

          if (response.ok) {
            flash(t('contractors.form.edit.success', 'Updated successfully'), 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            })
            queryClient.invalidateQueries({ queryKey: ['contractors'] })
          } else {
            const error = response.result?.error || 'Update failed'
            flash(error, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
              error,
            })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          })
        }
      },

      [TableEvents.COLUMN_SORT]: (payload: { columnName: string; direction: 'asc' | 'desc' | null }) => {
        setSortField(payload.columnName)
        setSortDir(payload.direction || 'asc')
        setPage(1)
      },

      [TableEvents.SEARCH]: (payload: { query: string }) => {
        setSearch(payload.query)
        setPage(1)
      },

      [TableEvents.FILTER_CHANGE]: (payload: { filters: FilterRow[] }) => {
        setFilters(payload.filters)
        setPage(1)
      },

      [TableEvents.PERSPECTIVE_CHANGE]: (payload: PerspectiveChangeEvent) => {
        // Handle sort rules change from Sort popover
        if (payload.config.sorting) {
          if (payload.config.sorting.length > 0) {
            const firstSort = payload.config.sorting[0]
            setSortField(firstSort.field)
            setSortDir(firstSort.direction)
          } else {
            // Reset to default when all sorts removed
            setSortField('createdAt')
            setSortDir('desc')
          }
          setPage(1)
        }
      },

      // Perspective event handlers
      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const settings = dynamicTableToApi(payload.perspective)
        const existingPerspective = savedPerspectives.find(p => p.name === payload.perspective.name)
        const response = await apiCall('/api/perspectives/contractors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingPerspective?.id,
            name: payload.perspective.name,
            settings
          })
        })
        if (response.ok) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'contractors'] })
        } else {
          flash('Failed to save perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_SELECT]: (payload: PerspectiveSelectEvent) => {
        setActivePerspectiveId(payload.id)
        if (payload.config) {
          setFilters(payload.config.filters)
          if (payload.config.sorting.length > 0) {
            setSortField(payload.config.sorting[0].field)
            setSortDir(payload.config.sorting[0].direction)
          }
          setPage(1)
        } else {
          // Reset to default when "All" is selected
          setFilters([])
          setSortField('createdAt')
          setSortDir('desc')
          setPage(1)
        }
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const perspective = savedPerspectives.find(p => p.id === payload.id)
        if (perspective) {
          const settings = dynamicTableToApi(perspective)
          const response = await apiCall('/api/perspectives/contractors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: payload.id, name: payload.newName, settings })
          })
          if (response.ok) {
            flash('Perspective renamed', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'contractors'] })
          } else {
            flash('Failed to rename perspective', 'error')
          }
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const url = payload.hardDelete
          ? `/api/perspectives/contractors/${payload.id}?hardDelete=true`
          : `/api/perspectives/contractors/${payload.id}`
        const response = await apiCall(url, {
          method: 'DELETE'
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'contractors'] })
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
            setFilters([])
            setSortField('createdAt')
            setSortDir('desc')
          }
        } else {
          flash('Failed to delete perspective', 'error')
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Only show skeleton on initial load, not during refetches (e.g., when filters change)
  if (isLoading && !data) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={6} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        {/* onKeyDown wrapper intercepts Cmd/Ctrl+D to prevent browser bookmark */}
        <div onKeyDown={handleTableKeyDown}>
          <DynamicTable
            tableRef={tableRef}
            data={tableData}
            columns={columns}
            tableName={t('contractors.title', 'Contractors')}
            idColumnName="id"
            height={600}
            colHeaders={true}
            rowHeaders={true}
            stretchColumns={true}
            actionsRenderer={actionsRenderer}
            keyboardShortcuts={keyboardShortcuts}
            onRowAction={handleRowAction}
            uiConfig={{
              hideAddRowButton: false, // Enable inline row creation with NIP auto-lookup
            }}
            enableComments
            commentsTableId="contractors"
            savedPerspectives={savedPerspectives}
            activePerspectiveId={activePerspectiveId}
            loadFilterSuggestions={loadFilterSuggestions}
            pagination={{
              currentPage: page,
              totalPages: Math.ceil((data?.total || 0) / limit),
              limit,
              limitOptions: [25, 50, 100],
              onPageChange: setPage,
              onLimitChange: (l) => {
                setLimit(l)
                setPage(1)
              },
            }}
          />
        </div>
        <ConfirmDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open)
            if (!open) setContractorToDelete(null)
          }}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            tableRef.current?.focus()
          }}
        />
      </PageBody>
    </Page>
  )
}
