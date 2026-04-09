'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Play, Pencil, Trash2, History } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'

interface AutomationItem {
  id: string
  automationId: string
  name: string
  description?: string | null
  enabled: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export default function AutomationsListPage() {
  const router = useRouter()
  const t = useT()
  const [items, setItems] = useState<AutomationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    apiCall<{ items: AutomationItem[] }>('/api/automations/definitions?pageSize=50').then(({ ok, result }) => {
      if (ok && result) setItems(result.items)
      setLoading(false)
    })
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    const { ok, result } = await apiCall<{ id: string }>('/api/automations/definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (ok && result) {
      router.push(`/backend/automations/${result.id}`)
    }
    setCreating(false)
  }

  const handleRun = async (id: string) => {
    await apiCall(`/api/automations/definitions/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this automation?')) return
    const { ok } = await apiCall(`/api/automations/definitions/${id}`, { method: 'DELETE' })
    if (ok) setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t('automations.definitions.title', 'Automations')}</h1>
        <Button size="sm" onClick={handleCreate} disabled={creating} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {creating ? 'Creating...' : t('automations.definitions.create', 'New Automation')}
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Version</th>
              <th className="px-4 py-3 text-left font-medium">Updated</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.automationId}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.enabled ? 'bg-green-500/10 text-green-600' : 'bg-gray-500/10 text-gray-500'
                  }`}>
                    {item.enabled ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">v{item.version}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(item.updatedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleRun(item.id)} title="Run">
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => router.push(`/backend/automations/${item.id}`)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => router.push(`/backend/automations/${item.id}/runs`)} title="Run History">
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No automations yet. Create your first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
