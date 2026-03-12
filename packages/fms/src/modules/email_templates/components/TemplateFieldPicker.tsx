"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  FIELD_GROUPS,
  CONTROL_STRUCTURES,
  getGroupedFieldsForType,
  generateLoopTemplate,
  type TemplateType,
  type TemplateField,
  type FieldGroup,
} from '../lib/template-fields'

type Props = {
  templateType: TemplateType
  onInsertTag: (tag: string) => void
  disabled?: boolean
}

export function TemplateFieldPicker({ templateType, onInsertTag, disabled }: Props) {
  const t = useT()
  const [searchQuery, setSearchQuery] = React.useState('')

  const groupedFields = React.useMemo(
    () => getGroupedFieldsForType(templateType),
    [templateType]
  )

  const filteredGroupedFields = React.useMemo(() => {
    if (!searchQuery.trim()) return groupedFields

    const query = searchQuery.toLowerCase()
    const result: Record<FieldGroup, TemplateField[]> = {
      common: [],
      offer: [],
      invoice: [],
      shipment: [],
      booking: [],
      quote: [],
      lines: [],
    }

    for (const [group, fields] of Object.entries(groupedFields)) {
      result[group as FieldGroup] = fields.filter((field) =>
        field.tag.toLowerCase().includes(query)
      )
    }

    return result
  }, [groupedFields, searchQuery])

  const handleFieldClick = (field: TemplateField) => {
    if (field.isArray) {
      onInsertTag(generateLoopTemplate(field))
    } else {
      onInsertTag(`{{${field.tag}}}`)
    }
  }

  const handleControlClick = (control: (typeof CONTROL_STRUCTURES)[number]) => {
    onInsertTag(control.template)
  }

  const getFieldLabel = (tag: string) => {
    return t(`email_templates.fields.${tag}`, tag)
  }

  const getGroupLabel = (groupId: string) => {
    const group = FIELD_GROUPS.find((g) => g.id === groupId)
    return t(`email_templates.field_groups.${groupId}`, group?.label || groupId)
  }

  const hasVisibleGroups = React.useMemo(() => {
    return Object.values(filteredGroupedFields).some((fields) => fields.length > 0)
  }, [filteredGroupedFields])

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-2">
          {t('email_templates.field_picker.title', 'Insert Field')}
        </h4>
        <Input
          type="text"
          placeholder={t('email_templates.field_picker.search', 'Search fields...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-sm"
          disabled={disabled}
        />
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {!hasVisibleGroups && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('email_templates.field_picker.no_results', 'No fields match your search')}
          </p>
        )}

        {FIELD_GROUPS.map((group) => {
          const fields = filteredGroupedFields[group.id as FieldGroup]
          if (!fields || fields.length === 0) return null

          return (
            <div key={group.id}>
              <h5 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                {getGroupLabel(group.id)}
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
                    title={
                      field.isArray
                        ? t('email_templates.field_picker.click_for_loop', 'Click to insert loop template')
                        : `{{${field.tag}}}`
                    }
                  >
                    {getFieldLabel(field.tag)}
                    {field.isArray && <span className="ml-1 text-muted-foreground">[]</span>}
                  </Button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t pt-3">
        <h5 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          {t('email_templates.field_picker.control_structures', 'Control Structures')}
        </h5>
        <div className="flex flex-col gap-1.5">
          {CONTROL_STRUCTURES.map((control) => (
            <Button
              type="button"
              key={control.id}
              variant="outline"
              size="sm"
              onClick={() => handleControlClick(control)}
              disabled={disabled}
              className="text-xs h-7 justify-start"
            >
              {t(`email_templates.field_picker.control_${control.id}`, control.id === 'if' ? 'If/Then Block' : 'Loop/Each Block')}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
