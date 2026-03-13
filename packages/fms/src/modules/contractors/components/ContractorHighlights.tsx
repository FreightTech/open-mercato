'use client'

import * as React from 'react'
import {
  Loader2,
  Trash2,
} from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { InlineEditField } from '../../../lib/inline-edit'

type ContractorRole = {
  roleTypeName: string
  roleTypeCode: string
  roleTypeColor: string | null
}

type ContractorAddress = {
  addressLine?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
}

type ContractorHighlightsData = {
  id: string
  name: string
  shortName?: string | null
  officialName?: string | null
  taxId?: string | null
  regon?: string | null
  krs?: string | null
  registrationDate?: string | null
  pkdMainCode?: string | null
  pkdMainDescription?: string | null
  isActive: boolean
  createdAt: string
  primaryContactEmail?: string | null
  primaryContactPhone?: string | null
  website?: string | null
}

export type ContractorHighlightsProps = {
  contractor: ContractorHighlightsData
  roles?: ContractorRole[]
  primaryAddress?: ContractorAddress | null
  onNameSave: (value: string | null) => Promise<void>
  onShortNameSave: (value: string | null) => Promise<void>
  onTaxIdSave: (value: string | null) => Promise<void>
  onRegonSave: (value: string | null) => Promise<void>
  onDelete: () => void
  isDeleting: boolean
}

function formatMonthYear(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function formatAddress(addr: ContractorAddress): string {
  const parts = [addr.addressLine, addr.city, addr.postalCode, addr.country].filter(Boolean)
  return parts.join(', ')
}

function HighlightCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      {children}
    </div>
  )
}

export function ContractorHighlights({
  contractor,
  roles = [],
  primaryAddress,
  onNameSave,
  onShortNameSave,
  onTaxIdSave,
  onRegonSave,
  onDelete,
  isDeleting,
}: ContractorHighlightsProps) {
  const t = useT()

  const shortId = contractor.id.substring(0, 8)
  const addressStr = primaryAddress ? formatAddress(primaryAddress) : null

  return (
    <div className="border rounded-lg bg-white">
      {/* Title row: name + badges + actions */}
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <InlineEditField
            value={contractor.name}
            placeholder={t('contractors.form.placeholders.name', 'Company name')}
            onSave={onNameSave}
            required
            className="text-xl font-bold"
          />

          <Badge
            variant={contractor.isActive ? 'default' : 'secondary'}
            className={`h-5 text-xs font-medium ${contractor.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400' : ''}`}
          >
            {contractor.isActive
              ? t('contractors.status.active', 'Active')
              : t('contractors.status.inactive', 'Inactive')}
          </Badge>

          {roles.map((role) => (
            <Badge
              key={role.roleTypeCode}
              variant="outline"
              className="h-5 text-xs font-medium"
              style={role.roleTypeColor ? {
                borderColor: role.roleTypeColor,
                color: role.roleTypeColor,
                backgroundColor: `${role.roleTypeColor}15`,
              } : undefined}
            >
              {role.roleTypeName}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
            <span>{t('contractors.list.actions.delete', 'Delete')}</span>
          </button>
        </div>
      </div>

      {/* Data grid */}
      <div className="border-t">
        {/* Row 1: Company identifiers */}
        <div className="grid grid-cols-6 border-b divide-x">
          <HighlightCell label="Short Name">
            <InlineEditField
              value={contractor.shortName || ''}
              placeholder="-"
              onSave={onShortNameSave}
              className="text-sm"
            />
          </HighlightCell>
          <HighlightCell label="Official Name">
            <span className="text-sm">{contractor.officialName || '-'}</span>
          </HighlightCell>
          <HighlightCell label="Tax ID (NIP)">
            <InlineEditField
              value={contractor.taxId || ''}
              placeholder="-"
              onSave={onTaxIdSave}
              className="text-sm"
            />
          </HighlightCell>
          <HighlightCell label="REGON">
            <InlineEditField
              value={contractor.regon || ''}
              placeholder="-"
              onSave={onRegonSave}
              className="text-sm"
            />
          </HighlightCell>
          <HighlightCell label="KRS">
            <span className="text-sm">{contractor.krs || '-'}</span>
          </HighlightCell>
          <HighlightCell label="Since">
            <span className="text-sm">{formatMonthYear(contractor.createdAt)}</span>
          </HighlightCell>
        </div>

        {/* Row 2: Contact & location */}
        <div className="grid grid-cols-6 divide-x">
          <HighlightCell label="Email">
            <span className="text-sm">{contractor.primaryContactEmail || '-'}</span>
          </HighlightCell>
          <HighlightCell label="Phone">
            <span className="text-sm">{contractor.primaryContactPhone || '-'}</span>
          </HighlightCell>
          <div className="col-span-2">
            <HighlightCell label="Address">
              <span className="text-sm">{addressStr || '-'}</span>
            </HighlightCell>
          </div>
          <HighlightCell label="PKD">
            <span className="text-sm">{contractor.pkdMainCode || '-'}</span>
          </HighlightCell>
          <HighlightCell label="ID">
            <span className="text-sm">#{shortId}</span>
          </HighlightCell>
        </div>
      </div>
    </div>
  )
}
