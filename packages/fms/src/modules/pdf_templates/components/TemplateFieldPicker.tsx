"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@open-mercato/ui/primitives/tooltip'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { COMMON_FIELDS, TEMPLATE_FIELDS, CONTROL_STRUCTURES } from '../lib/template-fields'
import type { PdfTemplateType, TemplateField } from '../lib/template-fields'

type Props = {
  templateType: PdfTemplateType
  onInsertTag: (tag: string) => void
  disabled?: boolean
}

export function TemplateFieldPicker({ templateType, onInsertTag, disabled }: Props) {
  const t = useT()
  
  const commonFields = COMMON_FIELDS
  const templateFields = TEMPLATE_FIELDS[templateType]
  const allFields = React.useMemo(() => 
    [...commonFields, ...templateFields].sort((a, b) => {
      const labelA = t(`pdf_templates.fields.labels.${a.tag}`, a.tag)
      const labelB = t(`pdf_templates.fields.labels.${b.tag}`, b.tag)
      return labelA.localeCompare(labelB)
    }),
    [commonFields, templateFields, t]
  )
  
  const handleFieldClick = (field: TemplateField) => {
    if (field.isArray && field.arrayItemFields) {
      // Insert full loop template
      const itemFields = field.arrayItemFields.map(f => `{{${f}}}`).join(' ')
      const template = `{{#each ${field.tag}}}\n  ${itemFields}\n{{/each}}`
      onInsertTag(template)
    } else {
      // Insert simple variable tag
      onInsertTag(`{{${field.tag}}}`)
    }
  }
  
  const handleControlClick = (control: typeof CONTROL_STRUCTURES[number]) => {
    onInsertTag(control.template)
  }
  
  const getFieldLabel = (tag: string) => {
    return t(`pdf_templates.fields.labels.${tag}`, tag)
  }
  
  const getFieldDescription = (tag: string) => {
    return t(`pdf_templates.fields.descriptions.${tag}`, '')
  }
  
  const getControlLabel = (id: string) => {
    return t(`pdf_templates.fields.labels.${id}`, id)
  }
  
  const getControlDescription = (id: string) => {
    return t(`pdf_templates.fields.descriptions.${id}`, '')
  }
  
  return (
    <div className="flex flex-col space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-3">
          {t('pdf_templates.fields.header', 'Available Fields')}
        </h4>
        <TooltipProvider>
          <div className="flex flex-wrap gap-2">
            {allFields.map((field) => (
              <Tooltip key={field.tag} delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFieldClick(field)}
                    disabled={disabled}
                    className="text-xs h-7 px-2"
                  >
                    {getFieldLabel(field.tag)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">{getFieldDescription(field.tag)}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
      
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold mb-3">
          {t('pdf_templates.fields.advanced_header', 'Advanced')}
        </h4>
        <TooltipProvider>
          <div className="flex flex-col gap-2">
            {CONTROL_STRUCTURES.map((control) => (
              <Tooltip key={control.id} delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleControlClick(control)}
                    disabled={disabled}
                    className="text-xs justify-start h-8"
                  >
                    {getControlLabel(control.id)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">{getControlDescription(control.id)}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
    </div>
  )
}
