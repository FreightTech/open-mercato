'use client'

import { useState, useMemo } from 'react'

type ViewMode = 'schema' | 'table' | 'json'

interface DataViewerProps {
  data: Record<string, unknown> | null | undefined
  title?: string
  className?: string
}

export function DataViewer({ data, title, className }: DataViewerProps) {
  const [mode, setMode] = useState<ViewMode>('schema')

  if (!data) {
    return (
      <div className={`flex items-center justify-center text-muted-foreground text-sm h-full ${className ?? ''}`}>
        No data
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        {title && <span className="text-xs font-semibold text-muted-foreground uppercase">{title}</span>}
        <div className="flex gap-1">
          {(['schema', 'table', 'json'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 text-xs font-mono">
        {mode === 'schema' && <SchemaView data={data} />}
        {mode === 'table' && <TableView data={data} />}
        {mode === 'json' && <JsonView data={data} />}
      </div>
    </div>
  )
}

function SchemaView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-2">
          <span className="text-primary font-medium shrink-0">{key}</span>
          <span className="text-muted-foreground">:</span>
          <span className="text-muted-foreground">{inferType(value)}</span>
          <span className="text-foreground/70 truncate max-w-[200px]">
            {formatPreview(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

function TableView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b">
          <th className="pb-1 text-muted-foreground font-medium">Key</th>
          <th className="pb-1 text-muted-foreground font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} className="border-b border-border/50">
            <td className="py-1 pr-3 text-primary">{key}</td>
            <td className="py-1 truncate max-w-[300px]">{formatValue(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function JsonView({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="whitespace-pre-wrap break-words text-foreground/80">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

function inferType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `array[${value.length}]`
  return typeof value
}

function formatPreview(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return `"${value.slice(0, 50)}${value.length > 50 ? '...' : ''}"`
  if (typeof value === 'object') return Array.isArray(value) ? `[${value.length} items]` : '{...}'
  return String(value)
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
