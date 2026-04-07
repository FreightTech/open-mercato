import React, { useState, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Plus } from 'lucide-react'

type RfqTextInputProps = {
  onCreate: (rawText: string) => void
  submitting?: boolean
  initialText?: string
}

export function RfqTextInput({ onCreate, submitting = false, initialText = '' }: RfqTextInputProps) {
  const t = useT()
  const [text, setText] = useState(initialText)

  const handleCreate = useCallback(() => {
    if (!text.trim() || submitting) return
    onCreate(text.trim())
  }, [text, submitting, onCreate])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleCreate()
      }
    },
    [handleCreate],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <label
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          {t('tasks_board.wizard.pasteEmail', 'Paste email or message text')}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onPaste={(e) => {
            // Ensure state updates on paste even if onChange doesn't fire
            requestAnimationFrame(() => {
              const el = e.target as HTMLTextAreaElement
              if (el.value !== text) setText(el.value)
            })
          }}
          onKeyDown={handleKeyDown}
          placeholder={t(
            'tasks_board.wizard.textPlaceholder',
            'Paste the freight inquiry email here...\n\nThe AI will extract company info, routes, containers, cargo details, and dates.',
          )}
          disabled={submitting}
          style={{
            flex: 1,
            minHeight: '300px',
            padding: '16px',
            fontSize: '14px',
            lineHeight: '1.6',
            fontFamily: 'inherit',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            background: 'var(--background)',
            color: 'var(--foreground)',
            resize: 'none',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Button
          onClick={handleCreate}
          disabled={!text.trim() || submitting}
          style={{ gap: '6px' }}
        >
          {submitting ? (
            <>
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid currentColor',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                }}
              />
              {t('tasks_board.wizard.creating', 'Creating...')}
            </>
          ) : (
            <>
              <Plus style={{ width: 14, height: 14 }} />
              {t('tasks_board.wizard.create', 'Create')}
            </>
          )}
        </Button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
