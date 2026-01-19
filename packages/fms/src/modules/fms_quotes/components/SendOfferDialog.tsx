'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail, User, Paperclip } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

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
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function SendOfferDialog({
  offerId,
  offerNumber,
  clientName,
  open,
  onClose,
  onSuccess,
}: SendOfferDialogProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)

  // Fetch contacts for this offer's client
  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['offer-contacts', offerId],
    queryFn: async () => {
      const response = await apiCall<{
        contacts: Contact[]
        clientId: string | null
        clientName: string | null
      }>(`/api/fms_quotes/offers/${offerId}/contacts`)
      if (!response.ok) throw new Error('Failed to load contacts')
      return response.result
    },
    enabled: open,
  })

  const contacts = contactsData?.contacts || []

  // Auto-select primary contact
  React.useEffect(() => {
    if (contacts.length > 0 && !selectedContactId) {
      const primary = contacts.find((c) => c.isPrimary)
      setSelectedContactId(primary?.id || contacts[0].id)
    }
  }, [contacts, selectedContactId])

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSelectedContactId(null)
      setMessage('')
    }
  }, [open])

  const selectedContact = contacts.find((c) => c.id === selectedContactId)

  const handleSend = useCallback(async () => {
    if (!selectedContactId) return

    setIsSending(true)
    try {
      const response = await apiCall<{ ok: boolean; message: string }>(`/api/fms_quotes/offers/${offerId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContactId,
          message: message.trim() || undefined,
        }),
      })

      if (response.ok) {
        flash(`Offer sent to ${selectedContact?.email}`, 'success')
        onSuccess()
      } else {
        flash(response.result?.message || 'Failed to send offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsSending(false)
    }
  }, [offerId, selectedContactId, selectedContact, message, onSuccess])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Offer to Client
          </DialogTitle>
          <DialogDescription>
            Send {offerNumber} to {clientName || 'the client'} via email
          </DialogDescription>
        </DialogHeader>

        {isLoadingContacts ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No contacts found for this client.</p>
            <p className="text-sm mt-2">Add contacts to the client first.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Contact Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Select Recipient</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedContactId === contact.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
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
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{contact.fullName}</span>
                        {contact.isPrimary && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{contact.email}</div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        selectedContactId === contact.id
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedContactId === contact.id && (
                        <svg className="w-full h-full text-white" viewBox="0 0 16 16">
                          <circle cx="8" cy="8" r="3" fill="currentColor" />
                        </svg>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Optional Message */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Message (optional)
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a personal message to include in the email..."
                rows={3}
                maxLength={2000}
              />
            </div>

            {/* Attachment Preview */}
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Attachment:</span>
              <span className="font-medium">{offerNumber}.pdf</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !selectedContactId || contacts.length === 0}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
