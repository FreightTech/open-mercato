'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2, Plus, FileText, Calendar, Tag, User } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  FilterRow,
  ColumnDef,
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  SortRule,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useTableConfig } from '../../components/useTableConfig'
import { DocumentUploadDialog } from '../../components/DocumentUploadDialog'

interface FmsDocumentRow {
  id: string
  name: string
  category?: string | null
  description?: string | null
  attachmentId: string
  createdBy?: string | null
  createdAt: string
  updatedAt: string
}

// User cache for created by lookup
let cachedUsers: Map<string, string> = new Map()

async function fetchUsers(): Promise<Map<string, string>> {
  if (cachedUsers.size > 0) return cachedUsers
  try {
    const response = await fetch('/api/fms_quotes/entities/users?limit=100')
    const result = await response.json()
    if (result.items) {
      result.items.forEach((u: any) => {
        cachedUsers.set(u.id, u.name || u.email || u.id)
      })
    }
    return cachedUsers
  } catch {
    return cachedUsers
  }
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    offer: 'bg-blue-100 text-blue-800',
    invoice: 'bg-green-100 text-green-800',
    customs: 'bg-purple-100 text-purple-800',
    bill_of_lading: 'bg-orange-100 text-orange-800',
    other: 'bg-gray-100 text-gray-800',
  }
  return colors[category] || 'bg-gray-100 text-gray-800'
}

const CategoryBadgeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const displayValue = value.replace(/_/g, ' ')
  return (
    <span
      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${getCategoryColor(value)}`}
    >
      {displayValue}
    </span>
  )
}

const DownloadLinkRenderer = ({ rowData }: { rowData: FmsDocumentRow }) => {
  if (!rowData.id) return <span>-</span>
  return (
    <a
      href={`/api/fms_documents/documents/${rowData.id}/download`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
      title="Download document"
    >
      <Download className="h-3.5 w-3.5" />
      <span className="text-xs">Download</span>
    </a>
  )
}

const CreatedByRenderer = ({ value }: { value: string | null }) => {
  const [userName, setUserName] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (value) {
      // Check cache first
      if (cachedUsers.has(value)) {
        setUserName(cachedUsers.get(value) || null)
      } else {
        // Fetch users if not cached
        fetchUsers().then(() => {
          setUserName(cachedUsers.get(value) || null)
        })
      }
    }
  }, [value])

  if (!value) return <span className="text-muted-foreground">-</span>
  return <span className="text-sm">{userName || value.slice(0, 8) + '...'}</span>
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  CategoryBadgeRenderer: (value) => <CategoryBadgeRenderer value={value} />,
  DownloadLinkRenderer: (_value, rowData) => <DownloadLinkRenderer rowData={rowData} />,
  CreatedByRenderer: (value) => <CreatedByRenderer value={value} />,
}

function apiToDynamicTable(dto: PerspectiveDto, allColumns: string[]): PerspectiveConfig {
  const { columnOrder = [], columnVisibility = {} } = dto.settings

  const visible =
    columnOrder.length > 0
      ? columnOrder.filter((col) => columnVisibility[col] !== false)
      : allColumns
  const hidden = allColumns.filter((col) => !visible.includes(col))

  const apiFilters = dto.settings.filters as Record<string, unknown> | undefined
  const filters: FilterRow[] = Array.isArray(apiFilters)
    ? (apiFilters as FilterRow[])
    : ((apiFilters?.rows as FilterRow[]) ?? [])
  const color = apiFilters?._color as PerspectiveConfig['color']

  const sorting: SortRule[] = (dto.settings.sorting ?? []).map((s) => ({
    id: s.id,
    field: s.id,
    direction: (s.desc ? 'desc' : 'asc') as 'asc' | 'desc',
  }))

  return { id: dto.id, name: dto.name, color, columns: { visible, hidden }, filters, sorting }
}

function dynamicTableToApi(config: PerspectiveConfig): PerspectiveSettings {
  const columnVisibility: Record<string, boolean> = {}
  config.columns.visible.forEach((col) => (columnVisibility[col] = true))
  config.columns.hidden.forEach((col) => (columnVisibility[col] = false))

  return {
    columnOrder: config.columns.visible,
    columnVisibility,
    filters: { rows: config.filters, _color: config.color },
    sorting: config.sorting.map((s) => ({
      id: s.field,
      desc: s.direction === 'desc',
    })),
  }
}

export default function FmsDocumentsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<FmsDocumentRow | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<FmsDocumentRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  const { data: tableConfig, isLoading: configLoading } = useTableConfig('fms_documents')

  // Pre-fetch users on mount for CreatedBy column
  useEffect(() => {
    fetchUsers()
  }, [])

  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'fms_documents'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/fms_documents')
      return response.ok ? response.result : null
    },
  })

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('search', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))
    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters])

  const { data } = useQuery({
    queryKey: ['fms_documents', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FmsDocumentRow[]; total: number; totalPages?: number }>(
        `/api/fms_documents/documents?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load documents')
      return call.result ?? { items: [], total: 0, totalPages: 1 }
    },
  })

  const tableData = useMemo(() => {
    return data?.items ?? []
  }, [data?.items])

  // Name renderer that opens the detail drawer
  const nameRenderer = useCallback((value: string, rowData: FmsDocumentRow) => {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setSelectedDocument(rowData)
        }}
        className="text-left text-blue-600 hover:text-blue-800 hover:underline truncate max-w-full"
        title={value}
      >
        {value}
      </button>
    )
  }, [])

  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []

    // Add download column after the base columns
    const baseColumns = tableConfig.columns.map((col) => {
      // Make name column clickable
      if (col.data === 'name') {
        return {
          ...col,
          type: col.type === 'checkbox' ? 'boolean' : col.type,
          renderer: nameRenderer,
        }
      }
      return {
        ...col,
        type: col.type === 'checkbox' ? 'boolean' : col.type,
        renderer: col.renderer ? RENDERERS[col.renderer] : undefined,
      }
    }) as ColumnDef[]

    // Add download column
    baseColumns.push({
      data: 'download',
      title: 'Download',
      width: 90,
      readOnly: true,
      renderer: (_value: unknown, rowData: FmsDocumentRow) => <DownloadLinkRenderer rowData={rowData} />,
    })

    return baseColumns
  }, [tableConfig, nameRenderer])

  useEffect(() => {
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, columns])

  const handleDocumentUploaded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fms_documents'] })
    setIsUploadDialogOpen(false)
  }, [queryClient])

  const handleConfirmDelete = useCallback(async () => {
    if (!documentToDelete) return

    setIsDeleting(true)
    const endpoint = `/api/fms_documents/documents/${documentToDelete.id}`

    try {
      const response = await apiCall<{ error?: string }>(endpoint, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Document deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_documents'] })
        setDocumentToDelete(null)
      } else {
        flash(response.result?.error || 'Failed to delete document', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to delete document', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [documentToDelete, queryClient])

  const actionsRenderer = useCallback((rowData: any, _rowIndex: number) => {
    const row = rowData as FmsDocumentRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setDocumentToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        const rowData = tableData[payload.rowIndex] as FmsDocumentRow | undefined
        if (!rowData) return

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        const endpoint = `/api/fms_documents/documents/${payload.id}`

        try {
          const response = await apiCall<{ error?: string }>(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [payload.prop]: payload.newValue }),
          })

          if (response.ok) {
            flash('Document updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
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

      [TableEvents.COLUMN_SORT]: (payload: {
        columnName: string
        direction: 'asc' | 'desc' | null
      }) => {
        setSortField(payload.columnName)
        setSortDir(payload.direction || 'asc')
      },

      [TableEvents.SEARCH]: (payload) => {
        setSearch(payload.query)
        setPage(1)
      },

      [TableEvents.FILTER_CHANGE]: (payload: { filters: FilterRow[] }) => {
        setFilters(payload.filters)
        setPage(1)
      },

      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const settings = dynamicTableToApi(payload.perspective)
        const existingPerspective = savedPerspectives.find(
          (p) => p.name === payload.perspective.name
        )

        try {
          const response = await apiCall<{ id: string }>('/api/perspectives/fms_documents', {
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
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_documents'] })
          } else {
            flash('Failed to save perspective', 'error')
          }
        } catch (error) {
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
        }
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        try {
          const response = await apiCall(`/api/perspectives/fms_documents/${payload.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: payload.newName }),
          })

          if (response.ok) {
            flash('Perspective renamed', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_documents'] })
          } else {
            flash('Failed to rename perspective', 'error')
          }
        } catch (error) {
          flash('Failed to rename perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        try {
          const response = await apiCall(`/api/perspectives/fms_documents/${payload.id}`, {
            method: 'DELETE',
          })

          if (response.ok) {
            flash('Perspective deleted', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_documents'] })
            if (activePerspectiveId === payload.id) {
              setActivePerspectiveId(null)
            }
          } else {
            flash('Failed to delete perspective', 'error')
          }
        } catch (error) {
          flash('Failed to delete perspective', 'error')
        }
      },
    },
    tableRef
  )

  if (configLoading) {
    return <TableSkeleton />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Documents"
          idColumnName="id"
          height="calc(100vh - 110px)"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          actionsRenderer={actionsRenderer}
          uiConfig={{
            hideAddRowButton: true,
            enableFullscreen: true,
            topBarEnd: (
              <Button onClick={() => setIsUploadDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Upload Document
              </Button>
            ),
          }}
          pagination={{
            currentPage: page,
            totalPages: Math.ceil((data?.total || 0) / limit),
            limit,
            limitOptions: [25, 50, 100],
            onPageChange: setPage,
            onLimitChange: (l: number) => {
              setLimit(l)
              setPage(1)
            },
          }}
        />
      </div>

      <DocumentUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        onSuccess={handleDocumentUploaded}
      />

      <Dialog open={!!documentToDelete} onOpenChange={() => setDocumentToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{documentToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Detail Drawer */}
      <Sheet open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Details
            </SheetTitle>
            <SheetDescription>
              View and manage document information
            </SheetDescription>
          </SheetHeader>

          {selectedDocument && (
            <div className="mt-6 space-y-6">
              {/* Document Info */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Name</label>
                  <p className="mt-1 text-sm font-medium">{selectedDocument.name}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Category
                  </label>
                  <div className="mt-1">
                    {selectedDocument.category ? (
                      <CategoryBadgeRenderer value={selectedDocument.category} />
                    ) : (
                      <span className="text-sm text-muted-foreground">Not categorized</span>
                    )}
                  </div>
                </div>

                {selectedDocument.description && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase">Description</label>
                    <p className="mt-1 text-sm">{selectedDocument.description}</p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Created By
                  </label>
                  <p className="mt-1 text-sm">
                    <CreatedByRenderer value={selectedDocument.createdBy || null} />
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created
                    </label>
                    <p className="mt-1 text-sm">
                      {new Date(selectedDocument.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Updated
                    </label>
                    <p className="mt-1 text-sm">
                      {new Date(selectedDocument.updatedAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t pt-4 space-y-3">
                <Button
                  className="w-full"
                  onClick={() => {
                    window.open(`/api/fms_documents/documents/${selectedDocument.id}/download`, '_blank')
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Document
                </Button>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    setSelectedDocument(null)
                    setDocumentToDelete(selectedDocument)
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Document
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
