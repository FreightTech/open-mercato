"use client"

import * as React from 'react'
import { Copy, Mail, FileText, FileCode, Send, User } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import {
  renderTemplate,
  buildEmailHtml,
} from '@open-mercato/fms/modules/email_templates/lib/template-renderer.client'
import { DEFAULT_TEMPLATE_CONTENT } from '@open-mercato/fms/modules/email_templates/lib/template-fields'
import {
  mapOfferToTemplateVariables,
  type OfferDetailResponse,
  type ContractorData,
} from '../lib/offer-template-mapper'

type EmailSettings = {
  companyName: string | null
  companyLogoUrl: string | null
  primaryColor: string
  accentColor: string
  contactEmail: string | null
  contactPhone: string | null
  websiteUrl: string | null
  footerText: string | null
  footerDisclaimer: string | null
  fromName: string | null
  fromEmail: string | null
  replyToEmail: string | null
  brandDefaults?: {
    companyName: string | null
    companyLogoUrl: string | null
    primaryColor: string
    accentColor: string
  } | null
}

type EmailTemplate = {
  templateType: string
  subjectTemplate: string
  htmlTemplate: string
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
  onSent?: () => void
}

export function SendOfferDialog({ offer, open, onOpenChange, onSent }: Props) {
  const t = useT()

  // Template and settings state
  const [template, setTemplate] = React.useState<EmailTemplate | null>(null)
  const [settings, setSettings] = React.useState<EmailSettings | null>(null)
  const [contractor, setContractor] = React.useState<ContractorData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  // Email form state
  const [recipientEmail, setRecipientEmail] = React.useState('')
  const [recipientName, setRecipientName] = React.useState('')
  const [customMessage, setCustomMessage] = React.useState('')
  const [selectedContactId, setSelectedContactId] = React.useState<string | null>(null)

  // Rendered preview state
  const [renderedSubject, setRenderedSubject] = React.useState('')
  const [renderedHtml, setRenderedHtml] = React.useState('')

  // Load template, settings, and client data when dialog opens
  React.useEffect(() => {
    if (!open) return

    const loadData = async () => {
      setLoading(true)
      try {
        // Load template and settings in parallel
        const [templateCall, settingsCall] = await Promise.all([
          apiCall<EmailTemplate>('/api/email_templates/templates?type=offer'),
          apiCall<EmailSettings>('/api/email_templates/settings'),
        ])

        if (templateCall.ok && templateCall.result) {
          setTemplate(templateCall.result)
        } else {
          // Use default template if none configured
          setTemplate({
            templateType: 'offer',
            subjectTemplate: DEFAULT_TEMPLATE_CONTENT.offer.subject,
            htmlTemplate: DEFAULT_TEMPLATE_CONTENT.offer.content,
            isActive: true,
          })
        }

        if (settingsCall.ok && settingsCall.result) {
          setSettings(settingsCall.result)
        }

        // Load client data if offer has RFQ
        if (offer.rfqId) {
          try {
            const rfqCall = await apiCall<RfqResponse>(`/api/frc_rfqs/rfqs/${offer.rfqId}`)
            if (rfqCall.ok && rfqCall.result?.accountId) {
              const contractorCall = await apiCall<ContractorData>(
                `/api/frc_contractors/contractors/${rfqCall.result.accountId}`
              )
              if (contractorCall.ok && contractorCall.result) {
                setContractor(contractorCall.result)
                
                // Auto-select primary contact
                const primaryContact = contractorCall.result.contacts?.find(c => c.isPrimary) 
                  ?? contractorCall.result.contacts?.[0]
                if (primaryContact) {
                  setSelectedContactId(primaryContact.id)
                  setRecipientEmail(primaryContact.email || '')
                  setRecipientName(
                    [primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' ') 
                    || primaryContact.email || ''
                  )
                }
              }
            }
          } catch (err) {
            console.error('Failed to load client data', err)
          }
        }
      } catch (err) {
        console.error('Failed to load email data', err)
        flash(t('frc_offers.send_template.errors.load_templates', 'Failed to load email configuration'), 'error')
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [open, offer.rfqId, t])

  // Render template when dependencies change
  React.useEffect(() => {
    if (!template || !settings) {
      setRenderedSubject('')
      setRenderedHtml('')
      return
    }

    const variables = mapOfferToTemplateVariables(offer, contractor, { message: customMessage })
    
    // Merge with settings
    const mergedVariables = {
      ...variables,
      contactName: recipientName || variables.contactName,
      companyName: settings.companyName || settings.brandDefaults?.companyName || 'Open Mercato',
      primaryColor: settings.primaryColor || settings.brandDefaults?.primaryColor || '#1a365d',
      accentColor: settings.accentColor || settings.brandDefaults?.accentColor || '#f7fafc',
    }

    // Render subject
    const subjectTemplate = template.subjectTemplate || DEFAULT_TEMPLATE_CONTENT.offer.subject
    const subject = renderTemplate(subjectTemplate, mergedVariables)
    setRenderedSubject(subject)

    // Render content
    const htmlTemplate = template.htmlTemplate || DEFAULT_TEMPLATE_CONTENT.offer.content
    const html = buildEmailHtml(htmlTemplate, mergedVariables, {
      companyName: settings.companyName || settings.brandDefaults?.companyName,
      companyLogoUrl: settings.companyLogoUrl || settings.brandDefaults?.companyLogoUrl,
      primaryColor: settings.primaryColor || settings.brandDefaults?.primaryColor,
      accentColor: settings.accentColor || settings.brandDefaults?.accentColor,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      websiteUrl: settings.websiteUrl,
      footerText: settings.footerText,
      footerDisclaimer: settings.footerDisclaimer,
    })
    setRenderedHtml(html)
  }, [template, settings, offer, contractor, recipientName, customMessage])

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setTemplate(null)
      setSettings(null)
      setContractor(null)
      setRecipientEmail('')
      setRecipientName('')
      setCustomMessage('')
      setSelectedContactId(null)
      setRenderedSubject('')
      setRenderedHtml('')
    }
  }, [open])

  // Handle contact selection
  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId)
    const contact = contractor?.contacts?.find(c => c.id === contactId)
    if (contact) {
      setRecipientEmail(contact.email || '')
      setRecipientName(
        [contact.firstName, contact.lastName].filter(Boolean).join(' ') 
        || contact.email || ''
      )
    }
  }

  // Copy handlers
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

  // Send email handler
  const handleSendEmail = async () => {
    if (!recipientEmail) {
      flash(t('frc_offers.send_template.errors.email_required', 'Recipient email is required'), 'error')
      return
    }

    setSending(true)
    try {
      const result = await apiCall<{ ok: boolean; sentTo?: { email: string; name: string } }>(
        `/api/frc_offers/offers/${offer.id}/send`,
        {
          method: 'POST',
          body: JSON.stringify({
            contactId: selectedContactId,
            customEmail: recipientEmail,
            message: customMessage,
          }),
        }
      )

      if (result.ok && result.result?.ok) {
        flash(
          t('frc_offers.send_template.sent_success', 'Email sent successfully to {{email}}', { email: recipientEmail }),
          'success'
        )
        onOpenChange(false)
        onSent?.()
      } else {
        flash(
          (result as any).error || t('frc_offers.send_template.send_failed', 'Failed to send email'),
          'error'
        )
      }
    } catch (err) {
      console.error('Failed to send email', err)
      flash(t('frc_offers.send_template.send_failed', 'Failed to send email'), 'error')
    } finally {
      setSending(false)
    }
  }

  const hasContacts = contractor?.contacts && contractor.contacts.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden flex flex-col"
        style={{ maxWidth: '95vw', width: '900px', maxHeight: '90vh', height: '90vh' }}
      >
        <DialogHeader>
          <DialogTitle>
            {t('frc_offers.send_template.title', 'Send Offer')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner className="h-8 w-8" />
              <span className="ml-2 text-muted-foreground">
                {t('frc_offers.send_template.loading', 'Loading...')}
              </span>
            </div>
          ) : (
            <>
              {/* Recipient Selection */}
              <div className="space-y-3 border-b pb-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {t('frc_offers.send_template.recipient', 'Recipient')}
                  </span>
                </div>

                {hasContacts && (
                  <div className="flex items-center gap-4">
                    <Label className="text-sm min-w-[80px]">
                      {t('frc_offers.send_template.contact', 'Contact')}:
                    </Label>
                    <select
                      value={selectedContactId ?? ''}
                      onChange={(e) => handleContactChange(e.target.value)}
                      className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">
                        {t('frc_offers.send_template.select_contact', 'Select a contact...')}
                      </option>
                      {contractor?.contacts?.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email}
                          {contact.isPrimary ? ' (Primary)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <Label className="text-sm min-w-[80px]">
                    {t('frc_offers.send_template.email', 'Email')}:
                  </Label>
                  <Input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder={t('frc_offers.send_template.email_placeholder', 'recipient@example.com')}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <Label className="text-sm min-w-[80px]">
                    {t('frc_offers.send_template.name', 'Name')}:
                  </Label>
                  <Input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder={t('frc_offers.send_template.name_placeholder', 'John Smith')}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-start gap-4">
                  <Label className="text-sm min-w-[80px] pt-2">
                    {t('frc_offers.send_template.message', 'Message')}:
                  </Label>
                  <Textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder={t('frc_offers.send_template.message_placeholder', 'Add a personal message (optional)...')}
                    className="flex-1 min-h-[60px]"
                    rows={2}
                  />
                </div>
              </div>

              {/* Subject Preview */}
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
                    {t('frc_offers.send_template.copy_subject', 'Copy')}
                  </Button>
                </div>
                <div className="rounded-md border bg-muted/50 px-3 py-2">
                  <p className="text-sm font-medium">{renderedSubject || '...'}</p>
                </div>
              </div>

              {/* Email Body Preview */}
              <div className="flex-1 flex flex-col gap-1 overflow-hidden min-h-0">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    {t('frc_offers.send_template.body', 'Email Preview')}:
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyHtml}
                    disabled={!renderedHtml}
                    className="h-7 px-2"
                  >
                    <FileCode className="h-3 w-3 mr-1" />
                    {t('frc_offers.send_template.copy_html', 'Copy HTML')}
                  </Button>
                </div>
                <div className="flex-1 overflow-auto border rounded-md bg-gray-100 p-2 min-h-0">
                  <iframe
                    srcDoc={renderedHtml}
                    className="w-full h-full min-h-[300px] bg-white border-0 rounded"
                    title="Email Preview"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {settings?.fromEmail && (
              <span>
                {t('frc_offers.send_template.from', 'From')}: {settings.fromName || settings.companyName || 'Company'} &lt;{settings.fromEmail}&gt;
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleSendEmail}
              disabled={!recipientEmail || !renderedHtml || sending || loading}
            >
              {sending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  {t('common.sending', 'Sending...')}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {t('frc_offers.send_template.send_email', 'Send Email')}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
