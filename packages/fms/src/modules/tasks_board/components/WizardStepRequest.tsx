import React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { RfqTextInput } from './RfqTextInput'
import { RfqContextPanel } from './RfqContextPanel'
import { LocationSearchInput } from './LocationSearchInput'
import { SwapButton, ExpandableLocationSlot } from './shared-inputs'
import { ChipSelector } from './ChipSelector'
import { TRANSPORT_MODE_OPTIONS, CONTAINER_OPTIONS } from '../lib/chip-options'
import { sectionLabelStyle, type WizardItem, type ExtractionResult } from '../lib/wizard-types'

type WizardStepRequestProps = {
  rfqId: string | null
  rfqTitle: string
  rawText: string
  extraction: ExtractionResult | null
  extracting: boolean
  creating: boolean
  editableItems: WizardItem[]
  expandedBoxes: Set<number>
  setExpandedBoxes: React.Dispatch<React.SetStateAction<Set<number>>>
  editingItems: Set<number>
  expandedPol: Set<number>
  setExpandedPol: React.Dispatch<React.SetStateAction<Set<number>>>
  expandedPod: Set<number>
  setExpandedPod: React.Dispatch<React.SetStateAction<Set<number>>>
  updateItem: (index: number, patch: Partial<WizardItem>) => void
  toggleEditing: (idx: number) => void
  onExtract: (text: string) => void
}

export function WizardStepRequest({
  rfqId,
  rfqTitle,
  rawText,
  extraction,
  extracting,
  creating,
  editableItems,
  expandedBoxes,
  setExpandedBoxes,
  editingItems,
  expandedPol,
  setExpandedPol,
  expandedPod,
  setExpandedPod,
  updateItem,
  toggleEditing,
  onExtract,
}: WizardStepRequestProps) {
  const t = useT()

  // New mode: text input
  if (!rfqId && !extracting) {
    return (
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <RfqTextInput onCreate={onExtract} submitting={creating} initialText={rawText} />
      </div>
    )
  }

  // After extraction or existing mode: split layout
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left: Item detail boxes */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          borderRight: '1px solid var(--border)',
        }}
      >
        {extracting ? (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '12px',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 28, height: 20, borderRadius: '9999px', background: 'var(--muted)' }} />
                  <div style={{ width: 60, height: 16, borderRadius: '6px', background: 'var(--muted)' }} />
                  <div style={{ flex: 1, height: 16, borderRadius: '6px', background: 'var(--muted)', maxWidth: '200px' }} />
                </div>
                {i === 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ width: '100%', height: 120, borderRadius: '8px', background: 'var(--muted)', opacity: 0.5 }} />
                  </div>
                )}
              </div>
            ))}
            <div style={{ textAlign: 'center', padding: '8px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
              {t('tasks_board.wizard.extracting', 'Analyzing content...')}
            </div>
          </>
        ) : (
          editableItems.map((item, idx) => {
            const isExpanded = expandedBoxes.has(idx)
            const isEditing = editingItems.has(idx)
            const hasTransport = !!item.transportMode

            return (
              <div
                key={idx}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  marginBottom: '12px',
                  overflow: 'visible',
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 20px',
                    background: isExpanded ? 'var(--accent)' : 'transparent',
                    borderRadius: '12px 12px 0 0',
                    transition: 'background 0.15s',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedBoxes((prev) => {
                      const next = new Set(prev)
                      if (next.has(idx)) next.delete(idx)
                      else next.add(idx)
                      return next
                    })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: 'var(--foreground)',
                      fontFamily: 'inherit',
                      flexShrink: 0,
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown style={{ width: 16, height: 16, opacity: 0.5 }} />
                    ) : (
                      <ChevronRight style={{ width: 16, height: 16, opacity: 0.5 }} />
                    )}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: 'var(--primary)',
                        color: 'var(--primary-foreground)',
                      }}
                    >
                      #{idx + 1}
                    </span>
                  </button>

                  <div
                    onClick={() => toggleEditing(idx)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: item.containerType ? 600 : 500,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        flexShrink: 0,
                        ...(item.containerType
                          ? { background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid transparent' }
                          : { background: 'transparent', color: 'var(--muted-foreground)', border: '1px dashed var(--border)' }),
                      }}
                    >
                      {item.containerType
                        ? `${item.containerCount ? `${item.containerCount}x ` : ''}${item.containerType}`
                        : t('tasks_board.detail.containerType', 'Container')}
                    </span>

                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--foreground)',
                      }}
                    >
                      {(() => {
                        const parts: string[] = []
                        if (item.placeOfLoading) parts.push(item.placeOfLoading)
                        parts.push(item.origin || '?')
                        parts.push(item.destination || '?')
                        if (item.placeOfDelivery) parts.push(item.placeOfDelivery)
                        return parts.join(' → ')
                      })()}
                    </span>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: hasTransport ? 600 : 500,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        flexShrink: 0,
                        ...(hasTransport
                          ? { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid transparent' }
                          : { background: 'transparent', color: 'var(--muted-foreground)', border: '1px dashed var(--border)' }),
                      }}
                    >
                      {hasTransport
                        ? item.transportMode!.charAt(0).toUpperCase() + item.transportMode!.slice(1)
                        : t('tasks_board.detail.transportMode', 'Transport')}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleEditing(idx)}
                    title={t('tasks_board.detail.edit', 'Edit')}
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: '8px',
                      border: 'none',
                      background: isEditing ? 'var(--primary)' : 'transparent',
                      color: isEditing ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isEditing) {
                        e.currentTarget.style.background = 'var(--muted)'
                        e.currentTarget.style.color = 'var(--foreground)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isEditing) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--muted-foreground)'
                      }
                    }}
                  >
                    <Pencil style={{ width: 12, height: 12 }} />
                  </button>
                </div>

                {/* Expandable edit panel */}
                {isEditing && (
                  <div
                    style={{
                      padding: '12px 20px 16px',
                      borderTop: '1px solid var(--border)',
                      background: 'color-mix(in srgb, var(--accent) 50%, var(--background))',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <div>
                        <div style={sectionLabelStyle}>
                          {t('tasks_board.detail.transportMode', 'Transport Mode')}
                        </div>
                        <ChipSelector
                          options={TRANSPORT_MODE_OPTIONS}
                          selected={item.transportMode || ''}
                          onChange={(value) => updateItem(idx, { transportMode: (value as string) || null })}
                        />
                      </div>
                      <div>
                        <div style={sectionLabelStyle}>
                          {t('tasks_board.detail.containerType', 'Container')}
                        </div>
                        <ChipSelector
                          options={CONTAINER_OPTIONS}
                          selected={item.containerType || ''}
                          onChange={(value) => updateItem(idx, { containerType: (value as string) || null })}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={sectionLabelStyle}>
                        {t('tasks_board.detail.route', 'Route')}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          paddingTop: (expandedPol.has(idx) || expandedPod.has(idx)) ? '18px' : '0',
                          transition: 'padding-top 0.3s ease',
                        }}
                      >
                        <ExpandableLocationSlot
                          expanded={expandedPol.has(idx)}
                          onToggle={() => {
                            setExpandedPol((prev) => {
                              const next = new Set(prev)
                              if (next.has(idx)) {
                                next.delete(idx)
                                updateItem(idx, { placeOfLoadingId: null, placeOfLoading: null })
                              } else {
                                next.add(idx)
                              }
                              return next
                            })
                          }}
                          value={item.placeOfLoadingId}
                          onChange={(locationId, name) => updateItem(idx, { placeOfLoadingId: locationId, placeOfLoading: name || null })}
                          label={t('tasks_board.detail.portOfLoading', 'Port of Loading')}
                          placeholder={t('tasks_board.detail.portOfLoading', 'Port of Loading')}
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LocationSearchInput
                            value={item.originLocationId}
                            onChange={(locationId, name) => updateItem(idx, { originLocationId: locationId, origin: name || null })}
                            placeholder={item.origin || t('tasks_board.wizard.from', 'From')}
                          />
                        </div>

                        <div style={{ flexShrink: 0 }}>
                          <SwapButton onClick={() => updateItem(idx, {
                            originLocationId: item.destinationLocationId,
                            origin: item.destination,
                            destinationLocationId: item.originLocationId,
                            destination: item.origin,
                          })} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LocationSearchInput
                            value={item.destinationLocationId}
                            onChange={(locationId, name) => updateItem(idx, { destinationLocationId: locationId, destination: name || null })}
                            placeholder={item.destination || t('tasks_board.wizard.to', 'To')}
                          />
                        </div>

                        <ExpandableLocationSlot
                          expanded={expandedPod.has(idx)}
                          onToggle={() => {
                            setExpandedPod((prev) => {
                              const next = new Set(prev)
                              if (next.has(idx)) {
                                next.delete(idx)
                                updateItem(idx, { placeOfDeliveryId: null, placeOfDelivery: null })
                              } else {
                                next.add(idx)
                              }
                              return next
                            })
                          }}
                          value={item.placeOfDeliveryId}
                          onChange={(locationId, name) => updateItem(idx, { placeOfDeliveryId: locationId, placeOfDelivery: name || null })}
                          label={t('tasks_board.detail.portOfDischarge', 'Port of Discharge')}
                          placeholder={t('tasks_board.detail.portOfDischarge', 'Port of Discharge')}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded content - cargo details only (no charges on step 1) */}
                {isExpanded && (
                  <div style={{ padding: '0 20px 16px' }}>
                    {item.cargoDescription && (
                      <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '0 4px' }}>
                        {item.cargoDescription}
                        {item.weightKg ? ` (${item.weightKg} kg)` : ''}
                        {item.readinessDate ? ` · ${t('tasks_board.wizard.readiness', 'Readiness')}: ${item.readinessDate}` : ''}
                        {item.incoterm ? ` · ${item.incoterm.toUpperCase()}` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}

        {!extracting && editableItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
            {t('tasks_board.wizard.extracting', 'Analyzing content...')}
          </div>
        )}
      </div>

      {/* Right: Context panel */}
      <RfqContextPanel
        rfqId={rfqId}
        rfqTitle={rfqTitle}
        rawText={rawText}
        extracting={extracting}
        extraction={extraction}
        rfqDetail={null}
      />
    </div>
  )
}
