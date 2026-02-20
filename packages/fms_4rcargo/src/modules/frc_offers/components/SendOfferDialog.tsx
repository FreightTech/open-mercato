"use client"

import * as React from 'react'
import { Copy, Mail, FileText, FileCode } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { renderTemplate, buildEmailHtml, buildPlainText } from '../../frc_settings/lib/template-renderer'
import {
  mapOfferToTemplateVariables,
  type OfferDetailResponse,
  type ContractorData,
} from '../lib/offer-template-mapper'

type OfferTemplate = {
  id: string
  name: string
  description: string | null
  subjectTemplate: string
  contentTemplate: string
  isDefault: boolean
  isActive: boolean
}

type RfqResponse = {
  id: string
  name: string
  accountId: string | null
  contactId: string | null
}

type Props = {
  offer: OfferDetailResponse
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SendOfferDialog({ offer, open, onOpenChange }: Props) {
  const t = useT()

  const [templates, setTemplates] = React.useState<OfferTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null)
  const [contractor, setContractor] = React.useState<ContractorData | null>(null)
  const [loadingTemplates, setLoadingTemplates] = React.useState(false)
  const [loadingClient, setLoadingClient] = React.useState(false)

  const [renderedSubject, setRenderedSubject] = React.useState('')
  const [renderedHtml, setRenderedHtml] = React.useState('')
  const [renderedPlainText, setRenderedPlainText] = React.useState('')

  // Load templates and client data when dialog opens
  React.useEffect(() => {
    if (!open) return

    const loadData = async () => {
      // Load templates
      setLoadingTemplates(true)
      try {
        const call = await apiCall<{ templates: OfferTemplate[] }>('/api/frc_settings/offer-templates')
        if (call.ok && call.result) {
          const activeTemplates = call.result.templates.filter((t) => t.isActive)
          setTemplates(activeTemplates)

          // Auto-select default template if available
          const defaultTemplate = activeTemplates.find((t) => t.isDefault)
          if (defaultTemplate) {
            setSelectedTemplateId(defaultTemplate.id)
          } else if (activeTemplates.length > 0) {
            setSelectedTemplateId(activeTemplates[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to load templates', err)
        flash(t('frc_offers.send_template.errors.load_templates', 'Failed to load templates'), 'error')
      } finally {
        setLoadingTemplates(false)
      }

      // Load client data if offer has RFQ
      if (offer.rfqId) {
        setLoadingClient(true)
        try {
          // First fetch RFQ to get accountId
          const rfqCall = await apiCall<RfqResponse>(`/api/frc_rfqs/rfqs/${offer.rfqId}`)
          if (rfqCall.ok && rfqCall.result?.accountId) {
            // Fetch contractor
            const contractorCall = await apiCall<ContractorData>(
              `/api/frc_contractors/contractors/${rfqCall.result.accountId}`
            )
            if (contractorCall.ok && contractorCall.result) {
              setContractor(contractorCall.result)
            }
          }
        } catch (err) {
          console.error('Failed to load client data', err)
          // Non-critical, don't show error flash
        } finally {
          setLoadingClient(false)
        }
      }
    }

    void loadData()
  }, [open, offer.rfqId, t])

  // Render template when selection changes
  React.useEffect(() => {
    if (!selectedTemplateId) {
      setRenderedSubject('')
      setRenderedHtml('')
      setRenderedPlainText('')
      return
    }

    const template = templates.find((t) => t.id === selectedTemplateId)
    if (!template) return

    const variables = mapOfferToTemplateVariables(offer, contractor)

    const subject = renderTemplate(template.subjectTemplate, variables)
    const content = renderTemplate(template.contentTemplate, variables)
    const html = buildEmailHtml(content)
    const plainText = buildPlainText(content)

    setRenderedSubject(subject)
    setRenderedHtml(html)
    setRenderedPlainText(plainText)
  }, [selectedTemplateId, templates, offer, contractor])

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSelectedTemplateId(null)
      setContractor(null)
      setRenderedSubject('')
      setRenderedHtml('')
      setRenderedPlainText('')
    }
  }, [open])

  const handleCopySubject = async () => {
    try {
      await navigator.clipboard.writeText(renderedSubject)
      flash(t('frc_offers.send_template.copied', 'Copied to clipboard'), 'success')
    } catch (err) {
      console.error('Failed to copy', err)
      flash(t('frc_offers.send_template.errors.copy_failed', 'Failed to copy'), 'error')
    }
  }

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(renderedHtml)
      flash(t('frc_offers.send_template.copied', 'Copied to clipboard'), 'success')
    } catch (err) {
      console.error('Failed to copy', err)
      flash(t('frc_offers.send_template.errors.copy_failed', 'Failed to copy'), 'error')
    }
  }

  const handleCopyPlainText = async () => {
    try {
      await navigator.clipboard.writeText(renderedPlainText)
      flash(t('frc_offers.send_template.copied', 'Copied to clipboard'), 'success')
    } catch (err) {
      console.error('Failed to copy', err)
      flash(t('frc_offers.send_template.errors.copy_failed', 'Failed to copy'), 'error')
    }
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden flex flex-col"
        style={{ maxWidth: '95vw', width: '900px', maxHeight: '90vh', height: '90vh' }}
      >
        <DialogHeader>
          <DialogTitle>
            {t('frc_offers.send_template.title', 'Send Offer with Template')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Template Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium min-w-[80px]">
              {t('frc_offers.send_template.select_template', 'Template')}:
            </label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                {t('frc_offers.send_template.loading_templates', 'Loading templates...')}
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('frc_offers.send_template.no_templates', 'No templates available. Create one in Settings.')}
              </p>
            ) : (
              <select
                value={selectedTemplateId ?? ''}
                onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                className="w-[300px] h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">
                  {t('frc_offers.send_template.select_template_placeholder', 'Choose a template...')}
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            )}
            {loadingClient && (
              <span className="text-xs text-muted-foreground">
                {t('frc_offers.send_template.loading_client', 'Loading client data...')}
              </span>
            )}
          </div>

          {/* Subject Preview */}
          {selectedTemplate && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {t('frc_offers.send_template.subject', 'Subject')}:
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopySubject}
                  disabled={!renderedSubject}
                  className="h-7 px-2"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {t('frc_offers.send_template.copy_subject', 'Copy Subject')}
                </Button>
              </div>
              <div className="rounded-md border bg-muted/50 px-3 py-2">
                <p className="text-sm font-medium">{renderedSubject || '...'}</p>
              </div>
            </div>
          )}

          {/* Email Body Preview */}
          {selectedTemplate && (
            <div className="flex-1 flex flex-col gap-1 overflow-hidden min-h-0">
              <label className="text-sm font-medium">
                {t('frc_offers.send_template.body', 'Email Body')}:
              </label>
              <div className="flex-1 overflow-auto border rounded-md bg-gray-100 p-2 min-h-0">
                <iframe
                  srcDoc={renderedHtml}
                  className="w-full h-full min-h-[400px] bg-white border-0 rounded"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          )}

          {!selectedTemplate && !loadingTemplates && templates.length > 0 && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              {t('frc_offers.send_template.select_template_prompt', 'Select a template to preview')}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between border-t pt-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyHtml}
              disabled={!renderedHtml}
            >
              <FileCode className="h-4 w-4 mr-2" />
              {t('frc_offers.send_template.copy_html', 'Copy as HTML')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyPlainText}
              disabled={!renderedPlainText}
            >
              <FileText className="h-4 w-4 mr-2" />
              {t('frc_offers.send_template.copy_text', 'Copy as Plain Text')}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="default"
              disabled
              title={t('frc_offers.send_template.send_email_coming_soon', 'Email sending coming soon')}
            >
              <Mail className="h-4 w-4 mr-2" />
              {t('frc_offers.send_template.send_email', 'Send Email')}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.close', 'Close')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
