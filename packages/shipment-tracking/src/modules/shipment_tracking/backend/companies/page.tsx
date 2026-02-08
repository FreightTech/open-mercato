"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type CompanyRow = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string | null
}

type ListResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
}

function mapItem(item: Record<string, unknown>): CompanyRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null

  return {
    id,
    name: (item.name as string) ?? '',
    description: (item.description as string) ?? null,
    isActive: item.isActive === true,
    createdAt: (item.createdAt as string) ?? null,
  }
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

let deleteHandlerRef: ((id: string) => void) | null = null

function setDeleteHandler(handler: ((id: string) => void) | null) {
  deleteHandlerRef = handler
}

const ActionsCell = ({ id }: { id: string }) => {
  if (!id) return null
  const items: RowActionItem[] = [
    {
      label: 'Delete',
      onSelect: () => deleteHandlerRef?.(id),
      destructive: true,
    },
  ]
  return <RowActions items={items} />
}

export default function CompaniesPage() {
  const t = useT()
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [rows, setRows] = React.useState<CompanyRow[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (search) params.set('search', search)

      const { result } = await apiCallOrThrow<ListResponse>(
        `/api/shipment_tracking/companies?${params.toString()}`,
      )

      setRows((result?.items ?? []).map(mapItem).filter((x): x is CompanyRow => x !== null))
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    } catch {
      flash('Failed to load companies', 'error')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize, search])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDelete = React.useCallback(
    async (id: string) => {
      if (!confirm('Delete this company?')) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/companies', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash('Company deleted', 'success')
        fetchData()
      } catch {
        flash('Failed to delete company', 'error')
      }
    },
    [fetchData],
  )

  React.useEffect(() => {
    setDeleteHandler(handleDelete)
    return () => setDeleteHandler(null)
  }, [handleDelete])

  const columns = React.useMemo<ColumnDef[]>(
    () => [
      {
        data: 'name',
        title: t('shipment_tracking.companies.fields.name', 'Name'),
        width: 250,
        renderer: (value: unknown) => (
          <span className="font-medium">{String(value ?? '')}</span>
        ),
      },
      {
        data: 'description',
        title: t('shipment_tracking.companies.fields.description', 'Description'),
        width: 350,
        renderer: (value: unknown) => (
          <span className="text-sm text-muted-foreground">{value ? String(value) : '-'}</span>
        ),
      },
      {
        data: 'isActive',
        title: t('shipment_tracking.companies.fields.isActive', 'Active'),
        width: 80,
        readOnly: true,
        renderer: (value: unknown) => <BooleanIcon value={value === true || value === 'true'} />,
      },
      {
        data: 'createdAt',
        title: t('shipment_tracking.companies.fields.createdAt', 'Created'),
        width: 120,
        readOnly: true,
        renderer: (value: unknown) => formatDate(value as string | null),
      },
    ],
    [t],
  )

  const tableData = React.useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        isActive: row.isActive,
        createdAt: row.createdAt ?? '',
      })),
    [rows],
  )

  const actionsRenderer = React.useCallback(
    (rowData: { id: string }) => {
      if (!rowData?.id) return null
      return <ActionsCell id={rowData.id} />
    },
    [],
  )

  useEventHandlers(
    {
      [TableEvents.SEARCH]: (payload: { query: string }) => {
        setSearch(payload.query)
        setPage(1)
      },
      [TableEvents.NEW_ROW_SAVE]: async (payload: { rowIndex: number; rowData: Record<string, unknown> }) => {
        const element = tableRef.current
        if (!element) return

        dispatch(element, TableEvents.NEW_ROW_SAVE_START, { rowIndex: payload.rowIndex })

        const name = typeof payload.rowData.name === 'string' ? payload.rowData.name.trim() : ''
        if (!name) {
          dispatch(element, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: 'Company name is required',
          })
          flash('Company name is required', 'error')
          return
        }

        try {
          const { result } = await apiCallOrThrow<Record<string, unknown>>(
            '/api/shipment_tracking/companies',
            {
              method: 'POST',
              body: JSON.stringify({
                name,
                description: typeof payload.rowData.description === 'string' && payload.rowData.description.trim()
                  ? payload.rowData.description.trim()
                  : undefined,
              }),
            },
          )

          dispatch(element, TableEvents.NEW_ROW_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            savedRowData: result,
          })
          flash('Company created', 'success')
          fetchData()
        } catch {
          dispatch(element, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: 'Failed to create company',
          })
          flash('Failed to create company', 'error')
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>,
  )

  const tableHeight = React.useMemo(() => {
    const rowH = 40
    const headerH = 40
    const toolbarH = 50
    const minHeight = 300
    const maxHeight = 700
    const contentHeight = toolbarH + headerH + tableData.length * rowH + 20
    return Math.min(Math.max(contentHeight, minHeight), maxHeight)
  }, [tableData.length])

  return (
    <Page>
      <PageBody>
        <div style={{ height: tableHeight }}>
          <DynamicTable
            tableRef={tableRef}
            data={tableData}
            columns={columns}
            tableName={t('shipment_tracking.companies.title', 'Companies')}
            idColumnName="id"
            width="100%"
            height="100%"
            colHeaders={true}
            rowHeaders={false}
            stretchColumns={true}
            actionsRenderer={actionsRenderer}
            pagination={{
              currentPage: page,
              totalPages,
              limit: pageSize,
              onPageChange: setPage,
              onLimitChange: (limit: number) => {
                setPageSize(limit)
                setPage(1)
              },
            }}
            uiConfig={{
              readOnlyStyle: 'normal',
              hideFilterButton: true,
              hideAddRowButton: false,
              hideBottomBar: true,
            }}
            emptyMessage="No companies found. Add a company to associate carrier configs."
          />
        </div>
      </PageBody>
    </Page>
  )
}
