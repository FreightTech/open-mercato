'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
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
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type DefinitionInfo = {
  id: string
  name: string
  worksheetName: string
  hasHeaderRow: boolean
  columnConfig: Record<string, { title?: string; type?: string; width?: number; readOnly?: boolean }> | null
}

type ReadResponse = {
  headers: string[]
  rows: Array<Array<string | number | boolean | null>>
  total: number
  page: number
  pageSize: number
  totalPages: number
  definition: DefinitionInfo
}

export default function TableViewerPage({ params }: { params?: { id?: string } }) {
  const router = useRouter()
  const t = useT()
  const tableRef = useRef<HTMLDivElement>(null)
  const definitionId = params?.id || ''

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [definition, setDefinition] = useState<DefinitionInfo | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const loadData = useCallback(async (silent = false) => {
    if (!definitionId) return
    if (!silent) {
      setIsLoading(true)
      setError(null)
    }

    try {
      const result = await apiCall<ReadResponse>(
        `/api/tables/data/read?definitionId=${encodeURIComponent(definitionId)}&page=1&pageSize=100`
      )

      if (!result.ok || !result.result) {
        const errorPayload = result.result as { error?: string } | undefined
        setError(typeof errorPayload?.error === 'string' ? errorPayload.error : 'Failed to load table data')
        return
      }

      const data = result.result
      setDefinition(data.definition)
      setHeaders(data.headers)
      setTotal(data.total)

      const rows = data.rows.map((row, rowIndex) => {
        const rowObj: Record<string, unknown> = { _rowIndex: rowIndex }
        data.headers.forEach((header, colIndex) => {
          rowObj[header] = row[colIndex] ?? ''
        })
        return rowObj
      })

      setTableData(rows)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load table data'
      setError(message)
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [definitionId])

  useEffect(() => {
    loadData()
  }, [loadData])


  const columns = useMemo((): ColumnDef[] => {
    if (headers.length === 0) return []

    return headers.map((header) => {
      const config = definition?.columnConfig?.[header]
      return {
        data: header,
        title: config?.title || header,
        width: config?.width || 150,
        type: (config?.type as ColumnDef['type']) || 'text',
        readOnly: config?.readOnly ?? false,
      } as ColumnDef
    })
  }, [headers, definition])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const result = await apiCall<{ ok?: boolean; error?: string }>(
            '/api/tables/data/write',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                definitionId,
                row: payload.rowIndex,
                col: payload.colIndex,
                value: payload.newValue,
              }),
            }
          )

          if (result.ok) {
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            // Refetch data to sync with Excel
            loadData(true)
          } else {
            const errorMsg = (result.result as { error?: string })?.error || 'Write failed'
            flash(errorMsg, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
              error: errorMsg,
            } as CellSaveErrorEvent)
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (isLoading && !definition) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage />
        </PageBody>
      </Page>
    )
  }

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage message={error} />
          <div className="mt-4">
            <Button variant="outline" onClick={() => router.push('/backend/tables')}>
              {t('tables.viewer.backToList', 'Back to Tables')}
            </Button>
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{definition?.name || t('tables.viewer.title', 'Table Viewer')}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('tables.viewer.worksheet', 'Worksheet')}: {definition?.worksheetName}
                {total > 0 && ` · ${total} ${t('tables.viewer.rows', 'rows')}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => loadData()}>
                {t('tables.viewer.refresh', 'Refresh')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push('/backend/tables')}>
                {t('tables.viewer.backToList', 'Back')}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <TableSkeleton rows={5} columns={Math.min(headers.length || 6, 10)} />
          ) : tableData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">{t('tables.viewer.noData', 'No data in this worksheet.')}</p>
              <p className="text-sm mt-1">{t('tables.viewer.noDataHint', 'Add some data to the Excel file and click Refresh.')}</p>
            </div>
          ) : (
            <DynamicTable
              tableRef={tableRef}
              data={tableData}
              columns={columns}
              tableName={definition?.name || 'Excel Table'}
              height="calc(100vh - 250px)"
              colHeaders={true}
              rowHeaders={true}
              uiConfig={{
                hideToolbar: true,
                hideSearch: true,
                hideFilterButton: true,
                hideAddRowButton: true,
                hideBottomBar: true,
              }}
            />
          )}
        </div>
      </PageBody>
    </Page>
  )
}
