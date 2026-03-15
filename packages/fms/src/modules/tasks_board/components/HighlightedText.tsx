import React, { useMemo } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type Highlight = {
  start: number
  end: number
  type: string
  label: string
}

type HighlightedTextProps = {
  text: string
  highlights: Highlight[]
  senderEmail?: string | null
  senderName?: string | null
  companyName?: string | null
}

const HIGHLIGHT_COLORS: Record<string, { bg: string; text: string }> = {
  location: { bg: '#bfdbfe', text: '#1e40af' },
  container: { bg: '#a7f3d0', text: '#065f46' },
  cargo: { bg: '#fecaca', text: '#991b1b' },
  weight: { bg: '#fde68a', text: '#92400e' },
  date: { bg: '#c4b5fd', text: '#5b21b6' },
  company: { bg: '#e9d5ff', text: '#6b21a8' },
  contact: { bg: '#fbcfe8', text: '#9d174d' },
  email: { bg: '#e9d5ff', text: '#6b21a8' },
  incoterm: { bg: '#bae6fd', text: '#075985' },
}

const DEFAULT_COLOR = { bg: '#e2e8f0', text: '#334155' }

const TYPE_LABELS: Record<string, string> = {
  location: 'Location',
  container: 'Container',
  cargo: 'Cargo',
  weight: 'Weight',
  date: 'Date',
  company: 'Company',
  contact: 'Contact',
  email: 'Email',
  incoterm: 'Incoterm',
}

function resolveNonOverlapping(highlights: Highlight[]): Highlight[] {
  if (highlights.length === 0) return []

  const sorted = [...highlights].sort((a, b) => a.start - b.start || b.end - a.end)
  const result: Highlight[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1]
    const current = sorted[i]
    if (current.start >= last.end) {
      result.push(current)
    }
  }

  return result
}

export function HighlightedText({
  text,
  highlights,
  senderEmail,
  senderName,
  companyName,
}: HighlightedTextProps) {
  const t = useT()

  const segments = useMemo(() => {
    const resolved = resolveNonOverlapping(highlights)
    const parts: Array<{ text: string; highlight?: Highlight }> = []
    let cursor = 0

    for (const hl of resolved) {
      if (hl.start > cursor) {
        parts.push({ text: text.slice(cursor, hl.start) })
      }
      if (hl.start >= 0 && hl.end <= text.length && hl.start < hl.end) {
        parts.push({ text: text.slice(hl.start, hl.end), highlight: hl })
      }
      cursor = Math.max(cursor, hl.end)
    }

    if (cursor < text.length) {
      parts.push({ text: text.slice(cursor) })
    }

    return parts
  }, [text, highlights])

  const hasMeta = senderName || senderEmail || companyName

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Sender metadata header */}
      {hasMeta && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'var(--accent)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '13px',
          }}
        >
          {companyName && (
            <div style={{ fontWeight: 600 }}>{companyName}</div>
          )}
          {senderName && (
            <div style={{ color: 'var(--muted-foreground)' }}>{senderName}</div>
          )}
          {senderEmail && (
            <div style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>{senderEmail}</div>
          )}
        </div>
      )}

      {/* Highlighted text body */}
      <div
        style={{
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--background)',
          fontSize: '13px',
          lineHeight: '1.7',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: '500px',
          overflowY: 'auto',
        }}
      >
        {segments.map((segment, idx) => {
          if (!segment.highlight) {
            return <span key={idx}>{segment.text}</span>
          }

          const colors = HIGHLIGHT_COLORS[segment.highlight.type] || DEFAULT_COLOR

          return (
            <span
              key={idx}
              title={`${TYPE_LABELS[segment.highlight.type] || segment.highlight.type}: ${segment.highlight.label}`}
              style={{
                backgroundColor: colors.bg,
                color: colors.text,
                borderRadius: '4px',
                padding: '2px 5px',
                margin: '0 1px',
                fontWeight: 600,
                cursor: 'help',
                display: 'inline',
                boxDecorationBreak: 'clone' as any,
                WebkitBoxDecorationBreak: 'clone' as any,
              }}
            >
              {segment.text}
            </span>
          )
        })}
      </div>

    </div>
  )
}
