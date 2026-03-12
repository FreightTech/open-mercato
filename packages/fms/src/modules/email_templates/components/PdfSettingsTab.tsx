"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CodeEditor, type CodeEditorHandle } from '@open-mercato/fms/modules/pdf_templates/components/CodeEditor'
import { getDefaultTemplate } from '@open-mercato/fms/modules/pdf_templates/lib/default-templates'
import type { PdfSpecificSettings, SharedBrandSettings } from '../lib/shared-brand-settings'

// Sample data for PDF preview (inlined to avoid SSR/Puppeteer bundle issues)
const SAMPLE_DATA = {
  offer: {
    labelOffer: 'OFERTA',
    labelClient: 'ZLECENIODAWCA',
    labelTaxId: 'NIP',
    labelIncoterms: 'Warunki incoterms',
    labelValidity: 'Ważność oferty',
    labelPaymentTerms: 'Termin płatności',
    labelCargo: 'Towar',
    labelCargoType: 'Rodzaj ładunku',
    labelCurrency: 'Waluta',
    labelLineNumber: 'LP.',
    labelName: 'Nazwa',
    labelCurrencyCol: 'Waluta',
    labelFeeScope: 'Zakres opłaty',
    labelQuantity: 'Ilość',
    labelRate: 'Stawka',
    labelTotal: 'Suma',
    labelCustomerNotes: 'Uwagi dla klienta',
    labelExchangeRates: 'Kursy wymiany',
    labelTermsTitle: 'WARUNKI OFERTY',
    offerNumber: 'MAC071220251',
    version: '1',
    status: 'sent',
    createdDate: 'January 27, 2026',
    validUntil: '2026-01-31',
    isExpired: false,
    clientName: 'MACIEJ TWARDOWSKI "TWARGUM" SP. J.',
    clientAddress: 'TWARGUM SP. J. Lubelska 7, 59-970 Zawidów, Polska',
    clientTaxId: '6152062642',
    incoterms: 'CFR',
    cargoDescription: 'Wyroby gumowe',
    cargoType: 'Neutralny',
    currencyCode: 'USD',
    paymentTerms: '21 dni',
    customerNotes: 'Brak',
    exchangeRates: 'USD: 3.5848',
    routes: [
      {
        routeLabel: 'EXPORT/FCL  Zawidów (59-970) → Gdańsk → Laem Chabang',
        transportModeClass: 'mode-sea',
        labelLineNumber: 'LP.',
        labelName: 'Nazwa',
        labelCurrencyCol: 'Waluta',
        labelFeeScope: 'Zakres opłaty',
        labelQuantity: 'Ilość',
        labelRate: 'Stawka',
        labelTotal: 'Suma',
        lines: [{ lineNumber: '1', productName: 'Usługa spedycyjna', currencyCode: 'USD', containerSize: "40'HC", quantity: '1', unitPrice: '1350,00', amount: '1350,00' }],
      },
    ],
  },
}

// Default footer template pre-populated when empty
const DEFAULT_FOOTER_HTML = `<div style="text-align: center; font-size: 11px; color: #666; line-height: 1.6;">
  <p style="margin: 8px 0;"><strong>{{companyName}}</strong></p>
  <p style="margin: 4px 0;">ul. Example Street 10, 00-001 Warsaw, Poland</p>
  <p style="margin: 4px 0;">Tel: +48 123 456 789 | Email: office@company.com | www.company.com</p>
  <p style="margin: 4px 0;">NIP: 1234567890 | REGON: 123456789 | KRS: 0000123456</p>
</div>`

// Helper: Convert HTML to plain text (strips <p>, <br> tags, converts to newlines)
function htmlToPlainText(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

// Helper: Convert plain text to HTML (<p> paragraphs, <br> for single newlines)
function plainTextToHtml(text: string): string {
  if (!text.trim()) return ''
  
  // Split by double newlines to get paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
  
  // Convert each paragraph: replace single newlines with <br>, wrap in <p>
  return paragraphs
    .map(para => {
      const withBreaks = para.trim().replace(/\n/g, '<br>')
      return `<p>${withBreaks}</p>`
    })
    .join('\n')
}

type PdfSettingsTabProps = {
  settings: PdfSpecificSettings
  brandSettings: SharedBrandSettings
  saving: boolean
  onChange: (settings: PdfSpecificSettings) => void
  onSave: () => Promise<void>
}

export function PdfSettingsTab({
  settings,
  brandSettings,
  saving,
  onChange,
  onSave,
}: PdfSettingsTabProps) {
  const t = useT()

  // Local state for terms text (converted from HTML)
  const [termsText, setTermsText] = React.useState(() =>
    htmlToPlainText(settings.rulesAgreementHtml)
  )

  // Sync termsText when settings change externally
  React.useEffect(() => {
    setTermsText(htmlToPlainText(settings.rulesAgreementHtml))
  }, [settings.rulesAgreementHtml])

  // Preview modal state
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewHtml, setPreviewHtml] = React.useState('')
  const [previewLoading, setPreviewLoading] = React.useState(false)

  // File upload state
  const [uploadingImage, setUploadingImage] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Debounced image URL for preview (avoids broken requests while typing)
  const [debouncedImageUrl, setDebouncedImageUrl] = React.useState<string | null>(
    settings.coverPageImageUrl
  )
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedImageUrl(settings.coverPageImageUrl)
    }, 500)
    return () => clearTimeout(timer)
  }, [settings.coverPageImageUrl])

  // Editor ref
  const footerEditorRef = React.useRef<CodeEditorHandle>(null)

  const handleChange = React.useCallback(
    <K extends keyof PdfSpecificSettings>(field: K, value: PdfSpecificSettings[K]) => {
      onChange({ ...settings, [field]: value })
    },
    [settings, onChange]
  )

  // Update terms and sync to settings
  const handleTermsChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value
      setTermsText(newText)
      onChange({ ...settings, rulesAgreementHtml: plainTextToHtml(newText) })
    },
    [settings, onChange]
  )

  // Custom save that converts terms text to HTML
  const handleSave = React.useCallback(async () => {
    // Ensure rulesAgreementHtml is up to date before saving
    onChange({ ...settings, rulesAgreementHtml: plainTextToHtml(termsText) })
    await onSave()
  }, [settings, termsText, onChange, onSave])

  // Preview full PDF
  const openPreview = async () => {
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const defaultTemplate = getDefaultTemplate('offer')

      // Merge custom settings with brand defaults
      const effectiveSettings = {
        companyName: brandSettings.companyName || 'Open Mercato',
        companyLogoUrl: brandSettings.companyLogoUrl || null,
        primaryColor: brandSettings.primaryColor,
        accentColor: brandSettings.accentColor,
      }

      // Use inlined sample data for realistic preview
      const sampleVariables = SAMPLE_DATA['offer']

      // Merge sample data with custom footer/terms/cover
      const mergedVariables = {
        ...sampleVariables,
        footerHtml: settings.footerHtml?.trim() || null,
        rulesAgreementHtml: plainTextToHtml(termsText) || null,
        coverPageImageUrl: settings.coverPageImageUrl?.trim() || null,
      }

      const response = await fetch('/api/pdf_templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType: 'offer',
          htmlTemplate: defaultTemplate.htmlTemplate,
          cssStyles: defaultTemplate.cssStyles,
          settings: effectiveSettings,
          variables: mergedVariables,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Preview failed: ${response.status}`)
      }

      const html = await response.text()
      setPreviewHtml(html)
    } catch (error) {
      console.error('Failed to generate preview:', error)
      flash(t('pdf_templates.errors.preview_failed', 'Failed to generate preview'), 'error')
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Image upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('entityId', 'pdf_settings')
      formData.append('recordId', 'default')
      formData.append('fieldKey', 'coverPageImage')

      const response = await fetch('/api/attachments', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const result = await response.json()
      const imageUrl = `/api/attachments/file/${result.item.id}`

      handleChange('coverPageImageUrl', imageUrl)
      flash(
        t('pdf_templates.messages.image_uploaded', 'Cover image uploaded successfully'),
        'success'
      )
    } catch (error) {
      console.error('Failed to upload image:', error)
      flash(t('pdf_templates.errors.upload_failed', 'Failed to upload image'), 'error')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeImage = () => {
    handleChange('coverPageImageUrl', null)
  }

  // Ensure footer has default if empty
  const footerValue = settings.footerHtml || DEFAULT_FOOTER_HTML

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {t('templates.pdf.title', 'PDF Templates')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('templates.pdf.description', 'Configure PDF layouts and templates for offers')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openPreview}>
            {t('pdf_templates.actions.preview_pdf', 'Preview PDF')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Spinner className="mr-2 h-4 w-4" />}
            {t('templates.pdf.save', 'Save PDF Settings')}
          </Button>
        </div>
      </div>

      {/* Cover Page */}
      <Card>
        <CardHeader>
          <CardTitle>{t('pdf_templates.settings.cover_page', 'Cover Page')}</CardTitle>
          <CardDescription>
            {t(
              'pdf_templates.settings.cover_page_desc',
              'Upload an image for the first page of the PDF'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coverPageImageUrl">
              {t('pdf_templates.settings.cover_image', 'Cover Image')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="coverPageImageUrl"
                value={settings.coverPageImageUrl || ''}
                onChange={(e) => handleChange('coverPageImageUrl', e.target.value || null)}
                placeholder={t(
                  'pdf_templates.settings.cover_image_placeholder',
                  'Image URL or upload below'
                )}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  t('pdf_templates.actions.upload', 'Upload')
                )}
              </Button>
              {settings.coverPageImageUrl && (
                <Button type="button" variant="outline" onClick={removeImage}>
                  {t('pdf_templates.actions.remove', 'Remove')}
                </Button>
              )}
            </div>
            {debouncedImageUrl && (
              <div className="mt-4 border rounded p-2">
                <img
                  src={debouncedImageUrl}
                  alt="Cover page preview"
                  className="max-w-full h-auto max-h-64 object-contain"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <Card>
        <CardHeader>
          <CardTitle>{t('pdf_templates.settings.footer', 'Footer')}</CardTitle>
          <CardDescription>
            {t('pdf_templates.settings.footer_desc', 'Custom HTML for the footer section')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CodeEditor
            ref={footerEditorRef}
            value={footerValue}
            onChange={(e) => handleChange('footerHtml', e.target.value || null)}
            rows={10}
            placeholder={t(
              'pdf_templates.settings.footer_placeholder',
              'Enter custom footer HTML...'
            )}
          />

          {/* Footer preview */}
          <div className="space-y-2">
            <Label>{t('pdf_templates.settings.footer_preview', 'Preview')}</Label>
            <div className="border rounded p-4 bg-card min-h-[100px]">
              <div
                dangerouslySetInnerHTML={{
                  __html: footerValue.replace(
                    /\{\{companyName\}\}/g,
                    brandSettings.companyName || 'Company Name'
                  ),
                }}
              />
              {footerValue.includes('{{') && (
                <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                  Variables like {'{{'}companyName{'}}'} are replaced with actual values in the PDF
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('pdf_templates.settings.terms', 'Terms & Conditions')}</CardTitle>
          <CardDescription>
            {t(
              'pdf_templates.settings.terms_desc',
              'Plain text content for the terms and conditions page'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={termsText}
            onChange={handleTermsChange}
            rows={15}
            placeholder={t(
              'pdf_templates.settings.terms_placeholder',
              'Enter terms and conditions as plain text. Separate paragraphs with blank lines.'
            )}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Page Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('pdf_templates.settings.page_settings', 'Page Settings')}</CardTitle>
          <CardDescription>
            {t('pdf_templates.settings.page_settings_desc', 'Configure default page size and orientation')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="defaultPageSize">
                {t('pdf_templates.settings.page_size', 'Page Size')}
              </Label>
              <select
                id="defaultPageSize"
                value={settings.defaultPageSize}
                onChange={(e) =>
                  handleChange('defaultPageSize', e.target.value as PdfSpecificSettings['defaultPageSize'])
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultPageOrientation">
                {t('pdf_templates.settings.orientation', 'Orientation')}
              </Label>
              <select
                id="defaultPageOrientation"
                value={settings.defaultPageOrientation}
                onChange={(e) =>
                  handleChange(
                    'defaultPageOrientation',
                    e.target.value as PdfSpecificSettings['defaultPageOrientation']
                  )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="portrait">{t('pdf_templates.settings.portrait', 'Portrait')}</option>
                <option value="landscape">{t('pdf_templates.settings.landscape', 'Landscape')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="showPageNumbers">
                {t('pdf_templates.settings.page_numbers', 'Page Numbers')}
              </Label>
              <div className="flex items-center h-10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="showPageNumbers"
                    checked={settings.showPageNumbers}
                    onChange={(e) => handleChange('showPageNumbers', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">
                    {t('pdf_templates.settings.show_page_numbers', 'Show page numbers')}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog - Fullscreen */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="!max-w-[60vw] !w-[60vw] !h-[90vh] flex flex-col p-0 !overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>{t('pdf_templates.preview.title', 'PDF Preview')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900 p-4 min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full">
                <Spinner />
              </div>
            ) : (
              <div className="w-full h-full">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full border-0 bg-white shadow-2xl"
                  style={{ backgroundColor: 'white' }}
                  title="PDF Preview"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
