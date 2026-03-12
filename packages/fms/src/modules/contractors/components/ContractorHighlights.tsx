'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Edit2,
  Loader2,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Globe,
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
  onActiveToggle: () => Promise<void>
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

export function ContractorHighlights({
  contractor,
  roles = [],
  primaryAddress,
  onNameSave,
  onActiveToggle,
  onDelete,
  isDeleting,
}: ContractorHighlightsProps) {
  const t = useT()

  const shortId = contractor.id.substring(0, 8)
  const addressStr = primaryAddress ? formatAddress(primaryAddress) : null

  return (
    <div className="space-y-3">
      {/* Breadcrumb bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/backend/contractors"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('contractors.detail.actions.backToList', 'Contractors')}</span>
          <span className="text-muted-foreground/50 mx-1">/</span>
          <span className="text-foreground font-medium">{contractor.name}</span>
        </Link>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onActiveToggle}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>{t('contractors.detail.actions.edit', 'Edit')}</span>
          </button>
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

      {/* Header card */}
      <div className="border rounded-lg bg-card px-5 py-4 space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-wrap">
            <InlineEditField
              value={contractor.name}
              placeholder={t('contractors.form.placeholders.name', 'Company name')}
              onSave={onNameSave}
              required
              className="text-xl font-bold"
            />

            {/* Status badge */}
            <Badge
              variant={contractor.isActive ? 'default' : 'secondary'}
              className={`h-5 text-xs font-medium ${contractor.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400' : ''}`}
            >
              {contractor.isActive
                ? t('contractors.status.active', 'Active')
                : t('contractors.status.inactive', 'Inactive')}
            </Badge>

            {/* Role type badges */}
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

          <div className="flex flex-col items-end text-xs text-muted-foreground shrink-0 ml-4">
            <span>ID #{shortId}</span>
            <span>Since {formatMonthYear(contractor.createdAt)}</span>
          </div>
        </div>

        {/* Contact pills row */}
        <div className="flex items-center gap-2 flex-wrap">
          {contractor.primaryContactEmail && (
            <div className="inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span>{contractor.primaryContactEmail}</span>
            </div>
          )}
          {contractor.primaryContactPhone && (
            <div className="inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{contractor.primaryContactPhone}</span>
            </div>
          )}
          {addressStr && (
            <div className="inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{addressStr}</span>
            </div>
          )}
          {contractor.website && (
            <div className="inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" />
              <span>{contractor.website}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
