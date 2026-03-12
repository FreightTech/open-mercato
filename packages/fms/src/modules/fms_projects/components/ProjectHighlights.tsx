'use client'

import * as React from 'react'
import { Trash2, Loader2, Link2, ExternalLink } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  InlineEditField,
  InlineDateField,
  InlineSelectField,
  InlineEntitySearchField,
} from '../../../lib/inline-edit'
import {
  formatCurrency,
  calculateFinancialsInCurrency,
  getAvailableCurrencies,
  aggregateContainerSummary,
  type ProjectLineForFinancials,
} from '../lib/financials'
import type { Project, TransportModeType } from './ProjectWizard/hooks/useProjectWizard'
import type { ProjectSeaContainer } from './ProjectWizard/hooks/useProjectWizard'
import { FMS_PROJECT_STATUSES, TRANSPORT_MODES, DIRECTIONS, INCOTERMS } from '../data/types'
import type { ExchangeRateSnapshot } from '../../fms_offers/data/types'

// Invoicing status options
const INVOICING_STATUS_OPTIONS = [
  { value: 'not_invoiced', label: 'Not Invoiced' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid_resolved', label: 'Paid & Resolved' },
]

const PROJECT_STATUS_OPTIONS = FMS_PROJECT_STATUSES.map((s) => ({
  value: s,
  label: s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' '),
}))

const TRANSPORT_MODE_OPTIONS = TRANSPORT_MODES.map((m) => ({
  value: m,
  label: m.toUpperCase(),
}))

const DIRECTION_OPTIONS = DIRECTIONS.map((d) => ({
  value: d,
  label: d.charAt(0).toUpperCase() + d.slice(1),
}))

const INCOTERM_OPTIONS = INCOTERMS.map((i) => ({ value: i, label: i }))

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'confirmed':
    case 'validated':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'in_transit':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'delivered':
    case 'completed':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'cancelled':
      return 'bg-red-50 text-red-700 border-red-200'
    default:
      return ''
  }
}

function getInvoicingBadgeClass(status: string): string {
  switch (status) {
    case 'not_invoiced':
      return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'invoiced':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'partially_paid':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'paid_resolved':
      return 'bg-green-50 text-green-700 border-green-200'
    default:
      return ''
  }
}

export type ProjectHighlightsProps = {
  project: Project
  seaContainers: ProjectSeaContainer[]
  projectLines: ProjectLineForFinancials[]
  onUpdate: (updates: Partial<Project>) => void
  onDelete: () => void
  isDeleting?: boolean
  onInvoicingStatusChange: (status: string) => void
  baseCurrency?: string | null
  exchangeRates?: ExchangeRateSnapshot[] | null
  offerId?: string | null
  onViewDetails?: () => void
  onLinkedClick?: () => void
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      {children}
    </div>
  )
}

export function ProjectHighlights({
  project: projectProp,
  seaContainers,
  projectLines,
  onUpdate,
  onDelete,
  isDeleting = false,
  onInvoicingStatusChange,
  baseCurrency,
  exchangeRates,
  offerId,
  onViewDetails,
  onLinkedClick,
}: ProjectHighlightsProps) {
  // Optimistic local state: merge pending updates immediately for instant UI feedback
  const [optimisticUpdates, setOptimisticUpdates] = React.useState<Partial<Project>>({})
  const project = React.useMemo(
    () => ({ ...projectProp, ...optimisticUpdates }) as Project,
    [projectProp, optimisticUpdates]
  )

  // Clear optimistic updates when the prop changes (server confirmed the update)
  const prevProjectRef = React.useRef(projectProp)
  React.useEffect(() => {
    if (prevProjectRef.current !== projectProp) {
      prevProjectRef.current = projectProp
      setOptimisticUpdates({})
    }
  }, [projectProp])

  const handleUpdate = React.useCallback(
    (updates: Partial<Project>) => {
      setOptimisticUpdates((prev) => ({ ...prev, ...updates }))
      onUpdate(updates)
    },
    [onUpdate]
  )

  const [displayCurrency, setDisplayCurrency] = React.useState(
    baseCurrency || project.currencyCode || 'USD'
  )

  React.useEffect(() => {
    if (baseCurrency && displayCurrency === (project.currencyCode || 'USD')) {
      setDisplayCurrency(baseCurrency)
    }
  }, [baseCurrency, project.currencyCode, displayCurrency])

  const financials = React.useMemo(
    () => calculateFinancialsInCurrency(projectLines, displayCurrency, exchangeRates),
    [projectLines, displayCurrency, exchangeRates]
  )

  const availableCurrencies = React.useMemo(
    () =>
      getAvailableCurrencies(
        projectLines,
        project.currencyCode || 'USD',
        baseCurrency,
        exchangeRates
      ),
    [projectLines, project.currencyCode, baseCurrency, exchangeRates]
  )

  const containerSummary = React.useMemo(
    () => aggregateContainerSummary(seaContainers),
    [seaContainers]
  )

  const fileNumber = project.projectNumber || project.id.slice(0, 8)
  const statusOption = PROJECT_STATUS_OPTIONS.find((o) => o.value === project.status)
  const directionOption = DIRECTION_OPTIONS.find((o) => o.value === project.direction)
  const modes = project.transportModes || []

  const saveField = React.useCallback(
    (field: string) => async (value: string | null) => {
      handleUpdate({ [field]: value } as Partial<Project>)
    },
    [handleUpdate]
  )

  const saveEntityField = React.useCallback(
    (idField: string, nameField: string) =>
      async (value: { id: string; name: string } | null) => {
        if (value) {
          handleUpdate({ [idField]: value.id, [nameField]: value.name } as unknown as Partial<Project>)
        } else {
          handleUpdate({ [idField]: null, [nameField]: null } as unknown as Partial<Project>)
        }
      },
    [handleUpdate]
  )

  return (
      <div className="border rounded-lg bg-white">
        {/* Title row: project number + badges + actions */}
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <InlineEditField
              value={fileNumber}
              placeholder="File number"
              onSave={saveField('projectNumber')}
              className="text-xl font-bold"
            />

            <Badge
              variant="outline"
              className={`h-5 text-xs font-medium ${getStatusBadgeClass(project.status)}`}
            >
              {statusOption?.label || 'Draft'}
            </Badge>

            {modes.map((mode) => (
              <Badge key={mode} variant="secondary" className="h-5 text-xs font-medium uppercase">
                {mode}
              </Badge>
            ))}

            {directionOption && (
              <Badge variant="outline" className="h-5 text-xs font-medium">
                {directionOption.label}
              </Badge>
            )}

            {project.incoterm && (
              <Badge variant="outline" className="h-5 text-xs font-medium">
                {project.incoterm}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {offerId && (
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:bg-muted transition-colors"
                onClick={onLinkedClick}
              >
                <Link2 className="h-3 w-3 mr-1" />
                Linked
              </Badge>
            )}
            {onViewDetails && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onViewDetails}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Costs
              </Button>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1 text-sm text-destructive hover:text-destructive/80 transition-colors"
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Data grid with table-like borders */}
        <div className="border-t">
          {/* Row 1: Route & Dates */}
          <div className="grid grid-cols-6 border-b divide-x">
            <Cell label="Origin">
              <InlineEntitySearchField
                value={
                  project.originLocationId && project.originAddress
                    ? { id: project.originLocationId, name: project.originAddress }
                    : null
                }
                entityType="fms_locations:fms_location"
                placeholder="Select origin"
                onSave={saveEntityField('originLocationId', 'originAddress')}
              />
            </Cell>
            <Cell label="Destination">
              <InlineEntitySearchField
                value={
                  project.destinationLocationId && project.destinationAddress
                    ? { id: project.destinationLocationId, name: project.destinationAddress }
                    : null
                }
                entityType="fms_locations:fms_location"
                placeholder="Select destination"
                onSave={saveEntityField('destinationLocationId', 'destinationAddress')}
              />
            </Cell>
            <Cell label="ETD">
              <InlineDateField value={project.etd} placeholder="Set ETD" onSave={saveField('etd')} />
            </Cell>
            <Cell label="ETA">
              <InlineDateField value={project.eta} placeholder="Set ETA" onSave={saveField('eta')} />
            </Cell>
            <Cell label="Carrier">
              <InlineEntitySearchField
                value={
                  project.carrierId && project.carrierName
                    ? { id: project.carrierId, name: project.carrierName }
                    : null
                }
                entityType="fms_products:fms_carrier"
                placeholder="Select carrier"
                onSave={saveEntityField('carrierId', 'carrierName')}
              />
            </Cell>
            <Cell label="Booking #">
              <InlineEditField
                value={project.bookingNumber}
                placeholder="Enter booking #"
                onSave={saveField('bookingNumber')}
              />
            </Cell>
          </div>

          {/* Row 2: People & Classification */}
          <div className="grid grid-cols-6 border-b divide-x">
            <Cell label="Client">
              <InlineEntitySearchField
                value={
                  project.clientId && project.clientName
                    ? { id: project.clientId, name: project.clientName }
                    : null
                }
                entityType="contractors:contractor"
                placeholder="Select client"
                onSave={saveEntityField('clientId', 'clientName')}
              />
            </Cell>
            <Cell label="Operator">
              <InlineEntitySearchField
                value={
                  project.operatorId && project.operatorName
                    ? { id: project.operatorId, name: project.operatorName }
                    : null
                }
                entityType="auth:user"
                placeholder="Select operator"
                onSave={saveEntityField('operatorId', 'operatorName')}
              />
            </Cell>
            <Cell label="Sales">
              <InlineEntitySearchField
                value={
                  project.salesPersonId && project.salesPersonName
                    ? { id: project.salesPersonId, name: project.salesPersonName }
                    : null
                }
                entityType="auth:user"
                placeholder="Select sales"
                onSave={saveEntityField('salesPersonId', 'salesPersonName')}
              />
            </Cell>
            <Cell label="Containers">
              <span className="text-sm">{containerSummary}</span>
            </Cell>
            <Cell label="Mode">
              <InlineSelectField
                value={modes[0] || null}
                options={TRANSPORT_MODE_OPTIONS}
                placeholder="Select mode"
                onSave={async (value) => {
                  if (value) {
                    const current = project.transportModes || []
                    if (!current.includes(value as TransportModeType)) {
                      handleUpdate({ transportModes: [...current, value as TransportModeType] })
                    }
                  }
                }}
                renderValue={() => (
                  <span className="text-sm">
                    {modes.length > 0
                      ? modes.map((m) => m.toUpperCase()).join(', ')
                      : <span className="text-muted-foreground">Select mode</span>}
                  </span>
                )}
              />
            </Cell>
            <Cell label="Status">
              <InlineSelectField
                value={project.status}
                options={PROJECT_STATUS_OPTIONS}
                placeholder="Set status"
                onSave={saveField('status')}
                renderValue={(val) => {
                  const opt = PROJECT_STATUS_OPTIONS.find((o) => o.value === val)
                  return (
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusBadgeClass(val)}`}
                    >
                      {opt?.label || 'Draft'}
                    </Badge>
                  )
                }}
              />
            </Cell>
          </div>

          {/* Row 3: Financials */}
          <div className="grid grid-cols-6 divide-x">
            <Cell label="Est. Cost">
              <span className="text-sm font-medium">
                {formatCurrency(financials.estCost, displayCurrency)}
              </span>
            </Cell>
            <Cell label="Actual Cost">
              <span
                className={`text-sm font-medium ${financials.actualCost > 0 ? 'text-red-600' : ''}`}
              >
                {formatCurrency(financials.actualCost, displayCurrency)}
              </span>
            </Cell>
            <Cell label="Est. Sell">
              <span className="text-sm font-medium">
                {formatCurrency(financials.estSell, displayCurrency)}
              </span>
            </Cell>
            <Cell label="Actual Sell">
              <span className="text-sm font-medium">
                {formatCurrency(financials.actualSell, displayCurrency)}
              </span>
            </Cell>
            <Cell label="Margin">
              <span
                className={`text-sm font-medium ${financials.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {formatCurrency(financials.margin, displayCurrency)}{' '}
                <span className="text-xs">
                  ({financials.marginPercent.toFixed(1)}%)
                </span>
              </span>
            </Cell>
            <Cell label="Invoicing">
              <InlineSelectField
                value={project.invoicingStatus || 'not_invoiced'}
                options={INVOICING_STATUS_OPTIONS}
                placeholder="Set status"
                onSave={async (value) => {
                  setOptimisticUpdates((prev) => ({ ...prev, invoicingStatus: value || 'not_invoiced' }))
                  onInvoicingStatusChange(value || 'not_invoiced')
                }}
                renderValue={(val) => {
                  const opt = INVOICING_STATUS_OPTIONS.find((o) => o.value === val)
                  return (
                    <Badge
                      variant="outline"
                      className={`text-xs ${getInvoicingBadgeClass(val)}`}
                    >
                      {opt?.label || 'Not Invoiced'}
                    </Badge>
                  )
                }}
              />
            </Cell>
          </div>
        </div>

        {/* Currency selector row */}
        {availableCurrencies.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-2 border-t">
            <span>Currency:</span>
            {availableCurrencies.map((curr) => (
              <button
                key={curr}
                type="button"
                onClick={() => setDisplayCurrency(curr)}
                className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                  curr === displayCurrency
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>
        )}
      </div>
  )
}
