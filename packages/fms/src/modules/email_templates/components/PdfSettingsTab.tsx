"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { Eye, Info } from 'lucide-react'
import type { SharedBrandSettings } from '../lib/shared-brand-settings'

type PdfmeTemplateInfo = {
  id?: string
  templateType: string
  name: string | null
  isActive: boolean
  isDefault: boolean
  updatedAt?: string
}

type PdfSettingsTabProps = {
  brandSettings: SharedBrandSettings
}

const TEMPLATE_TYPES = [
  { type: 'offer', label: 'Offer Template', description: 'PDF template for freight offers' },
] as const

// Sample offer data for preview
const SAMPLE_OFFER_DATA = {
  offerNumber: 'OFF-2026-00001',
  version: '1',
  status: 'sent',
  createdDate: 'March 12, 2026',
  validUntil: '2026-04-12',
  isExpired: false,
  clientName: 'ACME Corporation',
  clientAddress: '123 Business Street, Warsaw, Poland',
  clientTaxId: '1234567890',
  incoterms: 'CFR',
  cargoDescription: 'Industrial Equipment',
  cargoType: 'General Cargo',
  currencyCode: 'EUR',
  paymentTerms: '30 days',
  customerNotes: 'Handle with care',
  exchangeRates: 'EUR: 1.00, USD: 1.08',
  routes: [
    {
      routeLabel: 'EXPORT/FCL Warsaw → Hamburg → Shanghai',
      transportModeClass: 'mode-sea',
      lines: [
        { lineNumber: '1', productName: 'Ocean Freight', currencyCode: 'EUR', containerSize: "40'HC", quantity: '1', unitPrice: '1,800.00', amount: '1,800.00' },
        { lineNumber: '2', productName: 'THC Origin', currencyCode: 'EUR', containerSize: '-', quantity: '1', unitPrice: '350.00', amount: '350.00' },
        { lineNumber: '3', productName: 'Documentation Fee', currencyCode: 'EUR', containerSize: '-', quantity: '1', unitPrice: '50.00', amount: '50.00' },
      ],
    },
  ],
  // Labels
  labelOffer: 'OFFER',
  labelClient: 'CLIENT',
  labelTaxId: 'TAX ID',
  labelIncoterms: 'Incoterms',
  labelValidity: 'Valid until',
  labelPaymentTerms: 'Payment terms',
  labelCargo: 'Cargo',
  labelCargoType: 'Cargo type',
  labelCurrency: 'Currency',
  labelLineNumber: '#',
  labelName: 'Name',
  labelCurrencyCol: 'Currency',
  labelFeeScope: 'Scope',
  labelQuantity: 'Qty',
  labelRate: 'Rate',
  labelTotal: 'Total',
  labelCustomerNotes: 'Notes',
  labelExchangeRates: 'Exchange rates',
  labelTermsTitle: 'TERMS & CONDITIONS',
}

export function PdfSettingsTab({ brandSettings }: PdfSettingsTabProps) {
  const t = useT()
  const router = useRouter()

  const [loading, setLoading] = React.useState(true)
  const [templates, setTemplates] = React.useState<Record<string, PdfmeTemplateInfo>>({})
  const [previewingType, setPreviewingType] = React.useState<string | null>(null)
  const [resettingType, setResettingType] = React.useState<string | null>(null)

  // Load template status for all types
  const loadTemplates = React.useCallback(async () => {
    setLoading(true)
    try {
      const results: Record<string, PdfmeTemplateInfo> = {}

      for (const { type } of TEMPLATE_TYPES) {
        const { ok, result } = await apiCall<PdfmeTemplateInfo>(
          `/api/pdf_templates/pdfme?type=${type}&includeDefault=true`
        )
        if (ok && result) {
          results[type] = result
        } else {
          // No template exists - mark as default
          results[type] = {
            templateType: type,
            name: null,
            isActive: true,
            isDefault: true,
          }
        }
      }

      setTemplates(results)
    } catch (err) {
      console.error('Failed to load pdfme templates:', err)
      flash(t('pdf_templates.errors.load_failed', 'Failed to load templates'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t])

  React.useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  // Preview PDF
  const handlePreview = async (type: string) => {
    setPreviewingType(type)
    try {
      const response = await fetch('/api/pdf_templates/pdfme/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType: type,
          inputs: [SAMPLE_OFFER_DATA],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Preview generation failed')
      }

      // Open PDF in new tab
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Failed to preview PDF:', err)
      flash(t('pdf_templates.errors.preview_failed', 'Failed to generate preview'), 'error')
    } finally {
      setPreviewingType(null)
    }
  }

  // Reset to default template
  const handleReset = async (type: string) => {
    if (!confirm(t('pdf_templates.confirm_reset', 'Are you sure you want to reset this template to default?'))) {
      return
    }

    setResettingType(type)
    try {
      const { ok } = await apiCall(`/api/pdf_templates/pdfme?type=${type}`, {
        method: 'DELETE',
      })

      if (ok) {
        flash(t('pdf_templates.messages.template_reset', 'Template reset to default'), 'success')
        await loadTemplates()
      } else {
        throw new Error('Reset failed')
      }
    } catch (err) {
      console.error('Failed to reset template:', err)
      flash(t('pdf_templates.errors.reset_failed', 'Failed to reset template'), 'error')
    } finally {
      setResettingType(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">
          {t('templates.pdf.title', 'PDF Templates')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('templates.pdf.description', 'Design PDF templates visually with drag-and-drop')}
        </p>
      </div>

      {/* Brand Integration Note */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {t(
            'pdf_templates.brand_note',
            'Brand colors and company logo from the Brand tab are automatically available as variables in your PDF templates.'
          )}
        </AlertDescription>
      </Alert>

      {/* Template List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('pdf_templates.document_templates', 'Document Templates')}</CardTitle>
              <CardDescription>
                {t('pdf_templates.document_templates_desc', 'Manage your PDF document templates')}
              </CardDescription>
            </div>
            <Button asChild>
              <Link href="/backend/pdf-designer">
                {t('pdf_templates.actions.create_template', 'Create Template')}
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {TEMPLATE_TYPES.map(({ type, label, description }) => {
            const template = templates[type]
            const isDefault = template?.isDefault ?? true
            const isPreviewLoading = previewingType === type
            const isResetLoading = resettingType === type

            return (
              <div
                key={type}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{label}</h4>
                    <Badge variant={isDefault ? 'secondary' : 'default'}>
                      {isDefault
                        ? t('pdf_templates.status.default', 'Default')
                        : t('pdf_templates.status.custom', 'Custom')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{description}</p>
                  {!isDefault && template?.updatedAt && (
                    <p className="text-xs text-muted-foreground">
                      {t('pdf_templates.last_modified', 'Last modified')}: {' '}
                      {new Date(template.updatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {/* Preview Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreview(type)}
                    disabled={isPreviewLoading || isResetLoading}
                    title={t('pdf_templates.actions.preview', 'Preview')}
                    className="h-8 w-8 p-0"
                  >
                    {isPreviewLoading ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>

                  {/* Actions Menu */}
                  <RowActions
                    items={[
                      {
                        id: 'edit',
                        label: isDefault
                          ? t('pdf_templates.actions.customize', 'Customize')
                          : t('pdf_templates.actions.edit', 'Edit'),
                        onSelect: () => router.push(`/backend/pdf-designer?type=${type}`),
                      },
                      ...(!isDefault
                        ? [
                            {
                              id: 'reset',
                              label: t('pdf_templates.actions.reset_to_default', 'Reset to Default'),
                              destructive: true,
                              onSelect: () => handleReset(type),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
