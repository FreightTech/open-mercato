import React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { DIRECTION_OPTIONS, TRANSPORT_MODE_OPTIONS, CARGO_TYPE_OPTIONS } from '../lib/chip-options'

type OfferLine = {
  id: string
  lineNumber: number
  productId: string | null
  productName: string | null
  chargeCode: string | null
  chargeBasis: string | null
  chargeUnit: string | null
  containerType?: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  isEnabled: boolean
}

type OfferCalculation = {
  id: string
  calculationNumber: number
  label: string | null
  containers: string[] | null
  originLocationId: string | null
  destinationLocationId: string | null
  placeOfLoadingId: string | null
  placeOfDeliveryId: string | null
  lines: OfferLine[]
}

type OfferDetailData = {
  id: string
  offerNumber: string
  version: number
  status: string
  createdAt: string
  validUntil: string | null
  direction: string | null
  transportMode: string | null
  cargoType: string | null
  paymentTerms: string | null
  specialTerms: string | null
  customerNotes: string | null
  notes: string | null
  rfq: {
    id: string
    title: string | null
    origin: string | null
    destination: string | null
    companyName: string | null
    contactPerson: string | null
    containerCount: number | null
    direction: string | null
    transportMode: string | null
    cargoType: string | null
  } | null
  calculations: OfferCalculation[]
}

type OfferDetailViewProps = {
  offerId: string
}

// -- Colors --
const ACCENT = '#1e3a5f'
const ACCENT_LIGHT = '#eef2f7'
const LABEL_COLOR = ACCENT
const BORDER_LIGHT = '#dce3ed'

function findOptionLabel(options: { value: string; label: string }[], value: string | null): string | null {
  if (!value) return null
  return options.find((o) => o.value === value)?.label ?? value
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

function formatNumber(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0.00'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function OfferDetailView({ offerId }: OfferDetailViewProps) {
  const t = useT()

  const { data: offer, isLoading, isError } = useQuery<OfferDetailData>({
    queryKey: ['offer-detail', offerId],
    queryFn: async () => {
      const res = await apiCall<OfferDetailData>(`/api/fms_offers/offers/${offerId}`)
      if (!res.ok || !res.result) throw new Error('Failed to fetch offer')
      return res.result
    },
    enabled: !!offerId,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px' }}>
        <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t('tasks_board.offerDetail.loading', 'Loading offer...')}</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (isError || !offer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
        <span className="text-sm text-destructive">{t('tasks_board.offerDetail.error', 'Failed to load offer')}</span>
      </div>
    )
  }

  const direction = offer.direction || offer.rfq?.direction
  const transportMode = offer.transportMode || offer.rfq?.transportMode
  const cargoType = offer.cargoType || offer.rfq?.cargoType
  const origin = offer.rfq?.origin || null
  const destination = offer.rfq?.destination || null
  const containers = offer.calculations?.[0]?.containers
  const hasContainerType = offer.calculations.some((c) => c.lines.some((l) => l.containerType))

  return (
    <div style={{ padding: '32px 28px', fontFamily: 'inherit' }}>
      {/* ================================================================
          HEADER — Offer number badge + dates
          ================================================================ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'inline-block',
              border: `2px solid ${ACCENT}`,
              borderRadius: '8px',
              padding: '8px 20px',
              marginBottom: '10px',
            }}
          >
            <div style={{ fontSize: '10px', color: ACCENT, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('tasks_board.offerDetail.offerNumber', 'Offer Number')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: ACCENT, letterSpacing: '-0.01em' }}>
              {offer.offerNumber}
            </div>
          </div>
          <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
            <span>
              <span style={{ color: '#6b7280' }}>{t('tasks_board.offerDetail.created', 'Date')}:</span>{' '}
              <strong>{formatDate(offer.createdAt)}</strong>
            </span>
            <span>
              <span style={{ color: '#6b7280' }}>{t('tasks_board.offerDetail.validUntil', 'Valid until')}:</span>{' '}
              <strong>{formatDate(offer.validUntil)}</strong>
            </span>
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: `1px solid ${BORDER_LIGHT}`, margin: '0 0 24px' }} />

      {/* ================================================================
          CUSTOMER — Company name + billing address
          ================================================================ */}
      <SectionLabel>{t('tasks_board.offerDetail.customer', 'Customer')}</SectionLabel>
      <div
        style={{
          background: ACCENT_LIGHT,
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '24px',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700 }}>
          {offer.rfq?.companyName || t('tasks_board.offerDetail.noCustomer', 'Not specified')}
        </div>
        {offer.rfq?.contactPerson && (
          <div style={{ fontSize: '13px', color: '#4b5563', marginTop: '2px' }}>
            {offer.rfq.contactPerson}
          </div>
        )}
      </div>

      {/* ================================================================
          SHIPMENT DETAILS
          ================================================================ */}
      <SectionLabel>{t('tasks_board.offerDetail.shipmentDetails', 'Shipment Details')}</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <FieldCell
          label={t('tasks_board.offerDetail.direction', 'Type')}
          value={findOptionLabel(DIRECTION_OPTIONS, direction ?? null) || t('tasks_board.offerDetail.notSpecified', 'Not specified')}
        />
        <FieldCell
          label={t('tasks_board.offerDetail.transportMode', 'Transport Mode')}
          value={findOptionLabel(TRANSPORT_MODE_OPTIONS, transportMode ?? null) || t('tasks_board.offerDetail.notSpecified', 'Not specified')}
        />
        <FieldCell
          label={t('tasks_board.offerDetail.cargoType', 'Cargo Type')}
          value={findOptionLabel(CARGO_TYPE_OPTIONS, cargoType ?? null) || t('tasks_board.offerDetail.notSpecified', 'Not specified')}
        />
      </div>

      {/* ================================================================
          ROUTE
          ================================================================ */}
      <SectionLabel>{t('tasks_board.offerDetail.route', 'Route')}</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '16px',
          background: ACCENT_LIGHT,
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '28px',
        }}
      >
        <FieldCell
          label={t('tasks_board.offerDetail.from', 'From')}
          value={origin || t('tasks_board.offerDetail.notSpecified', 'Not specified')}
        />
        <FieldCell
          label={t('tasks_board.offerDetail.to', 'To')}
          value={destination || t('tasks_board.offerDetail.notSpecified', 'Not specified')}
        />
        <FieldCell
          label={t('tasks_board.offerDetail.containers', 'Containers')}
          value={containers && containers.length > 0 ? containers.join(', ') : 'N/A'}
        />
      </div>

      {/* ================================================================
          LINES TABLE — per calculation
          ================================================================ */}
      {offer.calculations.map((calc) => (
        <div key={calc.id} style={{ marginBottom: '8px' }}>
          {offer.calculations.length > 1 && (
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {calc.label || `Calculation #${calc.calculationNumber}`}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <ThCell align="left">{t('tasks_board.offerDetail.product', 'Description')}</ThCell>
                {hasContainerType && <ThCell align="left">{t('tasks_board.offerDetail.containerType', 'Container')}</ThCell>}
                <ThCell align="left">{t('tasks_board.offerDetail.currency', 'Currency')}</ThCell>
                <ThCell align="right">{t('tasks_board.offerDetail.value', 'Value')}</ThCell>
              </tr>
              <tr>
                <td colSpan={hasContainerType ? 4 : 3} style={{ padding: 0 }}>
                  <div style={{ height: '2px', background: ACCENT, borderRadius: '1px' }} />
                </td>
              </tr>
            </thead>
            <tbody>
              {calc.lines.length === 0 ? (
                <tr>
                  <td colSpan={hasContainerType ? 4 : 3} style={{ padding: '16px 8px', color: '#9ca3af', fontStyle: 'italic', textAlign: 'center' }}>
                    {t('tasks_board.offerDetail.noLines', 'No lines in this calculation')}
                  </td>
                </tr>
              ) : (
                calc.lines.map((line) => (
                  <tr key={line.id} style={{ borderBottom: `1px solid ${BORDER_LIGHT}` }}>
                    <TdCell align="left" bold>{line.productName || line.chargeCode || '—'}</TdCell>
                    {hasContainerType && <TdCell align="left">{line.containerType || '—'}</TdCell>}
                    <TdCell align="left">{line.currencyCode}</TdCell>
                    <TdCell align="right" bold>{formatNumber(line.sellPrice)}</TdCell>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ))}

      <hr style={{ border: 'none', borderTop: `1px solid ${BORDER_LIGHT}`, margin: '20px 0' }} />

      {/* ================================================================
          TERMS & CONDITIONS
          ================================================================ */}
      <SectionLabel>{t('tasks_board.offerDetail.terms', 'Terms & Conditions')}</SectionLabel>
      <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.8 }}>
        {offer.validUntil && (
          <BulletItem>
            {t('tasks_board.offerDetail.validityNote', 'This offer is valid until')} {formatDate(offer.validUntil)}.
          </BulletItem>
        )}
        {offer.paymentTerms ? (
          <BulletItem>
            {t('tasks_board.offerDetail.paymentTerms', 'Payment terms')}: {offer.paymentTerms}
          </BulletItem>
        ) : (
          <BulletItem>
            {t('tasks_board.offerDetail.paymentTerms', 'Payment terms')}: Net 30 days from invoice date.
          </BulletItem>
        )}
        {offer.specialTerms ? (
          <BulletItem>{offer.specialTerms}</BulletItem>
        ) : (
          <>
            <BulletItem>Rates are subject to space and equipment availability at time of booking.</BulletItem>
            <BulletItem>Any additional charges not listed above (e.g. demurrage, detention) will be invoiced separately.</BulletItem>
          </>
        )}
      </div>
    </div>
  )
}

// ── Primitives ──

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: LABEL_COLOR,
        marginBottom: '10px',
      }}
    >
      {children}
    </div>
  )
}

function FieldCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function ThCell({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '8px 10px 6px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#374151',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

function TdCell({ children, align, bold }: { children: React.ReactNode; align: 'left' | 'right'; bold?: boolean }) {
  return (
    <td
      style={{
        textAlign: align,
        padding: '10px 10px',
        fontWeight: bold ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  )
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{ flexShrink: 0 }}>&bull;</span>
      <span>{children}</span>
    </div>
  )
}
