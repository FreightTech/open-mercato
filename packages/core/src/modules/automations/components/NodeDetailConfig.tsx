'use client'

import { useState, useCallback } from 'react'
import type { AutomationNode, NodeErrorStrategy } from '../data/entities'

interface NodeDetailConfigProps {
  node: AutomationNode
  onChange: (config: Record<string, unknown>) => void
  onSettingsChange: (updates: Partial<AutomationNode>) => void
}

export function NodeDetailConfig({ node, onChange, onSettingsChange }: NodeDetailConfigProps) {
  const [activeTab, setActiveTab] = useState<'parameters' | 'settings'>('parameters')

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b px-4">
        {(['parameters', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'parameters' ? (
          <ParametersTab node={node} onChange={onChange} />
        ) : (
          <SettingsTab node={node} onSettingsChange={onSettingsChange} />
        )}
      </div>
    </div>
  )
}

function ParametersTab({ node, onChange }: { node: AutomationNode; onChange: (config: Record<string, unknown>) => void }) {
  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...node.config, [key]: value })
    },
    [node.config, onChange]
  )

  // Render a dynamic JSON editor for the config
  return (
    <div className="space-y-4">
      {Object.entries(node.config).map(([key, value]) => (
        <div key={key}>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">{formatLabel(key)}</label>
          {typeof value === 'boolean' ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value}
                onChange={e => handleFieldChange(key, e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-sm">{key}</span>
            </label>
          ) : typeof value === 'number' ? (
            <input
              type="number"
              value={value}
              onChange={e => handleFieldChange(key, Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          ) : typeof value === 'object' && value !== null ? (
            <textarea
              value={JSON.stringify(value, null, 2)}
              onChange={e => {
                try {
                  handleFieldChange(key, JSON.parse(e.target.value))
                } catch { /* invalid JSON, ignore */ }
              }}
              rows={Math.min(8, JSON.stringify(value, null, 2).split('\n').length + 1)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
            />
          ) : (
            <input
              type="text"
              value={String(value ?? '')}
              onChange={e => handleFieldChange(key, e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={`{{nodes.prev.field}}`}
            />
          )}
        </div>
      ))}
      {Object.keys(node.config).length === 0 && (
        <div className="text-sm text-muted-foreground">No parameters configured</div>
      )}
    </div>
  )
}

function SettingsTab({ node, onSettingsChange }: { node: AutomationNode; onSettingsChange: (updates: Partial<AutomationNode>) => void }) {
  return (
    <div className="space-y-4">
      {/* Disabled */}
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={node.disabled ?? false}
            onChange={e => onSettingsChange({ disabled: e.target.checked })}
            className="rounded border-input"
          />
          <span className="text-sm">Disabled (skip during execution)</span>
        </label>
      </div>

      {/* Error handling */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">On Error</label>
        <select
          value={node.onError ?? 'stop'}
          onChange={e => onSettingsChange({ onError: e.target.value as NodeErrorStrategy })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="stop">Stop execution</option>
          <option value="continue">Continue to next node</option>
          <option value="output">Route to error output</option>
        </select>
      </div>

      {/* Retry policy */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Retry Policy</label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Max Attempts</label>
            <input
              type="number"
              value={node.retryPolicy?.maxAttempts ?? 0}
              min={0}
              max={10}
              onChange={e => onSettingsChange({
                retryPolicy: { ...node.retryPolicy, maxAttempts: Number(e.target.value), intervalMs: node.retryPolicy?.intervalMs ?? 1000, backoffMultiplier: node.retryPolicy?.backoffMultiplier ?? 2 },
              })}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Interval (ms)</label>
            <input
              type="number"
              value={node.retryPolicy?.intervalMs ?? 1000}
              min={100}
              onChange={e => onSettingsChange({
                retryPolicy: { ...node.retryPolicy, maxAttempts: node.retryPolicy?.maxAttempts ?? 0, intervalMs: Number(e.target.value), backoffMultiplier: node.retryPolicy?.backoffMultiplier ?? 2 },
              })}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Backoff</label>
            <input
              type="number"
              value={node.retryPolicy?.backoffMultiplier ?? 2}
              min={1}
              max={5}
              step={0.5}
              onChange={e => onSettingsChange({
                retryPolicy: { ...node.retryPolicy, maxAttempts: node.retryPolicy?.maxAttempts ?? 0, intervalMs: node.retryPolicy?.intervalMs ?? 1000, backoffMultiplier: Number(e.target.value) },
              })}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes</label>
        <textarea
          value={node.notes ?? ''}
          onChange={e => onSettingsChange({ notes: e.target.value })}
          rows={3}
          placeholder="Add notes about this node..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  )
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim()
}
