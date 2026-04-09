'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export default function CreateAutomationPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [automationId, setAutomationId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name || !automationId) return
    setSaving(true)
    setError(null)

    try {
      const { ok, result } = await apiCall<{ id: string }>('/api/automations/definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          automationId,
          definition: {
            nodes: [
              {
                id: 'trigger_1',
                type: 'trigger.manual',
                name: 'Manual Trigger',
                position: { x: 250, y: 50 },
                config: {},
              },
            ],
            connections: [],
          },
        }),
      })

      if (!ok || !result) {
        setError((result as any)?.error ?? 'Failed to create')
        return
      }

      router.push(`/backend/automations/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-lg space-y-6">
      <h1 className="text-lg font-semibold">New Automation</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Automation"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Automation ID</label>
          <input
            value={automationId}
            onChange={e => setAutomationId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            placeholder="my-automation"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">Lowercase, hyphens and underscores only</p>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">{error}</div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleCreate} disabled={saving || !name || !automationId}>
            {saving ? 'Creating...' : 'Create & Open Editor'}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
