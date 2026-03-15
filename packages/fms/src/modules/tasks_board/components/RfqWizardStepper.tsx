import React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Check } from 'lucide-react'

type RfqWizardStepperProps = {
  activeStep: number
  onStepClick: (step: number) => void
}

const STEPS = [
  { key: 'request', labelKey: 'tasks_board.wizard.step.request', fallback: 'Zapytanie' },
  { key: 'pricing', labelKey: 'tasks_board.wizard.step.pricing', fallback: 'Wycena' },
  { key: 'preview', labelKey: 'tasks_board.wizard.step.preview', fallback: 'Preview & Wyslij' },
]

export function RfqWizardStepper({ activeStep, onStepClick }: RfqWizardStepperProps) {
  const t = useT()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {STEPS.map((step, index) => {
        const isActive = index === activeStep
        const isCompleted = index < activeStep
        const isClickable = isCompleted

        return (
          <React.Fragment key={step.key}>
            {index > 0 && (
              <div
                style={{
                  flex: 1,
                  height: '1px',
                  maxWidth: '40px',
                  background: isCompleted ? 'var(--primary)' : 'var(--border)',
                  transition: 'background 0.2s',
                }}
              />
            )}
            <button
              type="button"
              onClick={() => isClickable && onStepClick(index)}
              disabled={!isClickable}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '9999px',
                border: isActive
                  ? '1.5px solid var(--primary)'
                  : isCompleted
                    ? '1.5px solid var(--primary)'
                    : '1.5px solid var(--border)',
                background: isActive
                  ? 'var(--primary)'
                  : isCompleted
                    ? 'rgba(var(--primary-rgb, 0, 0, 0), 0.06)'
                    : 'transparent',
                color: isActive
                  ? 'var(--primary-foreground)'
                  : isCompleted
                    ? 'var(--primary)'
                    : 'var(--muted-foreground)',
                fontSize: '12px',
                fontWeight: isActive || isCompleted ? 600 : 500,
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {isCompleted ? (
                <Check style={{ width: 13, height: 13 }} />
              ) : (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--accent)',
                    color: isActive ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {index + 1}
                </span>
              )}
              {t(step.labelKey, step.fallback)}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
