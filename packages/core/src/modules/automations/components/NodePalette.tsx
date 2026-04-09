'use client'

import { useEffect, useState, useMemo } from 'react'
import { X, Search, Zap, Play, Webhook, Clock, Globe, Mail, Database, Radio, Shuffle, Code, Timer, Variable, GitBranch, ListTree, Merge, Repeat, Filter, Reply, Minus } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

interface NodeTypeInfo {
  type: string
  category: string
  name: string
  description: string
  icon: string
  color: string
}

const ICON_MAP: Record<string, typeof Zap> = {
  zap: Zap, play: Play, webhook: Webhook, clock: Clock,
  globe: Globe, mail: Mail, database: Database, radio: Radio,
  shuffle: Shuffle, code: Code, timer: Timer, variable: Variable,
  'git-branch': GitBranch, 'list-tree': ListTree,
  merge: Merge, repeat: Repeat, filter: Filter, reply: Reply, minus: Minus,
}

const CATEGORY_LABELS: Record<string, string> = {
  trigger: 'Triggers',
  action: 'Actions',
  logic: 'Logic',
  utility: 'Utilities',
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  trigger: 'Start your automation with an event, webhook, schedule, or manual trigger',
  action: 'Make HTTP requests, send emails, update data, transform, and more',
  logic: 'Branch, merge, loop, filter, and control the flow of your automation',
  utility: 'Delay, set variables, annotate, and organize your workflow',
}

const CATEGORY_ORDER = ['trigger', 'action', 'logic', 'utility']

interface NodePaletteProps {
  open: boolean
  onClose: () => void
  onSelectNodeType: (nodeType: NodeTypeInfo) => void
}

export function NodePalette({ open, onClose, onSelectNodeType }: NodePaletteProps) {
  const [nodeTypes, setNodeTypes] = useState<NodeTypeInfo[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiCall<{ items: NodeTypeInfo[] }>('/api/automations/node-types').then(({ ok, result }) => {
      if (ok && result) setNodeTypes(result.items)
    })
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return nodeTypes
    const q = search.toLowerCase()
    return nodeTypes.filter(nt =>
      nt.name.toLowerCase().includes(q) ||
      nt.description.toLowerCase().includes(q) ||
      nt.type.toLowerCase().includes(q)
    )
  }, [nodeTypes, search])

  const grouped = useMemo(() =>
    CATEGORY_ORDER.map(cat => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      description: CATEGORY_DESCRIPTIONS[cat] ?? '',
      types: filtered.filter(nt => nt.category === cat),
    })).filter(g => g.types.length > 0),
    [filtered]
  )

  if (!open) return null

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[320px] bg-card border-l shadow-2xl z-20 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Add node</h3>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm"
            autoFocus
          />
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {grouped.map(group => (
          <div key={group.category}>
            <div className="mb-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</div>
              {!search && (
                <div className="text-[10px] text-muted-foreground mt-0.5">{group.description}</div>
              )}
            </div>
            <div className="space-y-1">
              {group.types.map(nt => {
                const Icon = ICON_MAP[nt.icon] ?? Zap
                return (
                  <button
                    key={nt.type}
                    onClick={() => onSelectNodeType(nt)}
                    className="flex items-center gap-3 w-full rounded-lg border bg-background px-3 py-2.5 text-left hover:border-green-500/50 hover:bg-green-500/5 transition-colors"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: nt.color + '18' }}>
                      <Icon className="h-4 w-4" style={{ color: nt.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{nt.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{nt.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {grouped.length === 0 && search && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No nodes matching &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  )
}
