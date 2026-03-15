import React, { useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ChargeRow } from './ChargesTable'

type ImportFromCarrierDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (rows: ChargeRow[]) => void
  itemLabel?: string
}

type TabId = 'paste' | 'link' | 'upload'

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: 16,
  maxWidth: 560,
  width: '100%',
  margin: '0 16px',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '20px 24px 12px',
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
  color: '#6b7280',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  padding: '0 24px',
  borderBottom: '1px solid #e5e7eb',
}

const tabStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  color: disabled ? '#9ca3af' : active ? '#111827' : '#6b7280',
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid #111827' : '2px solid transparent',
  cursor: disabled ? 'not-allowed' : 'pointer',
  marginBottom: -1,
})

const bodyStyle: React.CSSProperties = {
  padding: '16px 24px 20px',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 160,
  padding: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.5,
  resize: 'vertical',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#9ca3af',
  marginTop: 8,
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 24px 20px',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#374151',
  cursor: 'pointer',
}

const importBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: disabled ? '#d1d5db' : '#111827',
  color: '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
})

const comingSoonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 120,
  color: '#9ca3af',
  fontSize: 14,
}

export function ImportFromCarrierDialog({
  open,
  onOpenChange,
  onImport,
  itemLabel,
}: ImportFromCarrierDialogProps) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<TabId>('paste')
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)

  const handleClose = useCallback(() => {
    if (importing) return
    setText('')
    setActiveTab('paste')
    onOpenChange(false)
  }, [importing, onOpenChange])

  const handleImport = useCallback(async () => {
    if (!text.trim() || importing) return
    setImporting(true)
    try {
      const response = await apiCall<{ charges: Array<{ productName: string; chargeCode: string | null; chargeBasis: string | null; currencyCode: string; rate: number; buyPrice: number }> }>('/api/fms_offers/rfq/extract-charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const charges = response.ok && response.result ? response.result.charges : []
      const rows: ChargeRow[] = charges.map(
        (charge) => ({
          id: crypto.randomUUID(),
          productId: null,
          productName: charge.productName || '',
          chargeCode: charge.chargeCode || '',
          chargeBasis: charge.chargeBasis || '',
          containerType: null,
          currencyCode: charge.currencyCode,
          rate: charge.rate,
          marginPercent: 0,
          buyPrice: charge.buyPrice,
          sellPrice: 0,
          isEnabled: true,
        }),
      )
      onImport(rows)
      setText('')
      setActiveTab('paste')
      onOpenChange(false)
    } finally {
      setImporting(false)
    }
  }, [text, importing, onImport, onOpenChange])

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        handleClose()
      }
    },
    [handleClose],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        handleImport()
      }
    },
    [handleClose, handleImport],
  )

  if (!open) return null

  return ReactDOM.createPortal(
    <div style={overlayStyle} onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
              {t('tasks_board.charges.import.title')}
            </div>
            {itemLabel && (
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{itemLabel}</div>
            )}
          </div>
          <button type="button" style={closeButtonStyle} onClick={handleClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={tabBarStyle}>
          <button
            type="button"
            style={tabStyle(activeTab === 'paste', false)}
            onClick={() => setActiveTab('paste')}
          >
            {t('tasks_board.charges.import.pasteText')}
          </button>
          <button
            type="button"
            style={tabStyle(activeTab === 'link', true)}
            disabled
          >
            {t('tasks_board.charges.import.link')}
          </button>
          <button
            type="button"
            style={tabStyle(activeTab === 'upload', true)}
            disabled
          >
            {t('tasks_board.charges.import.uploadFile')}
          </button>
        </div>

        <div style={bodyStyle}>
          {activeTab === 'paste' && (
            <>
              <textarea
                style={textareaStyle}
                placeholder="Paste carrier rate text here..."
                value={text}
                onChange={(event) => setText(event.target.value)}
                autoFocus
              />
              <div style={hintStyle}>{t('tasks_board.charges.import.textHint')}</div>
            </>
          )}
          {activeTab === 'link' && (
            <div style={comingSoonStyle}>{t('tasks_board.charges.import.comingSoon')}</div>
          )}
          {activeTab === 'upload' && (
            <div style={comingSoonStyle}>{t('tasks_board.charges.import.comingSoon')}</div>
          )}
        </div>

        {activeTab === 'paste' && (
          <div style={footerStyle}>
            <button type="button" style={cancelBtnStyle} onClick={handleClose}>
              {t('tasks_board.charges.import.cancel')}
            </button>
            <button
              type="button"
              style={importBtnStyle(!text.trim() || importing)}
              disabled={!text.trim() || importing}
              onClick={handleImport}
            >
              {importing
                ? t('tasks_board.charges.import.importing')
                : t('tasks_board.charges.import.import')}
              {!importing && <span aria-hidden>→</span>}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
