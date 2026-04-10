import React, { useState, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Plus, Upload, History } from 'lucide-react'

type ChargesToolbarProps = {
  onAddLine?: () => void
  onImportFromCarrier: () => void
  onFromHistory: () => void
  onApplyMargin?: (margin: number) => void
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '12px',
  color: 'var(--primary)',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  fontFamily: 'inherit',
}

const separatorStyle: React.CSSProperties = {
  color: 'var(--border)',
  fontSize: '12px',
  userSelect: 'none',
}

export function ChargesToolbar({
  onAddLine,
  onImportFromCarrier,
  onFromHistory,
  onApplyMargin,
}: ChargesToolbarProps) {
  const t = useT()
  const [marginInput, setMarginInput] = useState('')

  const handleApplyMargin = useCallback(() => {
    const value = parseFloat(marginInput)
    if (isNaN(value) || !onApplyMargin) return
    onApplyMargin(value)
  }, [marginInput, onApplyMargin])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px' }}>
      {onAddLine && (
        <>
          <button type="button" style={buttonStyle} onClick={onAddLine}>
            <Plus size={13} />
            {t('tasks_board.charges.toolbar.addLine', 'Add line')}
          </button>
          <span style={separatorStyle}>|</span>
        </>
      )}

      <button type="button" style={buttonStyle} onClick={onImportFromCarrier}>
        <Upload size={13} />
        {t('tasks_board.charges.toolbar.importFromCarrier', 'Import')}
      </button>

      <span style={separatorStyle}>|</span>

      <button type="button" style={buttonStyle} onClick={onFromHistory}>
        <History size={13} />
        {t('tasks_board.charges.toolbar.fromHistory', 'From history')}
      </button>

      {onApplyMargin && (
        <>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {t('tasks_board.charges.toolbar.margin', 'Margin')}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleApplyMargin()
                }
              }}
              placeholder="%"
              style={{
                width: '52px',
                padding: '5px 8px',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: 'inherit',
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'center',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: 'var(--background)',
                color: 'var(--foreground)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleApplyMargin}
              disabled={!marginInput.trim() || isNaN(parseFloat(marginInput))}
              style={{
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'inherit',
                color: '#fff',
                background: 'var(--primary)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                opacity: !marginInput.trim() || isNaN(parseFloat(marginInput)) ? 0.4 : 1,
                transition: 'opacity 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {t('tasks_board.charges.toolbar.apply', 'Apply')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
