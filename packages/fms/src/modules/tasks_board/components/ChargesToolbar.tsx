import React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Plus, Upload, History } from 'lucide-react'

type ChargesToolbarProps = {
  onAddLine?: () => void
  onImportFromCarrier: () => void
  onFromHistory: () => void
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
}: ChargesToolbarProps) {
  const t = useT()

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
        {t('tasks_board.charges.toolbar.importFromCarrier', 'Import from carrier')}
      </button>

      <span style={separatorStyle}>|</span>

      <button type="button" style={buttonStyle} onClick={onFromHistory}>
        <History size={13} />
        {t('tasks_board.charges.toolbar.fromHistory', 'From history')}
      </button>
    </div>
  )
}
