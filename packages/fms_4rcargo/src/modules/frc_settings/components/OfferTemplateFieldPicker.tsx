"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { OFFER_TEMPLATE_FIELDS, FIELD_GROUPS, generateLoopTemplate } from '../lib/offer-template-fields'
import type { TemplateField, FieldGroup } from '../lib/offer-template-fields'

type Props = {
  onInsertTag: (tag: string) => void
  disabled?: boolean
}

export function OfferTemplateFieldPicker({ onInsertTag, disabled }: Props) {
  const t = useT()
  const [searchQuery, setSearchQuery] = React.useState('')

  const filteredFields = React.useMemo(() => {
    if (!searchQuery.trim()) return OFFER_TEMPLATE_FIELDS
    const query = searchQuery.toLowerCase()
    return OFFER_TEMPLATE_FIELDS.filter(
      (field) =>
        field.label.toLowerCase().includes(query) ||
        field.tag.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const groupedFields = React.useMemo(() => {
    const groups: Record<FieldGroup, TemplateField[]> = {
      offer: [],
      rates: [],
      client: [],
      company: [],
      routing: [],
      lines: [],
    }
    for (const field of filteredFields) {
      groups[field.group as FieldGroup].push(field)
    }
    return groups
  }, [filteredFields])

  const handleFieldClick = (field: TemplateField) => {
    if (field.isArray) {
      onInsertTag(generateLoopTemplate(field))
    } else {
      onInsertTag(`{{${field.tag}}}`)
    }
  }

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-2">
          {t('frc_settings.offer_templates.field_picker.title', 'Insert Field')}
        </h4>
        <Input
          type="text"
          placeholder={t('frc_settings.offer_templates.field_picker.search', 'Search fields...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-sm"
          disabled={disabled}
        />
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {FIELD_GROUPS.map((group) => {
          const fields = groupedFields[group.id]
          if (fields.length === 0) return null

          return (
            <div key={group.id}>
              <h5 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                {t(`frc_settings.offer_templates.field_picker.groups.${group.id}`, group.label)}
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {fields.map((field) => (
                  <Button
                    type="button"
                    key={field.tag}
                    variant="outline"
                    size="sm"
                    onClick={() => handleFieldClick(field)}
                    disabled={disabled}
                    className="text-xs h-7 px-2"
                    title={field.isArray ? 'Click to insert loop template' : `Insert {{${field.tag}}}`}
                  >
                    {field.label}
                    {field.isArray && (
                      <span className="ml-1 text-muted-foreground">[]</span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t pt-3">
        <h5 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          {t('frc_settings.offer_templates.field_picker.advanced', 'Control Structures')}
        </h5>
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onInsertTag('{{#if variableName}}\n  Content when true\n{{/if}}')}
            disabled={disabled}
            className="text-xs h-7 justify-start"
          >
            If/Then Block
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onInsertTag('{{#each arrayName}}\n  {{this}}\n{{/each}}')}
            disabled={disabled}
            className="text-xs h-7 justify-start"
          >
            Loop/Each Block
          </Button>
        </div>
      </div>
    </div>
  )
}
