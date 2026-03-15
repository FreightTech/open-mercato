'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '../../utils/apiCall'
import { flash } from '../../FlashMessages'
import { dispatch, useEventHandlers } from '../events/events'
import { apiToDynamicTable, dynamicTableToApi } from '../utils/perspectiveTransforms'
import TableDeleteDialog from '../components/TableDeleteDialog'
import type {
  ColumnDef,
  FilterRow,
  DynamicTableProps,
  PaginationProps,
  TableUIConfig,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  NewRowSaveEvent,
  NewRowSaveErrorEvent,
  KeyboardShortcutsConfig,
  OnRowAction,
} from '../types/index'
import { TableEvents } from '../types/index'
import type {
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  PerspectiveChangeEvent,
  SortRule,
} from '../types/perspective'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
} from '@open-mercato/shared/modules/perspectives/types'

// ─── Config Types ────────────────────────────

export interface DynamicTablePageDeleteConfig<TRow = any> {
  title?: string | ((row: TRow) => string)
  description?: string | ((row: TRow) => string)
  nameColumn?: string
  /** Base URL or function returning full URL for the DELETE request */
  url?: string | ((row: TRow) => string)
}

export interface DynamicTablePageCellEditConfig {
  url?: string | ((payload: CellEditSaveEvent, rowData: any) => string)
  method?: 'PUT' | 'PATCH' | 'POST'
  mapPayload?: (payload: CellEditSaveEvent, rowData: any) => Record<string, unknown>
}

export interface DynamicTableCreateHandlerContext {
  tableRef: React.RefObject<HTMLElement>
  invalidate: () => void
}

export interface DynamicTablePageCreateConfig {
  url?: string
  mapPayload?: (rowData: any) => Record<string, unknown>
  /** Fully custom create flow. Replaces built-in logic. Handler must dispatch NEW_ROW_SAVE_START/SUCCESS/ERROR events. */
  handler?: (payload: NewRowSaveEvent, ctx: DynamicTableCreateHandlerContext) => Promise<void>
}

export interface DynamicTablePageHooks<TRow = any> {
  beforeCellEdit?: (
    payload: CellEditSaveEvent,
    rowData: any
  ) => { url?: string; payload?: Record<string, unknown>; method?: 'PUT' | 'PATCH' | 'POST' } | void
  beforeCreate?: (rowData: any) => Record<string, unknown> | Promise<Record<string, unknown>> | void
  validateCreate?: (rowData: any) => string | null
  afterMutation?: (
    type: 'cellEdit' | 'create' | 'delete',
    context: any
  ) => void | Promise<void>
  beforeDelete?: (row: TRow) => boolean | Promise<boolean>
}

export interface DynamicTablePageConfig<TRow = any> {
  source: string
  columns: ColumnDef[]
  tableName: string

  perspectives?: string
  filterSuggestions?: string

  defaultSort?: { field: string; direction: 'asc' | 'desc' }
  defaultPageSize?: number
  /** Initial filters to seed on mount (e.g., from URL params). Only read once. */
  initialFilters?: FilterRow[]
  idColumn?: string

  delete?: boolean | string | DynamicTablePageDeleteConfig<TRow>
  create?: boolean | DynamicTablePageCreateConfig
  cellEdit?: false | DynamicTablePageCellEditConfig

  queryKey?: string
  /** Extra values appended to the query key for cache invalidation (e.g., scopeVersion) */
  queryKeyDeps?: unknown[]
  extraParams?: Record<string, string> | (() => Record<string, string>)
  mapApiItem?: (item: any) => TRow | null

  hooks?: DynamicTablePageHooks<TRow>

  tableProps?: Partial<
    Omit<
      DynamicTableProps,
      'data' | 'columns' | 'tableRef' | 'pagination' | 'savedPerspectives' | 'activePerspectiveId' | 'tableName'
    >
  >
}

// ─── Return Type ─────────────────────────────

export interface DynamicTablePageResult<TRow = any> {
  props: DynamicTableProps
  DeleteDialog: React.FC
  /** Trigger the delete dialog for a given row */
  setRowToDelete: (row: TRow | null) => void
  query: ReturnType<typeof useQuery>
  isLoading: boolean
  refresh: () => void
  state: {
    page: number
    limit: number
    search: string
    filters: FilterRow[]
    sortField: string
    sortDir: 'asc' | 'desc'
  }
}

// ─── Hook ────────────────────────────────────

export function useDynamicTablePage<TRow = any>(
  config: DynamicTablePageConfig<TRow>
): DynamicTablePageResult<TRow> {
  const {
    source,
    columns,
    tableName,
    perspectives: perspectivesTableId,
    defaultSort,
    defaultPageSize = 50,
    idColumn = 'id',
    hooks,
  } = config

  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // ── State ──

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(defaultPageSize)
  const [sortField, setSortField] = useState(defaultSort?.field ?? 'id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSort?.direction ?? 'asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>(() => config.initialFilters ?? [])

  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  const [pendingDelete, setPendingDelete] = useState<TRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const queryKeyBase = config.queryKey ?? source

  // ── Perspectives ──

  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', perspectivesTableId],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>(
        `/api/perspectives/${perspectivesTableId}`
      )
      return response.ok ? response.result : null
    },
    enabled: !!perspectivesTableId,
  })

  useEffect(() => {
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) =>
        apiToDynamicTable(p, allCols)
      )
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, columns, activePerspectiveId])

  // ── Data Query ──

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('q', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))

    const extra =
      typeof config.extraParams === 'function' ? config.extraParams() : config.extraParams
    if (extra) {
      Object.entries(extra).forEach(([key, value]) => params.set(key, value))
    }

    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters, config.extraParams])

  const queryKeyDeps = config.queryKeyDeps ?? []

  const dataQuery = useQuery({
    queryKey: [queryKeyBase, queryParams, ...queryKeyDeps],
    queryFn: async () => {
      const call = await apiCall<{
        items: any[]
        total: number
        totalPages?: number
      }>(`${source}?${queryParams}`)
      if (!call.ok) throw new Error(`Failed to load ${tableName}`)
      return call.result ?? { items: [], total: 0, totalPages: 1 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => {
    const items = dataQuery.data?.items ?? []
    if (config.mapApiItem) {
      return items.map(config.mapApiItem).filter(Boolean)
    }
    return items
  }, [dataQuery.data?.items, config.mapApiItem])

  // ── Cell Edit Handler ──

  const handleCellEditSave = useCallback(
    async (payload: CellEditSaveEvent) => {
      if (config.cellEdit === false) return

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
      } as CellSaveStartEvent)

      try {
        const rowData = tableData[payload.rowIndex]
        if (!rowData) throw new Error('Row data not found')

        const cellEditConfig = typeof config.cellEdit === 'object' ? config.cellEdit : {}
        let hookResult: { url?: string; payload?: Record<string, unknown>; method?: string } | void = undefined

        if (hooks?.beforeCellEdit) {
          hookResult = hooks.beforeCellEdit(payload, rowData)
        }

        let apiUrl: string
        if (hookResult?.url) {
          apiUrl = hookResult.url
        } else if (typeof cellEditConfig.url === 'function') {
          apiUrl = cellEditConfig.url(payload, rowData)
        } else if (cellEditConfig.url) {
          apiUrl = `${cellEditConfig.url}/${(rowData as any)[idColumn]}`
        } else {
          apiUrl = `${source}/${(rowData as any)[idColumn]}`
        }

        let updatePayload: Record<string, unknown>
        if (hookResult?.payload) {
          updatePayload = hookResult.payload
        } else if (cellEditConfig.mapPayload) {
          updatePayload = cellEditConfig.mapPayload(payload, rowData)
        } else {
          updatePayload = { [payload.prop]: payload.newValue }
        }

        const method = hookResult?.method ?? cellEditConfig.method ?? 'PUT'

        const response = await apiCall<{ error?: string }>(apiUrl, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })

        if (response.ok) {
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
          queryClient.invalidateQueries({ queryKey: [queryKeyBase] })
          if (hooks?.afterMutation) await hooks.afterMutation('cellEdit', { payload, rowData })
        } else {
          const error = response.result?.error || 'Update failed'
          flash(error, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error,
          } as CellSaveErrorEvent)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        flash(errorMessage, 'error')
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
          error: errorMessage,
        } as CellSaveErrorEvent)
      }
    },
    [tableData, queryClient, config.cellEdit, hooks, source, idColumn, queryKeyBase]
  )

  // ── New Row Handler ──

  const handleNewRowSave = useCallback(
    async (payload: NewRowSaveEvent) => {
      if (!config.create) return

      const createConfig = typeof config.create === 'object' ? config.create : {}

      // Custom handler — fully replaces built-in flow
      if (createConfig.handler) {
        await createConfig.handler(payload, {
          tableRef: tableRef as React.RefObject<HTMLElement>,
          invalidate: () => queryClient.invalidateQueries({ queryKey: [queryKeyBase] }),
        })
        return
      }

      try {
        let rowPayload: Record<string, unknown> = { ...payload.rowData }

        if (hooks?.validateCreate) {
          const validationError = hooks.validateCreate(payload.rowData)
          if (validationError) {
            flash(validationError, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              error: validationError,
            } as NewRowSaveErrorEvent)
            return
          }
        }

        if (hooks?.beforeCreate) {
          const mapped = await hooks.beforeCreate(payload.rowData)
          if (mapped) rowPayload = mapped
        }

        if (createConfig.mapPayload) {
          rowPayload = createConfig.mapPayload(payload.rowData)
        }

        const createUrl = createConfig.url ?? source

        const response = await apiCall<{ id: string; error?: string }>(createUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rowPayload),
        })

        if (response.ok && response.result) {
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            savedRowData: { ...payload.rowData, id: response.result.id },
          })
          queryClient.invalidateQueries({ queryKey: [queryKeyBase] })
          if (hooks?.afterMutation)
            await hooks.afterMutation('create', { payload, result: response.result })
        } else {
          const error = response.result?.error || `Failed to create ${tableName}`
          flash(error, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error,
          } as NewRowSaveErrorEvent)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : `Failed to create ${tableName}`
        flash(errorMessage, 'error')
        dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
          rowIndex: payload.rowIndex,
          error: errorMessage,
        } as NewRowSaveErrorEvent)
      }
    },
    [config.create, hooks, source, tableName, queryClient, queryKeyBase]
  )

  // ── Delete Handler ──

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return

    if (hooks?.beforeDelete) {
      const proceed = await hooks.beforeDelete(pendingDelete)
      if (!proceed) return
    }

    setIsDeleting(true)
    try {
      const deleteId = (pendingDelete as any)[idColumn]
      let deleteUrl: string
      if (typeof config.delete === 'string') {
        deleteUrl = `${config.delete}/${deleteId}`
      } else if (typeof config.delete === 'object' && config.delete.url) {
        const urlConfig = config.delete.url
        deleteUrl = typeof urlConfig === 'function'
          ? urlConfig(pendingDelete)
          : `${urlConfig}/${deleteId}`
      } else {
        deleteUrl = `${source}/${deleteId}`
      }

      const response = await apiCall<{ error?: string }>(deleteUrl, { method: 'DELETE' })

      if (response.ok) {
        flash(`${tableName} deleted`, 'success')
        queryClient.invalidateQueries({ queryKey: [queryKeyBase] })
        setPendingDelete(null)
        if (hooks?.afterMutation) await hooks.afterMutation('delete', { row: pendingDelete })
      } else {
        flash(response.result?.error || `Failed to delete ${tableName}`, 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : `Failed to delete ${tableName}`, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [pendingDelete, hooks, idColumn, config.delete, source, tableName, queryClient, queryKeyBase])

  // ── Perspective Handlers ──

  const handlePerspectiveSave = useCallback(
    async (payload: PerspectiveSaveEvent) => {
      if (!perspectivesTableId) return
      const settings = dynamicTableToApi(payload.perspective)
      const existingPerspective = savedPerspectives.find(
        (p) => p.name === payload.perspective.name
      )
      const response = await apiCall(`/api/perspectives/${perspectivesTableId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existingPerspective?.id,
          name: payload.perspective.name,
          settings,
        }),
      })
      if (response.ok) {
        flash('Perspective saved', 'success')
        queryClient.invalidateQueries({ queryKey: ['perspectives', perspectivesTableId] })
      } else {
        flash('Failed to save perspective', 'error')
      }
    },
    [perspectivesTableId, savedPerspectives, queryClient]
  )

  const handlePerspectiveSelect = useCallback(
    (payload: PerspectiveSelectEvent) => {
      setActivePerspectiveId(payload.id)
      if (payload.config) {
        setFilters(payload.config.filters)
        if (payload.config.sorting.length > 0) {
          setSortField(payload.config.sorting[0].field)
          setSortDir(payload.config.sorting[0].direction)
        }
        setPage(1)
      } else {
        setFilters([])
        setSortField(defaultSort?.field ?? 'id')
        setSortDir(defaultSort?.direction ?? 'asc')
        setPage(1)
      }
    },
    [defaultSort]
  )

  const handlePerspectiveRename = useCallback(
    async (payload: PerspectiveRenameEvent) => {
      if (!perspectivesTableId) return
      const perspective = savedPerspectives.find((p) => p.id === payload.id)
      if (perspective) {
        const settings = dynamicTableToApi(perspective)
        const response = await apiCall(`/api/perspectives/${perspectivesTableId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', perspectivesTableId] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      }
    },
    [perspectivesTableId, savedPerspectives, queryClient]
  )

  const handlePerspectiveDelete = useCallback(
    async (payload: PerspectiveDeleteEvent) => {
      if (!perspectivesTableId) return
      const url = payload.hardDelete
        ? `/api/perspectives/${perspectivesTableId}/${payload.id}?hardDelete=true`
        : `/api/perspectives/${perspectivesTableId}/${payload.id}`
      const response = await apiCall(url, { method: 'DELETE' })
      if (response.ok) {
        flash('Perspective deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['perspectives', perspectivesTableId] })
        if (activePerspectiveId === payload.id) {
          setActivePerspectiveId(null)
          setFilters([])
          setSortField(defaultSort?.field ?? 'id')
          setSortDir(defaultSort?.direction ?? 'asc')
        }
      } else {
        flash('Failed to delete perspective', 'error')
      }
    },
    [perspectivesTableId, activePerspectiveId, queryClient, defaultSort]
  )

  const handlePerspectiveChange = useCallback(
    (payload: PerspectiveChangeEvent) => {
      if (payload.config.sorting) {
        if (payload.config.sorting.length > 0) {
          const firstSort = payload.config.sorting[0]
          setSortField(firstSort.field)
          setSortDir(firstSort.direction)
        } else {
          setSortField(defaultSort?.field ?? 'id')
          setSortDir(defaultSort?.direction ?? 'asc')
        }
        setPage(1)
      }
    },
    [defaultSort]
  )

  // ── Register Event Handlers ──

  const eventHandlers = useMemo(() => {
    const handlers: Record<string, any> = {
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
    }

    if (config.cellEdit !== false) {
      handlers[TableEvents.CELL_EDIT_SAVE] = handleCellEditSave
    }

    if (config.create) {
      handlers[TableEvents.NEW_ROW_SAVE] = handleNewRowSave
    }

    if (perspectivesTableId) {
      handlers[TableEvents.PERSPECTIVE_SAVE] = handlePerspectiveSave
      handlers[TableEvents.PERSPECTIVE_SELECT] = handlePerspectiveSelect
      handlers[TableEvents.PERSPECTIVE_RENAME] = handlePerspectiveRename
      handlers[TableEvents.PERSPECTIVE_DELETE] = handlePerspectiveDelete
      handlers[TableEvents.PERSPECTIVE_CHANGE] = handlePerspectiveChange
    }

    return handlers
  }, [
    config.cellEdit,
    config.create,
    perspectivesTableId,
    handleCellEditSave,
    handleNewRowSave,
    handlePerspectiveSave,
    handlePerspectiveSelect,
    handlePerspectiveRename,
    handlePerspectiveDelete,
    handlePerspectiveChange,
  ])

  useEventHandlers(eventHandlers, tableRef as React.RefObject<HTMLElement>)

  // ── Filter Suggestions ──

  const loadFilterSuggestions = useMemo(() => {
    if (!config.filterSuggestions) return undefined
    const entityType = config.filterSuggestions

    return async (field: string, query: string): Promise<string[]> => {
      try {
        const params = new URLSearchParams({ entityId: entityType, field, query: query || '' })
        const result = await apiCall<{ items: string[] }>(
          `/api/entities/filter-suggestions?${params.toString()}`,
          { credentials: 'include' }
        )
        if (!result.ok || !result.result) return []
        return result.result.items ?? []
      } catch {
        return []
      }
    }
  }, [config.filterSuggestions])

  // ── Build DynamicTable Props ──

  const pagination: PaginationProps = useMemo(
    () => ({
      currentPage: page,
      totalPages: Math.ceil((dataQuery.data?.total || 0) / limit),
      limit,
      limitOptions: [25, 50, 100],
      onPageChange: setPage,
      onLimitChange: (l: number) => {
        setLimit(l)
        setPage(1)
      },
    }),
    [page, limit, dataQuery.data?.total]
  )

  const dynamicTableProps: DynamicTableProps = useMemo(() => {
    const baseProps: DynamicTableProps = {
      tableRef,
      data: tableData,
      columns,
      tableName,
      idColumnName: idColumn,
      colHeaders: true,
      rowHeaders: true,
      stretchColumns: true,
      pagination,
      ...(perspectivesTableId
        ? { savedPerspectives, activePerspectiveId }
        : {}),
      ...(loadFilterSuggestions ? { loadFilterSuggestions } : {}),
      ...config.tableProps,
    }

    return baseProps
  }, [
    tableData,
    columns,
    tableName,
    idColumn,
    pagination,
    perspectivesTableId,
    savedPerspectives,
    activePerspectiveId,
    loadFilterSuggestions,
    config.tableProps,
  ])

  // ── Delete Dialog Component ──

  const deleteConfig = config.delete
  const DeleteDialogComponent: React.FC = useCallback(() => {
    if (!deleteConfig) return null

    const dialogConfig =
      typeof deleteConfig === 'object' && typeof deleteConfig !== 'boolean'
        ? deleteConfig as DynamicTablePageDeleteConfig
        : {}

    return (
      <TableDeleteDialog
        row={pendingDelete}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
        restoreFocusRef={tableRef}
        title={dialogConfig.title}
        description={dialogConfig.description}
        nameColumn={dialogConfig.nameColumn}
      />
    )
  }, [deleteConfig, pendingDelete, isDeleting, handleConfirmDelete])

  return {
    props: dynamicTableProps,
    DeleteDialog: DeleteDialogComponent,
    setRowToDelete: setPendingDelete,
    query: dataQuery,
    isLoading: dataQuery.isLoading && !dataQuery.data,
    refresh: () => queryClient.invalidateQueries({ queryKey: [queryKeyBase] }),
    state: { page, limit, search, filters, sortField, sortDir },
  }
}

