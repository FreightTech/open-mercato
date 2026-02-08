"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import {
  DynamicTable,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Textarea } from '@open-mercato/ui/primitives/textarea'

type CarrierConfigRow = {
  id: string
  carrierName: string
  companyName: string | null
  apiEndpoint: string | null
  authConfig: Record<string, unknown> | null
  rateLimitRequests: number
  rateLimitWindowSeconds: number
  isActive: boolean
  createdAt: string | null
}

type ListResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
}

function mapItem(item: Record<string, unknown>): CarrierConfigRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null

  return {
    id,
    carrierName: (item.carrierName as string) ?? '',
    companyName: (item.companyName as string) ?? null,
    apiEndpoint: (item.apiEndpoint as string) ?? null,
    authConfig: (item.authConfig as Record<string, unknown>) ?? null,
    rateLimitRequests: typeof item.rateLimitRequests === 'number' ? item.rateLimitRequests : 60,
    rateLimitWindowSeconds: typeof item.rateLimitWindowSeconds === 'number' ? item.rateLimitWindowSeconds : 60,
    isActive: item.isActive === true,
    createdAt: (item.createdAt as string) ?? null,
  }
}

type FormState = {
  carrierName: string
  companyName: string
  apiEndpoint: string
  authConfig: string
  rateLimitRequests: number
  rateLimitWindowSeconds: number
  isActive: boolean
}

const emptyForm: FormState = {
  carrierName: '',
  companyName: '',
  apiEndpoint: '',
  authConfig: '',
  rateLimitRequests: 60,
  rateLimitWindowSeconds: 60,
  isActive: true,
}

function rowToForm(row: CarrierConfigRow): FormState {
  return {
    carrierName: row.carrierName,
    companyName: row.companyName ?? '',
    apiEndpoint: row.apiEndpoint ?? '',
    authConfig: row.authConfig ? JSON.stringify(row.authConfig, null, 2) : '',
    rateLimitRequests: row.rateLimitRequests,
    rateLimitWindowSeconds: row.rateLimitWindowSeconds,
    isActive: row.isActive,
  }
}

let deleteHandlerRef: ((id: string) => void) | null = null
let editHandlerRef: ((id: string) => void) | null = null

function setDeleteHandler(handler: ((id: string) => void) | null) {
  deleteHandlerRef = handler
}

function setEditHandler(handler: ((id: string) => void) | null) {
  editHandlerRef = handler
}

const ActionsCell = ({ id }: { id: string }) => {
  if (!id) return null
  const items: RowActionItem[] = [
    {
      label: 'Edit',
      onSelect: () => editHandlerRef?.(id),
    },
    {
      label: 'Delete',
      onSelect: () => deleteHandlerRef?.(id),
      destructive: true,
    },
  ]
  return <RowActions items={items} />
}

export default function CarrierConfigsPage() {
  const t = useT()
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [rows, setRows] = React.useState<CarrierConfigRow[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(false)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = React.useState(false)
  const [companies, setCompanies] = React.useState<Array<{ name: string }>>([])

  const isEdit = editingId !== null

  React.useEffect(() => {
    async function loadCompanies() {
      try {
        const { result } = await apiCallOrThrow<ListResponse>(
          '/api/shipment_tracking/companies?pageSize=100',
        )
        const items = (result?.items ?? [])
          .map((item) => ({ name: typeof item.name === 'string' ? item.name : '' }))
          .filter((item) => item.name)
        setCompanies(items)
      } catch {
        // silently fail — the select will just be empty
      }
    }
    loadCompanies()
  }, [])

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })

      const { result } = await apiCallOrThrow<ListResponse>(
        `/api/shipment_tracking/carrier-configs?${params.toString()}`,
      )

      setRows((result?.items ?? []).map(mapItem).filter((x): x is CarrierConfigRow => x !== null))
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    } catch {
      flash('Failed to load carrier configs', 'error')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const openCreateDialog = React.useCallback(() => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }, [])

  const openEditDialog = React.useCallback(
    (id: string) => {
      const row = rows.find((r) => r.id === id)
      if (!row) return
      setEditingId(id)
      setForm(rowToForm(row))
      setDialogOpen(true)
    },
    [rows],
  )

  const handleSubmit = React.useCallback(async () => {
    if (submitting) return

    if (!isEdit && !form.carrierName.trim()) {
      flash('Carrier name is required', 'error')
      return
    }

    if (form.authConfig.trim()) {
      try {
        JSON.parse(form.authConfig)
      } catch {
        flash('Auth config must be valid JSON', 'error')
        return
      }
    }

    if (form.apiEndpoint.trim()) {
      try {
        new URL(form.apiEndpoint.trim())
      } catch {
        flash('API endpoint must be a valid URL', 'error')
        return
      }
    }

    setSubmitting(true)
    try {
      const authConfig = form.authConfig.trim() ? JSON.parse(form.authConfig) : undefined

      if (isEdit) {
        const body: Record<string, unknown> = { id: editingId }
        if (form.companyName.trim()) body.companyName = form.companyName.trim()
        else body.companyName = null
        if (form.apiEndpoint.trim()) body.apiEndpoint = form.apiEndpoint.trim()
        else body.apiEndpoint = null
        body.authConfig = authConfig ?? null
        body.rateLimitRequests = form.rateLimitRequests
        body.rateLimitWindowSeconds = form.rateLimitWindowSeconds
        body.isActive = form.isActive

        await apiCallOrThrow('/api/shipment_tracking/carrier-configs', {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        flash('Carrier config updated', 'success')
      } else {
        const body: Record<string, unknown> = {
          carrierName: form.carrierName.trim(),
          rateLimitRequests: form.rateLimitRequests,
          rateLimitWindowSeconds: form.rateLimitWindowSeconds,
          isActive: form.isActive,
        }
        if (form.companyName.trim()) body.companyName = form.companyName.trim()
        if (form.apiEndpoint.trim()) body.apiEndpoint = form.apiEndpoint.trim()
        if (authConfig) body.authConfig = authConfig

        await apiCallOrThrow('/api/shipment_tracking/carrier-configs', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        flash('Carrier config created', 'success')
      }

      setDialogOpen(false)
      fetchData()
    } catch {
      flash(isEdit ? 'Failed to update carrier config' : 'Failed to create carrier config', 'error')
    } finally {
      setSubmitting(false)
    }
  }, [form, isEdit, editingId, submitting, fetchData])

  const handleDialogKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleDelete = React.useCallback(
    async (id: string) => {
      if (!confirm('Delete this carrier config?')) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/carrier-configs', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash('Carrier config deleted', 'success')
        fetchData()
      } catch {
        flash('Failed to delete carrier config', 'error')
      }
    },
    [fetchData],
  )

  React.useEffect(() => {
    setDeleteHandler(handleDelete)
    setEditHandler(openEditDialog)
    return () => {
      setDeleteHandler(null)
      setEditHandler(null)
    }
  }, [handleDelete, openEditDialog])

  const columns = React.useMemo<ColumnDef[]>(
    () => [
      {
        data: 'carrierName',
        title: t('shipment_tracking.carrier_configs.fields.carrierName', 'Carrier Name'),
        width: 150,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-medium">{String(value ?? '')}</span>
        ),
      },
      {
        data: 'companyName',
        title: t('shipment_tracking.carrier_configs.fields.companyName', 'Company'),
        width: 160,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="text-sm text-muted-foreground">{value ? String(value) : '-'}</span>
        ),
      },
      {
        data: 'apiEndpoint',
        title: t('shipment_tracking.carrier_configs.fields.apiEndpoint', 'API Endpoint'),
        width: 280,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="text-sm truncate max-w-[260px] block">{String(value || '-')}</span>
        ),
      },
      {
        data: 'rateLimit',
        title: 'Rate Limit',
        width: 120,
        readOnly: true,
        renderer: (_value: unknown, rowData: Record<string, unknown>) => (
          <span className="text-sm">
            {String(rowData.rateLimitRequests ?? 60)} / {String(rowData.rateLimitWindowSeconds ?? 60)}s
          </span>
        ),
      },
      {
        data: 'isActive',
        title: t('shipment_tracking.carrier_configs.fields.isActive', 'Active'),
        width: 80,
        readOnly: true,
        renderer: (value: unknown) => <BooleanIcon value={value === true || value === 'true'} />,
      },
    ],
    [t],
  )

  const tableData = React.useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        carrierName: row.carrierName,
        companyName: row.companyName ?? '',
        apiEndpoint: row.apiEndpoint ?? '',
        rateLimitRequests: row.rateLimitRequests,
        rateLimitWindowSeconds: row.rateLimitWindowSeconds,
        isActive: row.isActive,
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

  useEventHandlers({}, tableRef as React.RefObject<HTMLElement>)

  const tableHeight = React.useMemo(() => {
    const rowH = 40
    const headerH = 40
    const toolbarH = 50
    const minHeight = 300
    const maxHeight = 700
    const contentHeight = toolbarH + headerH + tableData.length * rowH + 20
    return Math.min(Math.max(contentHeight, minHeight), maxHeight)
  }, [tableData.length])

  const addButton = React.useMemo(
    () => (
      <Button size="sm" onClick={openCreateDialog}>
        Add Config
      </Button>
    ),
    [openCreateDialog],
  )

  return (
    <Page>
      <PageBody>
        <div style={{ height: tableHeight }}>
          <DynamicTable
            tableRef={tableRef}
            data={tableData}
            columns={columns}
            tableName={t('shipment_tracking.carrier_configs.title', 'Carrier Configs')}
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
              hideAddRowButton: true,
              hideBottomBar: true,
              topBarEnd: addButton,
            }}
            emptyMessage="No carrier configs found."
          />
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg" onKeyDown={handleDialogKeyDown}>
            <DialogHeader>
              <DialogTitle>{isEdit ? 'Edit Carrier Config' : 'Add Carrier Config'}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="carrierName">Carrier Name</Label>
                <Input
                  id="carrierName"
                  value={form.carrierName}
                  onChange={(event) => setForm((prev) => ({ ...prev, carrierName: event.target.value }))}
                  placeholder="e.g. MAERSK, MSC, CMA-CGM"
                  disabled={isEdit}
                  autoFocus={!isEdit}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="companyName">Company</Label>
                <select
                  id="companyName"
                  className="w-full h-9 rounded border px-2 text-sm bg-background"
                  value={form.companyName}
                  onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
                  autoFocus={isEdit}
                >
                  <option value="">— None —</option>
                  {companies.map((company) => (
                    <option key={company.name} value={company.name}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apiEndpoint">API Endpoint</Label>
                <Input
                  id="apiEndpoint"
                  value={form.apiEndpoint}
                  onChange={(event) => setForm((prev) => ({ ...prev, apiEndpoint: event.target.value }))}
                  placeholder="https://api.example.com/tracking"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="authConfig">Auth Config (JSON)</Label>
                <Textarea
                  id="authConfig"
                  value={form.authConfig}
                  onChange={(event) => setForm((prev) => ({ ...prev, authConfig: event.target.value }))}
                  placeholder='{"apiKey": "..."}'
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="rateLimitRequests">Rate Limit (requests)</Label>
                  <Input
                    id="rateLimitRequests"
                    type="number"
                    min={1}
                    max={10000}
                    value={form.rateLimitRequests}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, rateLimitRequests: Number(event.target.value) || 60 }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rateLimitWindowSeconds">Window (seconds)</Label>
                  <Input
                    id="rateLimitWindowSeconds"
                    type="number"
                    min={1}
                    max={86400}
                    value={form.rateLimitWindowSeconds}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, rateLimitWindowSeconds: Number(event.target.value) || 60 }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isActive: checked === true }))
                  }
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Saving...' : isEdit ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
