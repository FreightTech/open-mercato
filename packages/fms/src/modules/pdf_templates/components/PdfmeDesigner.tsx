"use client"

import * as React from 'react'
import type { Template, Font } from '@pdfme/common'
import { text, image, barcodes, line, rectangle, ellipse, svg } from '@pdfme/schemas'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { PdfmeTemplateJson } from '../data/entities'
import type { OfferTemplateVariable } from '../lib/default-pdfme-templates'

/**
 * Available plugins for the pdfme designer.
 * These are the schema types users can add to their templates.
 */
const plugins = {
  Text: text,
  Image: image,
  SVG: svg,
  Line: line,
  Rectangle: rectangle,
  Ellipse: ellipse,
  QRCode: barcodes.qrcode,
  Code128: barcodes.code128,
  EAN13: barcodes.ean13,
}

export interface PdfmeDesignerProps {
  /** Initial template to load in the designer */
  initialTemplate: PdfmeTemplateJson
  /** Template type (e.g., 'offer') */
  templateType: string
  /** Callback when user saves the template */
  onSave: (template: PdfmeTemplateJson) => Promise<void>
  /** Callback when template changes (for auto-save or dirty state) */
  onChange?: (template: PdfmeTemplateJson) => void
  /** Available template variables for insertion */
  variables?: readonly OfferTemplateVariable[]
  /** Whether the component is in a loading state */
  loading?: boolean
  /** Custom fonts to use in the designer */
  fonts?: Font
}

/**
 * PdfmeDesigner wraps the @pdfme/ui Designer component.
 * 
 * It provides a visual drag-and-drop interface for creating PDF templates.
 * Users can add text, images, barcodes, shapes, and tables to design
 * their document layout.
 * 
 * @example
 * ```tsx
 * <PdfmeDesigner
 *   initialTemplate={template}
 *   templateType="offer"
 *   variables={OFFER_TEMPLATE_VARIABLES}
 *   onSave={async (t) => await saveTemplate(t)}
 * />
 * ```
 */
export function PdfmeDesigner({
  initialTemplate,
  templateType,
  onSave,
  onChange,
  variables,
  loading = false,
  fonts,
}: PdfmeDesignerProps) {
  const t = useT()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const designerRef = React.useRef<any>(null)
  const [hasChanges, setHasChanges] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  // Dynamically import the Designer to avoid SSR issues
  React.useEffect(() => {
    let isMounted = true

    async function initDesigner() {
      if (!containerRef.current) return

      try {
        // Dynamic import for client-side only
        const { Designer } = await import('@pdfme/ui')

        if (!isMounted || !containerRef.current) return

        // Clean up any existing designer
        if (designerRef.current) {
          try {
            designerRef.current.destroy()
          } catch (e) {
            // Ignore cleanup errors
          }
        }

        // Create new designer instance
        const designer = new Designer({
          domContainer: containerRef.current,
          template: initialTemplate as Template,
          plugins,
          options: fonts ? { font: fonts } : undefined,
        })

        // Set up change handlers
        designer.onChangeTemplate(() => {
          if (!isMounted) return
          setHasChanges(true)
          if (onChange) {
            const template = designer.getTemplate() as PdfmeTemplateJson
            onChange(template)
          }
        })

        designerRef.current = designer
        setMounted(true)
      } catch (error) {
        console.error('Failed to initialize pdfme Designer:', error)
        flash(t('pdf_templates.errors.designer_init', 'Failed to initialize template designer'), 'error')
      }
    }

    initDesigner()

    return () => {
      isMounted = false
      if (designerRef.current) {
        try {
          designerRef.current.destroy()
        } catch (e) {
          // Ignore cleanup errors
        }
        designerRef.current = null
      }
    }
  }, [initialTemplate, fonts])

  // Handle save
  const handleSave = async () => {
    if (!designerRef.current) return

    setSaving(true)
    try {
      const template = designerRef.current.getTemplate() as PdfmeTemplateJson
      await onSave(template)
      setHasChanges(false)
      flash(t('pdf_templates.messages.template_saved', 'Template saved successfully'), 'success')
    } catch (error) {
      console.error('Failed to save template:', error)
      flash(t('pdf_templates.errors.save_failed', 'Failed to save template'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Get current template (for preview)
  const getCurrentTemplate = (): PdfmeTemplateJson | null => {
    if (!designerRef.current) return null
    return designerRef.current.getTemplate() as PdfmeTemplateJson
  }

  // Handle preview
  const handlePreview = async () => {
    const template = getCurrentTemplate()
    if (!template) {
      flash(t('pdf_templates.errors.no_template', 'No template to preview'), 'error')
      return
    }

    // Create sample inputs for preview
    const sampleInputs = variables
      ? [
          variables.reduce((acc, v) => {
            acc[v.name] = v.type === 'image' ? '' : `{{${v.name}}}`
            return acc
          }, {} as Record<string, string>),
        ]
      : [{}]

    try {
      const response = await fetch('/api/pdf_templates/pdfme/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateJson: template,
          inputs: sampleInputs,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || 'Preview failed')
      }

      // Open PDF in new tab
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (error) {
      console.error('Preview failed:', error)
      flash(t('pdf_templates.errors.preview_failed', 'Failed to generate preview'), 'error')
    }
  }

  // Insert variable at cursor (if supported)
  const insertVariable = (variableName: string) => {
    // pdfme Designer doesn't have a direct "insert at cursor" API
    // Users need to type {{variableName}} in text fields
    // This copies the variable syntax to clipboard for easy pasting
    const variableSyntax = `{{${variableName}}}`
    navigator.clipboard.writeText(variableSyntax).then(() => {
      flash(
        t('pdf_templates.messages.variable_copied', `Copied "${variableSyntax}" to clipboard. Paste into a text field.`),
        'success'
      )
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div>
          <h2 className="text-lg font-semibold">
            {t('pdf_templates.designer.title', 'Template Designer')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'pdf_templates.designer.description',
              `Design your ${templateType} template using drag and drop`
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Variable picker dropdown */}
          {variables && variables.length > 0 && (
            <div className="relative group">
              <Button variant="outline" size="sm">
                {t('pdf_templates.designer.insert_variable', 'Insert Variable')}
              </Button>
              <div className="absolute right-0 mt-1 w-64 max-h-80 overflow-y-auto bg-popover border rounded-md shadow-lg hidden group-hover:block z-50">
                <div className="p-2">
                  {variables.map((v) => (
                    <button
                      key={v.name}
                      onClick={() => insertVariable(v.name)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md"
                    >
                      <span className="font-mono text-primary">{'{{' + v.name + '}}'}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handlePreview}>
            {t('pdf_templates.designer.preview', 'Preview PDF')}
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                {t('pdf_templates.designer.saving', 'Saving...')}
              </>
            ) : hasChanges ? (
              t('pdf_templates.designer.save', 'Save Template')
            ) : (
              t('pdf_templates.designer.saved', 'Saved')
            )}
          </Button>
        </div>
      </div>

      {/* Designer container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ height: 'calc(100vh - 200px)' }}
      />

      {/* Loading overlay while designer initializes */}
      {!mounted && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="text-center">
            <Spinner className="mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('pdf_templates.designer.loading', 'Loading designer...')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default PdfmeDesigner
