'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Hash,
  Check,
  X,
  Edit2,
  Loader2,
  Trash2,
  Mail,
  Phone,
  FileText,
  Calendar,
  Briefcase,
} from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Input } from '@open-mercato/ui/primitives/input'
import { useT } from '@open-mercato/shared/lib/i18n/context'

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
  primaryContactEmail?: string | null
  primaryContactPhone?: string | null
}

export type ContractorHighlightsProps = {
  contractor: ContractorHighlightsData
  onNameSave: (value: string | null) => Promise<void>
  onShortNameSave: (value: string | null) => Promise<void>
  onTaxIdSave: (value: string | null) => Promise<void>
  onRegonSave: (value: string | null) => Promise<void>
  onActiveToggle: () => Promise<void>
  onDelete: () => void
  isDeleting: boolean
}

type InlineEditFieldProps = {
  value: string | null | undefined
  placeholder: string
  onSave: (value: string | null) => Promise<void>
  required?: boolean
}

function InlineEditField({
  value,
  placeholder,
  onSave,
  required = false,
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [editValue, setEditValue] = React.useState(value ?? '')
  const [isSaving, setIsSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleSave = React.useCallback(async () => {
    if (required && !editValue.trim()) return
    setIsSaving(true)
    try {
      await onSave(editValue.trim() || null)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }, [editValue, onSave, required])

  const handleCancel = React.useCallback(() => {
    setEditValue(value ?? '')
    setIsEditing(false)
  }, [value])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'Escape') {
        handleCancel()
      }
    },
    [handleSave, handleCancel]
  )

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  React.useEffect(() => {
    setEditValue(value ?? '')
  }, [value])

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-7 text-sm w-40"
          disabled={isSaving}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || (required && !editValue.trim())}
          className="h-6 w-6 p-0"
        >
          {isSaving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3 text-green-600" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={isSaving}
          className="h-6 w-6 p-0"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="flex items-center gap-1 text-sm hover:text-primary transition-colors group"
    >
      <span className={value ? '' : 'text-muted-foreground'}>
        {value || placeholder}
      </span>
      <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

export function ContractorHighlights({
  contractor,
  onNameSave,
  onShortNameSave,
  onTaxIdSave,
  onRegonSave,
  onActiveToggle,
  onDelete,
  isDeleting,
}: ContractorHighlightsProps) {
  const t = useT()
  const [isTogglingActive, setIsTogglingActive] = React.useState(false)

  const handleActiveToggle = React.useCallback(async () => {
    setIsTogglingActive(true)
    try {
      await onActiveToggle()
    } finally {
      setIsTogglingActive(false)
    }
  }, [onActiveToggle])

  return (
    <div className="space-y-3">
      {/* Top bar with back link and actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/backend/contractors"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('contractors.detail.actions.backToList', 'Contractors')}</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleActiveToggle}
            disabled={isTogglingActive}
            className="h-8"
          >
            {isTogglingActive && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {contractor.isActive
              ? t('contractors.list.actions.deactivate', 'Deactivate')
              : t('contractors.list.actions.activate', 'Activate')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/5"
          >
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            {t('contractors.list.actions.delete', 'Delete')}
          </Button>
        </div>
      </div>

      {/* Compact info row */}
      <div className="flex items-center gap-4 py-3 border-b">
        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-6 flex-wrap">
            {/* Name */}
            <div className="font-medium">
              <InlineEditField
                value={contractor.name}
                placeholder={t('contractors.form.placeholders.name', 'Company name')}
                onSave={onNameSave}
                required
              />
            </div>

            {/* Status badge */}
            <Badge variant={contractor.isActive ? 'default' : 'secondary'} className="h-5 text-xs">
              {contractor.isActive
                ? t('contractors.status.active', 'Active')
                : t('contractors.status.inactive', 'Inactive')}
            </Badge>

          <div className="h-4 w-px bg-border" />

          {/* Tax ID */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Hash className="h-3 w-3" />
            <InlineEditField
              value={contractor.taxId}
              placeholder="NIP"
              onSave={onTaxIdSave}
            />
          </div>

          {/* REGON */}
          {(contractor.regon || !contractor.taxId) && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="text-xs">REGON:</span>
              <InlineEditField
                value={contractor.regon}
                placeholder="-"
                onSave={onRegonSave}
              />
            </div>
          )}

          <div className="h-4 w-px bg-border" />

          {/* Email */}
          {contractor.primaryContactEmail && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span>{contractor.primaryContactEmail}</span>
            </div>
          )}

          {/* Phone */}
          {contractor.primaryContactPhone && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{contractor.primaryContactPhone}</span>
            </div>
          )}
          </div>

          {/* Official Name from REGON */}
          {contractor.officialName && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{t('contractors.detail.officialName', 'Official name')}:</span>{' '}
              {contractor.officialName}
            </div>
          )}
        </div>
      </div>

      {/* Official registration details row */}
      {(contractor.krs || contractor.registrationDate || contractor.pkdMainCode) && (
        <div className="flex items-center gap-6 flex-wrap text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
          {/* KRS */}
          {contractor.krs && (
            <div className="flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              <span className="font-medium">KRS:</span>
              <span>{contractor.krs}</span>
            </div>
          )}

          {/* Registration Date */}
          {contractor.registrationDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              <span className="font-medium">{t('contractors.detail.registrationDate', 'Registered')}:</span>
              <span>{contractor.registrationDate}</span>
            </div>
          )}

          {/* PKD Main Activity */}
          {contractor.pkdMainCode && (
            <div className="flex items-center gap-1.5">
              <Briefcase className="h-3 w-3" />
              <span className="font-medium">PKD:</span>
              <span>
                {contractor.pkdMainCode}
                {contractor.pkdMainDescription && (
                  <span className="text-muted-foreground/70"> - {contractor.pkdMainDescription}</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
