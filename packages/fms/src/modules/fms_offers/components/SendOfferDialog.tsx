'use client'

import * as React from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail, User, Paperclip, Send, Check, XCircle, AlertCircle, Clock, Edit2, Eye } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Badge } from '@open-mercato/ui/primitives/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@open-mercato/ui/primitives/tabs'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { FmsOfferStatus } from '../data/types'

type Contact = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  isPrimary: boolean
  fullName: string
}

type SendOfferDialogProps = {
  offerId: string
  offerNumber: string
  clientName: string
  currentStatus: FmsOfferStatus
  sentAt?: string | null
  sentToEmail?: string | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function SendOfferDialog({
  offerId,
  offerNumber,
  clientName,
  currentStatus,
  sentAt,
  sentToEmail,
  open,
  onClose,
  onSuccess,
}: SendOfferDialogProps) {
  const [emailMode, setEmailMode] = useState<'contact' | 'custom'>('contact')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [customEmail, setCustomEmail] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [activeTab, setActiveTab] = useState<'send' | 'status'>('send')

  // Email preview state
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch contacts for this offer's client
  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['offer-contacts', offerId],
    queryFn: async () => {
      const response = await apiCall<{
        contacts: Contact[]
        clientId: string | null
        clientName: string | null
      }>(`/api/fms_offers/offers/${offerId}/contacts`)
      if (!response.ok) throw new Error('Failed to load contacts')
      return response.result
    },
    enabled: open,
  })

  const contacts = contactsData?.contacts || []

  // Auto-select primary contact or switch to custom if no contacts
  useEffect(() => {
    if (!open) return

    if (contacts.length > 0 && !selectedContactId) {
      const primary = contacts.find((c) => c.isPrimary)
      setSelectedContactId(primary?.id || contacts[0].id)
      setEmailMode('contact')
    } else if (contacts.length === 0 && !isLoadingContacts) {
      setEmailMode('custom')
    }
  }, [contacts, selectedContactId, isLoadingContacts, open])

  // Pre-fill custom email with last sent email if available
  useEffect(() => {
    if (open && sentToEmail && !customEmail) {
      setCustomEmail(sentToEmail)
    }
  }, [open, sentToEmail, customEmail])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedContactId(null)
      setCustomEmail('')
      setMessage('')
      setActiveTab('send')
      setPreviewHtml(null)
      setPreviewSubject(null)
    }
  }, [open])

  const selectedContact = contacts.find((c) => c.id === selectedContactId)

  // Determine the contact name for preview
  const contactName = emailMode === 'contact' && selectedContact
    ? selectedContact.fullName
    : 'Valued Client'

  // Determine the email that will be used
  const targetEmail = emailMode === 'contact'
    ? selectedContact?.email
    : customEmail

  const canSend = emailMode === 'contact'
    ? !!selectedContactId
    : isValidEmail(customEmail)

  // Fetch email preview (debounced on message change)
  const fetchPreview = useCallback(async (msg: string, name: string) => {
    setPreviewLoading(true)
    try {
      const params = new URLSearchParams()
      if (msg) params.set('message', msg)
      params.set('contactName', name)
      const response = await apiCall<{ subject: string; html: string }>(
        `/api/fms_offers/offers/${offerId}/email-preview?${params}`
      )
      if (response.ok && response.result) {
        setPreviewHtml(response.result.html)
        setPreviewSubject(response.result.subject)
      }
    } catch {
      // Silently fail — preview is non-critical
    } finally {
      setPreviewLoading(false)
    }
  }, [offerId])

  // Trigger preview fetch on open and when dependencies change
  useEffect(() => {
    if (!open || activeTab !== 'send') return

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      fetchPreview(message, contactName)
    }, message ? 400 : 0) // Immediate on open, debounced on message typing

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    }
  }, [open, activeTab, message, contactName, fetchPreview])

  const handleSend = useCallback(async () => {
    if (!canSend) return

    setIsSending(true)
    try {
      const payload: Record<string, unknown> = {
        message: message.trim() || undefined,
      }

      if (emailMode === 'contact' && selectedContactId) {
        payload.contactId = selectedContactId
      } else if (emailMode === 'custom' && customEmail) {
        payload.customEmail = customEmail
      }

      const response = await apiCall<{ ok: boolean; message: string; sentTo: { email: string } }>(
        `/api/fms_offers/offers/${offerId}/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (response.ok) {
        flash(`Offer sent to ${response.result?.sentTo?.email || targetEmail}`, 'success')
        onSuccess()
      } else {
        flash(response.result?.message || 'Failed to send offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsSending(false)
    }
  }, [offerId, emailMode, selectedContactId, customEmail, message, canSend, targetEmail, onSuccess])

  const handleStatusChange = useCallback(async (newStatus: FmsOfferStatus) => {
    setIsUpdatingStatus(true)
    try {
      const response = await apiCall(`/api/fms_offers/offers/${offerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        flash(`Offer marked as ${newStatus}`, 'success')
        onSuccess()
      } else {
        flash('Failed to update status', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsUpdatingStatus(false)
    }
  }, [offerId, onSuccess])

  const wasPreviouslySent = !!sentAt

  // Determine if we should show the wide layout with preview
  const showPreview = activeTab === 'send'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={showPreview ? 'sm:max-w-5xl' : 'sm:max-w-lg'} style={{ transition: 'max-width 0.2s ease' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {offerNumber}
          </DialogTitle>
          <DialogDescription>
            Send offer to {clientName || 'the client'} or update its status
          </DialogDescription>
        </DialogHeader>

        {/* Previous send info banner */}
        {wasPreviouslySent && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <Clock className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-blue-800">
                Last sent on <strong>{formatDateTime(sentAt!)}</strong>
              </span>
              {sentToEmail && (
                <span className="text-blue-600"> to <strong>{sentToEmail}</strong></span>
              )}
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'send' | 'status')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="send" className="flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Send Email
            </TabsTrigger>
            <TabsTrigger value="status" className="flex items-center gap-1.5">
              <Edit2 className="h-3.5 w-3.5" />
              Change Status
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="mt-4">
            <div className="flex gap-6">
              {/* Left column — form controls */}
              <div className="flex-1 min-w-0 space-y-4">
                {isLoadingContacts ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner className="h-6 w-6" />
                  </div>
                ) : (
                  <>
                    {/* Email destination section */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Send to</Label>

                      {/* Mode toggle if contacts exist */}
                      {contacts.length > 0 && (
                        <div className="flex gap-2 mb-3">
                          <Button
                            type="button"
                            variant={emailMode === 'contact' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setEmailMode('contact')}
                            className="flex-1"
                          >
                            <User className="h-3.5 w-3.5 mr-1.5" />
                            Client Contact
                          </Button>
                          <Button
                            type="button"
                            variant={emailMode === 'custom' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setEmailMode('custom')}
                            className="flex-1"
                          >
                            <Mail className="h-3.5 w-3.5 mr-1.5" />
                            Custom Email
                          </Button>
                        </div>
                      )}

                      {emailMode === 'contact' && contacts.length > 0 ? (
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {contacts.map((contact) => (
                            <label
                              key={contact.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedContactId === contact.id
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              <input
                                type="radio"
                                name="contact"
                                value={contact.id}
                                checked={selectedContactId === contact.id}
                                onChange={() => setSelectedContactId(contact.id)}
                                className="sr-only"
                              />
                              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{contact.fullName}</span>
                                  {contact.isPrimary && (
                                    <Badge variant="secondary" className="text-xs">Primary</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground font-mono">{contact.email}</div>
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                  selectedContactId === contact.id
                                    ? 'border-primary bg-primary'
                                    : 'border-muted-foreground/30'
                                }`}
                              >
                                {selectedContactId === contact.id && (
                                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            type="email"
                            placeholder="recipient@example.com"
                            value={customEmail}
                            onChange={(e) => setCustomEmail(e.target.value)}
                            className={`font-mono ${
                              customEmail && !isValidEmail(customEmail)
                                ? 'border-red-500 focus-visible:ring-red-500'
                                : ''
                            }`}
                          />
                          {customEmail && !isValidEmail(customEmail) && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Please enter a valid email address
                            </p>
                          )}
                          {contacts.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              No contacts found for this client. Enter email manually.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Target email preview */}
                    {targetEmail && canSend && (
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <Mail className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-800">
                          Will be sent to: <strong className="font-mono">{targetEmail}</strong>
                        </span>
                      </div>
                    )}

                    {/* Optional Message */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Message (optional)</Label>
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Add a personal message to include in the email..."
                        rows={3}
                        maxLength={2000}
                      />
                    </div>

                    {/* Attachment Preview */}
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Attachment:</span>
                      <span className="font-medium">{offerNumber}.pdf</span>
                    </div>
                  </>
                )}
              </div>

              {/* Right column — email preview */}
              <div className="w-[380px] flex-shrink-0 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Email Preview</Label>
                  {previewLoading && <Spinner className="h-3 w-3" />}
                </div>
                {previewSubject && (
                  <div className="text-xs text-muted-foreground mb-2 truncate" title={previewSubject}>
                    Subject: <span className="font-medium text-foreground">{previewSubject}</span>
                  </div>
                )}
                <div
                  className="flex-1 border rounded-lg overflow-hidden bg-white"
                  style={{ minHeight: 380 }}
                >
                  {previewHtml ? (
                    <iframe
                      srcDoc={previewHtml}
                      title="Email preview"
                      sandbox=""
                      className="w-full h-full border-0"
                      style={{ minHeight: 380, transform: 'scale(0.65)', transformOrigin: 'top left', width: '154%', height: '154%' }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      {previewLoading ? <Spinner className="h-5 w-5" /> : 'Loading preview...'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4 mt-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Update offer status</Label>
              <p className="text-sm text-muted-foreground">
                Current status: <Badge variant="outline">{currentStatus.toUpperCase()}</Badge>
              </p>

              <div className="grid gap-2">
                {currentStatus === 'draft' && (
                  <Button
                    variant="outline"
                    onClick={() => handleStatusChange('sent')}
                    disabled={isUpdatingStatus}
                    className="justify-start"
                  >
                    <Send className="h-4 w-4 mr-2 text-blue-600" />
                    Mark as Sent
                    <span className="text-xs text-muted-foreground ml-auto">
                      Sent manually outside the system
                    </span>
                  </Button>
                )}

                {(currentStatus === 'draft' || currentStatus === 'sent') && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleStatusChange('accepted')}
                      disabled={isUpdatingStatus}
                      className="justify-start"
                    >
                      <Check className="h-4 w-4 mr-2 text-green-600" />
                      Mark as Accepted
                      <span className="text-xs text-muted-foreground ml-auto">
                        Client accepted the offer
                      </span>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleStatusChange('declined')}
                      disabled={isUpdatingStatus}
                      className="justify-start"
                    >
                      <XCircle className="h-4 w-4 mr-2 text-red-600" />
                      Mark as Declined
                      <span className="text-xs text-muted-foreground ml-auto">
                        Client declined the offer
                      </span>
                    </Button>
                  </>
                )}

                {currentStatus === 'accepted' && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                    <Check className="h-4 w-4 inline mr-2" />
                    This offer has been accepted. You can now convert it to a project.
                  </div>
                )}

                {currentStatus === 'declined' && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                    <XCircle className="h-4 w-4 inline mr-2" />
                    This offer was declined. You can create a new version to revise it.
                  </div>
                )}

                {currentStatus === 'expired' && (
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                    <AlertCircle className="h-4 w-4 inline mr-2" />
                    This offer has expired. Create a new version to extend validity.
                  </div>
                )}

                {currentStatus === 'superseded' && (
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                    <AlertCircle className="h-4 w-4 inline mr-2" />
                    This offer has been superseded by a newer version.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending || isUpdatingStatus}>
            Cancel
          </Button>
          {activeTab === 'send' && (
            <Button
              onClick={handleSend}
              disabled={isSending || !canSend || isLoadingContacts}
            >
              {isSending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
