"use client"
import * as React from 'react'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import Link from 'next/link'
import BatchUploadDialog from '../components/BatchUploadDialog'

interface ShipmentItem {
  id: string
  status: 'uploading' | 'parsing' | 'ready' | 'error'
  blNumber: string | null
  invoiceNumber: string | null
  shipperName: string | null
  consigneeName: string | null
  loadingPort: string | null
  dischargePort: string | null
  vessel: string | null
  createdAt: string
}

interface ShipmentListResponse {
  items: ShipmentItem[]
  total: number
  page: number
  pageSize: number
}

const statusColors: Record<string, string> = {
  uploading: 'bg-muted text-muted-foreground',
  parsing: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  ready: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-destructive',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  )
}

function UploadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [files, setFiles] = React.useState<{ bl?: File; invoice?: File; packingList?: File }>({})
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleUpload = async () => {
    if (!files.bl || !files.invoice || !files.packingList) {
      setError('All three files are required')
      return
    }

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('bl', files.bl)
    formData.append('invoice', files.invoice)
    formData.append('packingList', files.packingList)

    try {
      const response = await fetch('/api/customs/customs/shipments', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (data.ok) {
        onCreated(data.id)
      } else {
        setError(data.error || 'Upload failed')
      }
    } catch {
      setError('Upload failed — check your connection')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-lg p-6 w-full max-w-md" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground mb-4">New Clearance Case</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bill of Lading / Sea Waybill</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(event) => setFiles((prev) => ({ ...prev, bl: event.target.files?.[0] }))}
              className="block w-full text-sm border border-border rounded p-1.5 bg-background text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Commercial Invoice</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(event) => setFiles((prev) => ({ ...prev, invoice: event.target.files?.[0] }))}
              className="block w-full text-sm border border-border rounded p-1.5 bg-background text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Packing List</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(event) => setFiles((prev) => ({ ...prev, packingList: event.target.files?.[0] }))}
              className="block w-full text-sm border border-border rounded p-1.5 bg-background text-foreground"
            />
          </div>
        </div>

        {error && <p className="text-destructive text-sm mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload & Process'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CustomsListPage() {
  const [data, setData] = React.useState<ShipmentListResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [showUpload, setShowUpload] = React.useState(false)
  const [showBatch, setShowBatch] = React.useState(false)
  const [deleting, setDeleting] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const { ok, result } = await apiCall<ShipmentListResponse>('/api/customs/customs/shipments')
      if (ok && result) setData(result)
    } catch {
      // handled by apiCall
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this clearance case? This action cannot be undone.')) return
    setDeleting(id)
    try {
      const { ok } = await apiCall(`/api/customs/customs/shipments/${id}`, { method: 'DELETE' })
      if (ok) {
        loadData()
      }
    } catch {
      // handled by apiCall
    } finally {
      setDeleting(null)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Customs Clearance"
        description="Upload shipping documents, check consistency, and classify HS codes."
      />
      <PageBody>
        <div className="mb-4 flex justify-end gap-2">
          <button
            onClick={() => setShowBatch(true)}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90"
          >
            Batch Upload
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 bg-primary/80 text-primary-foreground text-sm rounded-md hover:bg-primary/70"
          >
            New Clearance
          </button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {!loading && data && (
          <div className="rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                 <tr className="border-b border-border bg-muted/30">
                   <th className="text-left px-3 py-2 font-medium text-foreground">Case</th>
                   <th className="text-left px-3 py-2 font-medium text-foreground">Shipper / Consignee</th>
                   <th className="text-left px-3 py-2 font-medium text-foreground">Route</th>
                   <th className="text-left px-3 py-2 font-medium text-foreground">Status</th>
                   <th className="text-left px-3 py-2 font-medium text-foreground">Created</th>
                   <th className="text-right px-3 py-2 font-medium text-foreground">Actions</th>
                 </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                   <tr>
                     <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                       No clearance cases yet. Click &quot;New Clearance&quot; to start.
                     </td>
                   </tr>
                 )}
                {data.items.map((item) => (
                  <tr key={item.id} className="border-b border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={`/backend/customs/${item.id}`} className="text-primary hover:underline font-mono text-xs">
                        {item.blNumber ?? item.invoiceNumber ?? item.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      <div>{item.shipperName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{item.consigneeName ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground">
                      {item.loadingPort ?? '—'} &rarr; {item.dischargePort ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                       {new Date(item.createdAt).toLocaleDateString()}
                     </td>
                     <td className="px-3 py-2 text-right">
                       <button
                         onClick={(event) => { event.preventDefault(); handleDelete(item.id) }}
                         disabled={deleting === item.id}
                         className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
                       >
                         {deleting === item.id ? 'Deleting...' : 'Delete'}
                       </button>
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showUpload && (
          <UploadDialog
            onClose={() => setShowUpload(false)}
            onCreated={(id) => {
              setShowUpload(false)
              window.location.href = `/backend/customs/${id}`
            }}
          />
        )}

        {showBatch && (
          <BatchUploadDialog
            onClose={() => setShowBatch(false)}
            onCreated={(shipmentIds) => {
              setShowBatch(false)
              if (shipmentIds.length === 1) {
                window.location.href = `/backend/customs/${shipmentIds[0]}`
              } else {
                loadData()
              }
            }}
          />
        )}
      </PageBody>
    </Page>
  )
}
