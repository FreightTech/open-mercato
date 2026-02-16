'use client'

import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { FRC_OFFER_STATUSES } from '../../../lib/types'

interface FrcRfqOption {
  id: string
  name: string
}

type FrcOfferCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  prefilledRfqId?: string
  prefilledRfqName?: string
}

const STATUS_OPTIONS = FRC_OFFER_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'PLN', label: 'PLN' },
]

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function FrcOfferCreateDialog({
  open,
  onOpenChange,
  onCreated,
  prefilledRfqId,
  prefilledRfqName,
}: FrcOfferCreateDialogProps) {
  const [name, setName] = useState('')
  const [rfqId, setRfqId] = useState<string>('')
  const [status, setStatus] = useState<string>('draft')
  const [currencyCode, setCurrencyCode] = useState<string>('EUR')
  const [departureDate, setDepartureDate] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch available RFQs (opportunities)
  const { data: rfqsData } = useQuery({
    queryKey: ['frc_rfqs_for_offer'],
    queryFn: async () => {
      const response = await apiCall<{ items: FrcRfqOption[] }>(
        '/api/frc_rfqs/rfqs?limit=100&sortField=name&sortDir=asc'
      )
      if (!response.ok) throw new Error('Failed to load opportunities')
      return response.result?.items ?? []
    },
    enabled: open,
  })

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setRfqId(prefilledRfqId ?? '')
      setName(prefilledRfqName ? `Offer - ${prefilledRfqName}` : '')
      setStatus('draft')
      setCurrencyCode('EUR')
      setDepartureDate('')
    }
  }, [open, prefilledRfqId, prefilledRfqName])

  // Auto-generate name based on RFQ selection
  useEffect(() => {
    if (rfqId && rfqsData) {
      const selectedRfq = rfqsData.find((rfq) => rfq.id === rfqId)
      if (selectedRfq && !name) {
        setName(`Offer - ${selectedRfq.name}`)
      }
    }
  }, [rfqId, rfqsData, name])

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      flash('Offer name is required', 'error')
      return
    }
    if (!rfqId) {
      flash('Please select an opportunity', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await apiCall<{ id: string; error?: string }>('/api/frc_offers/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rfqId,
          status,
          currencyCode,
          departureDate: departureDate || null,
        }),
      })

      if (response.ok && response.result?.id) {
        onCreated()
      } else {
        const error = response.result?.error || 'Failed to create offer'
        flash(error, 'error')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [name, rfqId, status, currencyCode, departureDate, onCreated])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Create New Offer</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="rfqId">Opportunity *</Label>
            <select
              id="rfqId"
              value={rfqId}
              onChange={(e) => setRfqId(e.target.value)}
              className={selectClassName}
              required
            >
              <option value="">Select an opportunity...</option>
              {rfqsData?.map((rfq) => (
                <option key={rfq.id} value={rfq.id}>
                  {rfq.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name">Offer Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter offer name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={selectClassName}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="currencyCode">Currency</Label>
              <select
                id="currencyCode"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className={selectClassName}
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="departureDate">Departure Date</Label>
            <Input
              id="departureDate"
              type="date"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
