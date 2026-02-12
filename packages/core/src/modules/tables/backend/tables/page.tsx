'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@open-mercato/ui/primitives/button'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { apiCall, apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type TableRow = {
  id: string
  name: string
  filePath: string | null
  worksheetName: string
  hasHeaderRow: boolean
  isActive: boolean
  createdAt: string | null
}

type ListResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
}

function mapApiItem(item: Record<string, unknown>): TableRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null
  return {
    id,
    name: typeof item.name === 'string' ? item.name : '',
    filePath: typeof item.filePath === 'string' ? item.filePath : null,
    worksheetName: typeof item.worksheetName === 'string' ? item.worksheetName : '',
    hasHeaderRow: typeof item.hasHeaderRow === 'boolean' ? item.hasHeaderRow : true,
    isActive: typeof item.isActive === 'boolean' ? item.isActive : true,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

export default function TablesListPage() {
  const [rows, setRows] = React.useState<TableRow[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(20)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(true)
  const [reloadToken, setReloadToken] = React.useState(0)
  const scopeVersion = useOrganizationScopeVersion()
  const t = useT()
  const router = useRouter()

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (search.trim()) params.set('search', search.trim())
    return params.toString()
  }, [page, pageSize, search])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      try {
        const fallback: ListResponse = { items: [], total: 0, totalPages: 1 }
        const call = await apiCall<ListResponse>(`/api/tables/definitions?${queryParams}`, undefined, { fallback })
        if (!call.ok) {
          const errorPayload = call.result as { error?: string } | undefined
          const message = typeof errorPayload?.error === 'string' ? errorPayload.error : t('tables.list.error.load', 'Failed to load tables')
          flash(message, 'error')
          return
        }
        const payload = call.result ?? fallback
        if (cancelled) return
        const items = Array.isArray(payload.items) ? payload.items : []
        setRows(items.map((item) => mapApiItem(item as Record<string, unknown>)).filter((row): row is TableRow => !!row))
        setTotal(typeof payload.total === 'number' ? payload.total : items.length)
        setTotalPages(typeof payload.totalPages === 'number' ? payload.totalPages : 1)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : t('tables.list.error.load', 'Failed to load tables')
          flash(message, 'error')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [queryParams, reloadToken, scopeVersion, t])

  const handleRefresh = React.useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  const handleDelete = React.useCallback(async (row: TableRow) => {
    if (!row?.id) return
    const confirmed = window.confirm(t('tables.list.deleteConfirm', 'Are you sure you want to delete "{name}"?', { name: row.name }))
    if (!confirmed) return
    try {
      await apiCallOrThrow(
        `/api/tables/definitions?id=${encodeURIComponent(row.id)}`,
        {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
        },
        { errorMessage: t('tables.list.deleteError', 'Failed to delete table.') },
      )
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setTotal((prev) => Math.max(prev - 1, 0))
      handleRefresh()
      flash(t('tables.list.deleteSuccess', 'Table deleted.'), 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('tables.list.deleteError', 'Failed to delete table.')
      flash(message, 'error')
    }
  }, [handleRefresh, t])

  const columns = React.useMemo<ColumnDef<TableRow>[]>(() => {
    const noValue = <span className="text-muted-foreground text-sm">-</span>

    return [
      {
        accessorKey: 'name',
        header: t('tables.list.columns.name', 'Name'),
        cell: ({ row }) => (
          <Link href={`/backend/tables/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'filePath',
        header: t('tables.list.columns.file', 'File'),
        cell: ({ row }) => row.original.filePath || noValue,
      },
      {
        accessorKey: 'worksheetName',
        header: t('tables.list.columns.worksheet', 'Worksheet'),
        cell: ({ row }) => row.original.worksheetName || noValue,
      },
      {
        accessorKey: 'createdAt',
        header: t('tables.list.columns.created', 'Created'),
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
    ]
  }, [t])

  return (
    <Page>
      <PageBody>
        <DataTable<TableRow>
          title={t('tables.list.title', 'Tables')}
          refreshButton={{
            label: t('tables.list.actions.refresh', 'Refresh'),
            onRefresh: () => { setSearch(''); setPage(1); handleRefresh() },
          }}
          actions={(
            <Button asChild>
              <Link href="/backend/tables/create">
                {t('tables.list.actions.new', 'New Table')}
              </Link>
            </Button>
          )}
          columns={columns}
          data={rows}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          searchPlaceholder={t('tables.list.searchPlaceholder', 'Search tables...')}
          onRowClick={(row) => router.push(`/backend/tables/${row.id}`)}
          rowActions={(row) => (
            <RowActions
              items={[
                {
                  id: 'view',
                  label: t('tables.list.actions.view', 'Open'),
                  onSelect: () => { router.push(`/backend/tables/${row.id}`) },
                },
                {
                  id: 'delete',
                  label: t('tables.list.actions.delete', 'Delete'),
                  destructive: true,
                  onSelect: () => handleDelete(row),
                },
              ]}
            />
          )}
          pagination={{ page, pageSize, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
      </PageBody>
    </Page>
  )
}
