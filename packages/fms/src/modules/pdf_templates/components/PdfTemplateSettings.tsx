"use client"

import * as React from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Label } from '@open-mercato/ui/primitives/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@open-mercato/ui/primitives/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CodeEditor, type CodeEditorHandle } from './CodeEditor'
import { getDefaultTemplate } from '../lib/default-templates'

type PdfSettings = {
  companyName: string | null
  companyLogoUrl: string | null
  primaryColor: string
  accentColor: string
  headerHtml: string | null
  footerHtml: string | null
  coverPageImageUrl: string | null
  rulesAgreementHtml: string | null
  showPageNumbers: boolean
  defaultPageSize: string
  defaultPageOrientation: string
  brandDefaults?: {
    companyName: string | null
    companyLogoUrl: string | null
    primaryColor: string
    accentColor: string
    footerHtml: string | null
    coverPageImageUrl: string | null
    rulesAgreementHtml: string | null
  } | null
}

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
      {
        routeLabel: 'EXPORT/FCL  Zawidów (59-970) → Gdańsk → Ningbo',
        transportModeClass: 'mode-sea',
        labelLineNumber: 'LP.',
        labelName: 'Nazwa',
        labelCurrencyCol: 'Waluta',
        labelFeeScope: 'Zakres opłaty',
        labelQuantity: 'Ilość',
        labelRate: 'Stawka',
        labelTotal: 'Suma',
        lines: [{ lineNumber: '1', productName: 'Usługa spedycyjna', currencyCode: 'USD', containerSize: "40'HC", quantity: '1', unitPrice: '1330,00', amount: '1330,00' }],
      },
      {
        routeLabel: 'EXPORT/FCL  Zawidów (59-970) → Gdańsk → Penang',
        transportModeClass: 'mode-sea',
        labelLineNumber: 'LP.',
        labelName: 'Nazwa',
        labelCurrencyCol: 'Waluta',
        labelFeeScope: 'Zakres opłaty',
        labelQuantity: 'Ilość',
        labelRate: 'Stawka',
        labelTotal: 'Suma',
        lines: [{ lineNumber: '1', productName: 'Usługa spedycyjna', currencyCode: 'USD', containerSize: "40'HC", quantity: '1', unitPrice: '1360,00', amount: '1360,00' }],
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

export function PdfTemplateSettings() {
  const t = useT()
  const orgScopeVersion = useOrganizationScopeVersion()
  
  // State
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [settings, setSettings] = React.useState<PdfSettings>({
    companyName: null,
    companyLogoUrl: null,
    primaryColor: '#1a365d',
    accentColor: '#f7fafc',
    headerHtml: null,
    footerHtml: null,
    coverPageImageUrl: null,
    rulesAgreementHtml: null,
    showPageNumbers: true,
    defaultPageSize: 'A4',
    defaultPageOrientation: 'portrait',
  })
  
  // Terms & conditions as plain text (converted from HTML on load, to HTML on save)
  const [termsText, setTermsText] = React.useState('')
  
  // Preview modal state
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewHtml, setPreviewHtml] = React.useState('')
  const [previewLoading, setPreviewLoading] = React.useState(false)
  
  // Reset confirmation dialog state
  const [showResetDialog, setShowResetDialog] = React.useState(false)
  
  // File upload state
  const [uploadingImage, setUploadingImage] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  // Editor ref
  const footerEditorRef = React.useRef<CodeEditorHandle>(null)
  
  // Load data
  React.useEffect(() => {
    loadData()
  }, [orgScopeVersion])
  
  const loadData = async () => {
    setLoading(true)
    try {
      const { result: settingsData } = await apiCall<PdfSettings>('/api/pdf_templates/settings', { method: 'GET' })
      
      if (!settingsData) {
        throw new Error('No settings data received')
      }
      
      // Pre-populate footer with default if empty
      if (!settingsData.footerHtml) {
        settingsData.footerHtml = DEFAULT_FOOTER_HTML
      }
      
      // Auto-populate from brand defaults if custom values are empty
      if (settingsData.brandDefaults) {
        if (!settingsData.companyName && settingsData.brandDefaults.companyName) {
          settingsData.companyName = settingsData.brandDefaults.companyName
        }
        if (!settingsData.companyLogoUrl && settingsData.brandDefaults.companyLogoUrl) {
          settingsData.companyLogoUrl = settingsData.brandDefaults.companyLogoUrl
        }
        // Initialize colors from brand if they match the hardcoded defaults
        if (settingsData.primaryColor === '#1a365d' && settingsData.brandDefaults.primaryColor !== '#1a365d') {
          settingsData.primaryColor = settingsData.brandDefaults.primaryColor
        }
        if (settingsData.accentColor === '#f7fafc' && settingsData.brandDefaults.accentColor !== '#f7fafc') {
          settingsData.accentColor = settingsData.brandDefaults.accentColor
        }
      }
      
      setSettings(settingsData)
      
      // Convert HTML to plain text for terms
      setTermsText(htmlToPlainText(settingsData.rulesAgreementHtml))
    } catch (error) {
      console.error('Failed to load PDF templates:', error)
      flash(t('pdf_templates.errors.load_failed', 'Failed to load PDF settings'), 'error')
    } finally {
      setLoading(false)
    }
  }
  
  // Save settings
  const saveSettings = async () => {
    setSaving(true)
    try {
      // Convert plain text terms to HTML before saving
      const settingsToSave = {
        ...settings,
        rulesAgreementHtml: plainTextToHtml(termsText),
      }
      
      const { result: updated } = await apiCall<PdfSettings>('/api/pdf_templates/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsToSave),
      })
      
      if (!updated) {
        throw new Error('No updated settings received')
      }
      
      setSettings(updated)
      setTermsText(htmlToPlainText(updated.rulesAgreementHtml))
      flash(t('pdf_templates.messages.settings_saved', 'PDF settings saved successfully'), 'success')
    } catch (error) {
      console.error('Failed to save settings:', error)
      flash(t('pdf_templates.errors.save_settings', 'Failed to save PDF settings'), 'error')
    } finally {
      setSaving(false)
    }
  }
  
  // Reset to brand defaults
  const openResetDialog = () => {
    if (!settings.brandDefaults) {
      flash(t('pdf_templates.messages.no_brand_defaults', 'No brand defaults available'), 'warning')
      return
    }
    setShowResetDialog(true)
  }
  
  const confirmResetToBrandDefaults = () => {
    // Apply brand defaults
    setSettings(prev => ({
      ...prev,
      companyName: settings.brandDefaults?.companyName || prev.companyName,
      companyLogoUrl: settings.brandDefaults?.companyLogoUrl || prev.companyLogoUrl,
      primaryColor: settings.brandDefaults?.primaryColor || prev.primaryColor,
      accentColor: settings.brandDefaults?.accentColor || prev.accentColor,
    }))
    
    setShowResetDialog(false)
    flash(t('pdf_templates.messages.brand_defaults_applied', 
      'Brand defaults applied. Click "Save Settings" to persist changes.'), 'success')
  }
  
  // Preview full PDF
  const openPreview = async () => {
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const defaultTemplate = getDefaultTemplate('offer')
      
      // Merge custom settings with brand defaults
      const effectiveSettings = {
        companyName: settings.companyName || settings.brandDefaults?.companyName || 'Open Mercato',
        companyLogoUrl: settings.companyLogoUrl || settings.brandDefaults?.companyLogoUrl || null,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
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
      formData.append('fieldKey', 'coverPageImage')
      
      const response = await fetch('/api/attachments', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error('Upload failed')
      }
      
      const result = await response.json()
      const imageUrl = `/api/attachments/image/${result.id}`
      
      setSettings({ ...settings, coverPageImageUrl: imageUrl })
      flash(t('pdf_templates.messages.image_uploaded', 'Cover image uploaded successfully'), 'success')
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
    setSettings({ ...settings, coverPageImageUrl: null })
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('pdf_templates.title', 'PDF Templates')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('pdf_templates.description', 'Configure PDF layouts and templates for offers')}
          </p>
        </div>
        <Button variant="outline" onClick={openPreview}>
          {t('pdf_templates.actions.preview_pdf', 'Preview PDF')}
        </Button>
      </div>
      
      {settings.brandDefaults && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              {settings.brandDefaults.companyLogoUrl && (
                <img 
                  src={settings.brandDefaults.companyLogoUrl} 
                  alt="Brand logo"
                  className="max-h-12 object-contain"
                />
              )}
              <div className="flex-1">
                <p className="text-sm text-blue-900 font-semibold mb-2">
                  🏢 Brand detected: {settings.brandDefaults.companyName}
                </p>
                <p className="text-xs text-blue-800">
                  Brand defaults have been applied:
                </p>
                <ul className="text-xs text-blue-700 mt-1 space-y-1">
                  <li>• Company name: {settings.brandDefaults.companyName}</li>
                  <li className="flex items-center gap-1">
                    • Primary color: 
                    <span className="inline-block w-3 h-3 rounded border" style={{backgroundColor: settings.brandDefaults.primaryColor}}></span> 
                    {settings.brandDefaults.primaryColor}
                  </li>
                  <li className="flex items-center gap-1">
                    • Accent color: 
                    <span className="inline-block w-3 h-3 rounded border" style={{backgroundColor: settings.brandDefaults.accentColor}}></span> 
                    {settings.brandDefaults.accentColor}
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  You can override any value by entering a custom value in the fields below.
                </p>
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openResetDialog}
                    className="w-full"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('pdf_templates.actions.reset_to_brand_defaults', 'Reset to Brand Defaults')}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>{t('pdf_templates.settings.branding', 'Branding')}</CardTitle>
          <CardDescription>
            {t('pdf_templates.settings.branding_desc', 'Configure company branding and colors')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">
                {t('pdf_templates.settings.company_name', 'Company Name')}
                {!settings.companyName && settings.brandDefaults?.companyName && (
                  <span className="ml-2 text-xs text-muted-foreground">(using brand default)</span>
                )}
              </Label>
              <Input
                id="companyName"
                value={settings.companyName || ''}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                placeholder={settings.brandDefaults?.companyName || 'Enter company name...'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyLogoUrl">
                {t('pdf_templates.settings.logo_url', 'Logo URL')}
                {!settings.companyLogoUrl && settings.brandDefaults?.companyLogoUrl && (
                  <span className="ml-2 text-xs text-muted-foreground">(using brand logo)</span>
                )}
              </Label>
              <Input
                id="companyLogoUrl"
                value={settings.companyLogoUrl || ''}
                onChange={(e) => setSettings({ ...settings, companyLogoUrl: e.target.value })}
                placeholder={settings.brandDefaults?.companyLogoUrl ? 'Using brand logo (data URI)' : 'https://example.com/logo.png'}
              />
              {(settings.companyLogoUrl || settings.brandDefaults?.companyLogoUrl) && (
                <div className="mt-2 p-2 border rounded bg-white">
                  <img 
                    src={settings.companyLogoUrl || settings.brandDefaults?.companyLogoUrl || ''} 
                    alt="Logo preview"
                    className="max-h-16 object-contain"
                  />
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">
                {t('pdf_templates.settings.primary_color', 'Primary Color')}
              </Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="primaryColor"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  placeholder="#1a365d"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accentColor">
                {t('pdf_templates.settings.accent_color', 'Accent Color')}
              </Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="accentColor"
                  value={settings.accentColor}
                  onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  value={settings.accentColor}
                  onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                  placeholder="#f7fafc"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>{t('pdf_templates.settings.cover_page', 'Cover Page')}</CardTitle>
          <CardDescription>
            {t('pdf_templates.settings.cover_page_desc', 'Upload an image for the first page of the PDF')}
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
                onChange={(e) => setSettings({ ...settings, coverPageImageUrl: e.target.value })}
                placeholder={t('pdf_templates.settings.cover_image_placeholder', 'Image URL or upload below')}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={removeImage}
                >
                  {t('pdf_templates.actions.remove', 'Remove')}
                </Button>
              )}
            </div>
            {settings.coverPageImageUrl && (
              <div className="mt-4 border rounded p-2">
                <img
                  src={settings.coverPageImageUrl}
                  alt="Cover page preview"
                  className="max-w-full h-auto max-h-64 object-contain"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
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
            value={settings.footerHtml || ''}
            onChange={(e) => setSettings({ ...settings, footerHtml: e.target.value })}
            rows={10}
            placeholder={t('pdf_templates.settings.footer_placeholder', 'Enter custom footer HTML...')}
          />
          
          {/* Footer preview */}
          <div className="space-y-2">
            <Label>{t('pdf_templates.settings.footer_preview', 'Preview')}</Label>
            <div className="border rounded p-4 bg-white min-h-[100px]">
              <div 
                dangerouslySetInnerHTML={{ 
                  __html: (settings.footerHtml || '').replace(
                    /\{\{companyName\}\}/g, 
                    settings.companyName || settings.brandDefaults?.companyName || 'Company Name'
                  )
                }}
              />
              {settings.footerHtml?.includes('{{') && (
                <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                  💡 Variables like {'{{'} companyName {'}}'}  are replaced with actual values in the PDF
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>{t('pdf_templates.settings.terms', 'Terms & Conditions')}</CardTitle>
          <CardDescription>
            {t('pdf_templates.settings.terms_desc', 'Plain text content for the terms and conditions page')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
            rows={15}
            placeholder={t('pdf_templates.settings.terms_placeholder', 'Enter terms and conditions as plain text. Separate paragraphs with blank lines.')}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>
      
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={openPreview}>
          {t('pdf_templates.actions.preview_pdf', 'Preview PDF')}
        </Button>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
          {t('pdf_templates.actions.save', 'Save Settings')}
        </Button>
      </div>
      
      {/* Preview Dialog - Fullscreen */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[98vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{t('pdf_templates.preview.title', 'PDF Preview')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-gray-100 p-8">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full">
                <Spinner />
              </div>
            ) : (
              <div className="max-w-[210mm] mx-auto shadow-2xl">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full min-h-[297mm] border-0 bg-white"
                  style={{ backgroundColor: 'white' }}
                  title="PDF Preview"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Reset to Brand Defaults Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pdf_templates.confirm.reset_to_brand_title', 'Reset to Brand Defaults?')}</DialogTitle>
            <DialogDescription>
              {t('pdf_templates.confirm.reset_to_brand_description', 
                'This will replace your current company name, logo, and color settings with the defaults from your brand configuration. You can review the changes before saving.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
            >
              {t('pdf_templates.actions.cancel', 'Cancel')}
            </Button>
            <Button
              variant="default"
              onClick={confirmResetToBrandDefaults}
            >
              {t('pdf_templates.actions.reset_confirm', 'Reset to Defaults')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
