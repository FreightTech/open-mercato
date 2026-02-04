'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
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
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type SopCommentCategory = 'general' | 'financial' | 'operations' | 'compliance'

type SopComment = {
  id: string
  category: SopCommentCategory
  body: string
  authorUserId?: string | null
  authorName?: string | null
  createdAt: string
  updatedAt: string
}

type SopCommentsResponse = {
  items?: SopComment[]
  total?: number
}

type ContractorSopSectionProps = {
  contractorId: string
}

const CATEGORIES = ['general', 'financial', 'operations', 'compliance'] as const

export function ContractorSopSection({ contractorId }: ContractorSopSectionProps) {
  const t = useT()
  const tableRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contractor-sop-comments', contractorId],
    queryFn: async () => {
      const response = await apiCall<SopCommentsResponse>(
        `/api/contractors/sop-comments?contractorId=${contractorId}`
      )
      if (!response.ok) throw new Error('Failed to load SOP comments')
      return response.result?.items ?? []
    },
    enabled: !!contractorId,
  })

  const comments = data ?? []

  // Format date for display (short format)
  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }, [])

  // Table columns definition
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'body',
      title: t('contractors.sop.comment', 'Comment'),
      width: 600,
      type: 'text',
    },
    {
      data: 'category',
      title: t('contractors.sop.category', 'Category'),
      width: 80,
      type: 'dropdown',
      source: [...CATEGORIES],
    },
    {
      data: 'authorName',
      title: t('contractors.sop.author', 'Author'),
      width: 50,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'createdAt',
      title: t('contractors.sop.date', 'Date'),
      width: 50,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => {
        if (!value) return ''
        return <span className="text-muted-foreground">{formatDate(String(value))}</span>
      },
    },
  ], [t, formatDate])

  // Table data
  const tableData = useMemo(() => {
    return comments.map(comment => ({
      id: comment.id,
      body: comment.body,
      category: comment.category,
      authorName: comment.authorName ?? '',
      createdAt: comment.createdAt,
    }))
  }, [comments])

  // Handle cell edit save
  const handleCellSave = useCallback(async (payload: CellEditSaveEvent) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex: payload.rowIndex,
      colIndex: payload.colIndex,
    } as CellSaveStartEvent)

    try {
      const response = await apiCall('/api/contractors/sop-comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payload.id,
          [payload.prop]: payload.newValue === '' ? null : payload.newValue,
        }),
      })

      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Update failed'
        throw new Error(errorMsg)
      }

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
      } as CellSaveSuccessEvent)

      refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed'
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
        error: errorMessage,
      } as CellSaveErrorEvent)
      flash(errorMessage, 'error')
    }
  }, [refetch])

  // Handle new row save
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, {
      rowIndex: payload.rowIndex,
    })

    try {
      const response = await apiCall('/api/contractors/sop-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          body: payload.rowData.body || null,
          category: payload.rowData.category || 'general',
        }),
      })

      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to save'
        throw new Error(errorMsg)
      }

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex: payload.rowIndex,
        savedRowData: response.result,
      } as NewRowSaveSuccessEvent)

      flash(t('contractors.sop.created', 'Comment added'), 'success')
      refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex: payload.rowIndex,
        error: errorMessage,
      } as NewRowSaveErrorEvent)
      flash(errorMessage, 'error')
    }
  }, [contractorId, refetch, t])

  // Event handlers for DynamicTable
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: handleCellSave,
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Generate key to force re-render when data changes
  const tableKey = useMemo(() => {
    if (comments.length === 0) return 'empty'
    return `sop-comments-${comments.map(c => `${c.id}-${c.body?.substring(0, 10)}`).join('-')}`
  }, [comments])

  // Calculate dynamic height based on number of rows
  const tableHeight = useMemo(() => {
    const rowHeight = 40
    const headerHeight = 40
    const toolbarHeight = 40
    const minHeight = 160
    const maxHeight = 500
    const contentHeight = toolbarHeight + headerHeight + (tableData.length * rowHeight) + 10
    return Math.min(Math.max(contentHeight, minHeight), maxHeight)
  }, [tableData.length])

  if (isLoading) {
    return (
      <div style={{ height: 120 }}>
        <DynamicTable
          tableRef={tableRef}
          data={[]}
          columns={columns}
          tableName={t('contractors.sop.title', 'SOP')}
          idColumnName="id"
          width="100%"
          height="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          uiConfig={{
            hideToolbar: false,
            hideSearch: true,
            hideFilterButton: true,
            hideAddRowButton: false,
            hideBottomBar: true,
            hideActionsColumn: false,
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        key={tableKey}
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName={t('contractors.sop.title', 'SOP')}
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideToolbar: false,
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: false,
          hideBottomBar: true,
          hideActionsColumn: false,
        }}
      />
    </div>
  )
}
