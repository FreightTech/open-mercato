import React, { useState } from 'react'
import { ArrowLeftRight, Plus, Minus, X } from 'lucide-react'
import { LocationSearchInput } from './LocationSearchInput'

export const pillBorder = 'color-mix(in srgb, var(--foreground) 25%, var(--border))'

export function PillInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
        borderRadius: '9999px',
        border: `1.5px solid ${focused ? 'var(--ring)' : pillBorder}`,
        background: 'var(--background)',
        height: '38px',
        padding: '0 14px',
        transition: 'border-color 0.15s',
      }}
    >
      <input
        {...props}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event) }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event) }}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '13px',
          color: 'var(--foreground)',
          minWidth: 0,
          padding: 0,
          ...props.style,
        }}
      />
    </div>
  )
}

export function PillTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        minWidth: 0,
        borderRadius: '20px',
        border: `1.5px solid ${focused ? 'var(--ring)' : pillBorder}`,
        background: 'var(--background)',
        padding: '10px 14px',
        transition: 'border-color 0.15s',
      }}
    >
      <textarea
        {...props}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event) }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event) }}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '13px',
          color: 'var(--foreground)',
          minWidth: 0,
          padding: 0,
          resize: 'none',
          fontFamily: 'inherit',
          ...props.style,
        }}
      />
    </div>
  )
}

export function SwapButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Swap locations"
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1.5px solid var(--border)',
        background: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        color: 'var(--muted-foreground)',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = 'var(--foreground)'
        event.currentTarget.style.color = 'var(--foreground)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = 'var(--border)'
        event.currentTarget.style.color = 'var(--muted-foreground)'
      }}
    >
      <ArrowLeftRight style={{ width: 14, height: 14 }} />
    </button>
  )
}

export function ExpandableSlot({
  expanded,
  onToggle,
  label,
  icon,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        transition: 'flex 0.3s ease, min-width 0.3s ease',
        flex: expanded ? '1 1 0%' : '0 0 auto',
        minWidth: expanded ? '120px' : '30px',
      }}
    >
      {expanded && (
        <span
          style={{
            position: 'absolute',
            top: '-16px',
            left: '38px',
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            animation: 'fadeIn 0.2s ease 0.15s both',
          }}
        >
          {label}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
        <button
          type="button"
          onClick={onToggle}
          title={expanded ? `Remove ${label}` : `Add ${label}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `1.5px ${expanded ? 'solid' : 'dashed'} color-mix(in srgb, var(--foreground) 25%, var(--border))`,
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            color: 'var(--muted-foreground)',
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.borderColor = 'var(--foreground)'
            event.currentTarget.style.color = 'var(--foreground)'
            event.currentTarget.style.background = 'var(--accent)'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.borderColor = 'var(--border)'
            event.currentTarget.style.color = 'var(--muted-foreground)'
            event.currentTarget.style.background = 'transparent'
          }}
        >
          {expanded
            ? <Minus style={{ width: 14, height: 14 }} />
            : (icon || <Plus style={{ width: 14, height: 14 }} />)}
        </button>
        {expanded && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

export function ExpandableFieldRow({
  expanded,
  onToggle,
  label,
  displayValue,
  icon,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  label: string
  displayValue?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span
        onClick={expanded ? onToggle : undefined}
        style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--muted-foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          cursor: expanded ? 'pointer' : 'default',
        }}
      >
        {label}
      </span>
      {expanded ? (
        <div style={{ flex: 1, minWidth: 0, maxWidth: '320px' }}>
          {children}
        </div>
      ) : displayValue ? (
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '9999px',
            border: '1px solid var(--primary)',
            background: 'var(--primary)',
            cursor: 'pointer',
            color: 'var(--primary-foreground)',
            fontSize: '12px',
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.opacity = '0.85'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.opacity = '1'
          }}
        >
          {icon}
          <span>{displayValue}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '9999px',
            border: `1.5px dashed ${pillBorder}`,
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--muted-foreground)',
            fontSize: '12px',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.borderColor = 'var(--foreground)'
            event.currentTarget.style.color = 'var(--foreground)'
            event.currentTarget.style.background = 'var(--accent)'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.borderColor = pillBorder
            event.currentTarget.style.color = 'var(--muted-foreground)'
            event.currentTarget.style.background = 'transparent'
          }}
        >
          {icon}
          <span>{label}</span>
        </button>
      )}
    </div>
  )
}

export function ExpandableLocationSlot({
  expanded,
  onToggle,
  value,
  onChange,
  label,
  placeholder,
}: {
  expanded: boolean
  onToggle: () => void
  value: string | null
  onChange: (value: string | null, name?: string | null) => void
  label: string
  placeholder: string
}) {
  return (
    <ExpandableSlot expanded={expanded} onToggle={onToggle} label={label}>
      <LocationSearchInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </ExpandableSlot>
  )
}

export function ExpandableTextFieldRow({
  expanded,
  onToggle,
  onConfirm,
  value,
  onChange,
  label,
  placeholder,
  icon,
  rows = 3,
}: {
  expanded: boolean
  onToggle: () => void
  onConfirm?: () => void
  value: string
  onChange: (value: string) => void
  label: string
  placeholder: string
  icon?: React.ReactNode
  rows?: number
}) {
  return (
    <ExpandableFieldRow
      expanded={expanded}
      onToggle={onToggle}
      label={label}
      displayValue={value || undefined}
      icon={icon}
    >
      <PillTextarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            ;(onConfirm || onToggle)()
          }
        }}
        placeholder={placeholder}
        rows={rows}
      />
    </ExpandableFieldRow>
  )
}

export function ExpandableInputRow({
  expanded,
  onToggle,
  onConfirm,
  value,
  onChange,
  label,
  placeholder,
  icon,
}: {
  expanded: boolean
  onToggle: () => void
  onConfirm?: () => void
  value: string
  onChange: (value: string) => void
  label: string
  placeholder: string
  icon?: React.ReactNode
}) {
  return (
    <ExpandableFieldRow
      expanded={expanded}
      onToggle={onToggle}
      label={label}
      displayValue={value || undefined}
      icon={icon}
    >
      <PillInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            ;(onConfirm || onToggle)()
          }
        }}
        placeholder={placeholder}
        autoFocus
      />
    </ExpandableFieldRow>
  )
}
