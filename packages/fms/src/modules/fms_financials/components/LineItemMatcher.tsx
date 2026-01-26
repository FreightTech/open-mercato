'use client'

import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Label } from '@open-mercato/ui/primitives/label'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Search, CheckCircle2, Sparkles, Check } from 'lucide-react'

interface LineItem {
  id: string
  lineNumber: number
  description: string
}

interface ChargeCodeMatch {
  chargeCodeId: string
  code: string
  name: string | null
  confidence: number
  matchReason: string
}

interface LineItemMatcherProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lineItem: LineItem
  invoiceId: string
  onMatchSuccess?: () => void
}

export function LineItemMatcher({
  open,
  onOpenChange,
  lineItem,
  invoiceId,
  onMatchSuccess,
}: LineItemMatcherProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChargeCodeId, setSelectedChargeCodeId] = useState<string | null>(null)

  // Get suggested matches
  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['charge-code-suggestions', invoiceId],
    queryFn: async () => {
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}/match-charges`)
      return result as {
        invoiceId: string
        matches: Array<{
          lineItemId: string
          lineItem: { lineNumber: number; description: string } | null
          suggestions: ChargeCodeMatch[]
          bestMatch: ChargeCodeMatch | null
        }>
      }
    },
    enabled: open,
  })

  // Search charge codes
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['charge-codes-search', searchQuery],
    queryFn: async () => {
      const { result } = await apiCall(`/api/fms_products/charge-codes?q=${encodeURIComponent(searchQuery)}&limit=10`)
      return result as { items: Array<{ id: string; code: string; name: string | null }> }
    },
    enabled: searchQuery.length >= 2,
  })

  const matchMutation = useMutation({
    mutationFn: async (chargeCodeId: string) => {
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}/match-charges`, {
        method: 'POST',
        body: JSON.stringify({
          matches: [{ lineItemId: lineItem.id, chargeCodeId, confidence: 100 }],
        }),
      })
      return result
    },
    onSuccess: () => {
      onMatchSuccess?.()
      onOpenChange(false)
    },
  })

  // Find suggestions for this specific line item
  const lineItemSuggestions = suggestionsData?.matches.find(
    (m) => m.lineItemId === lineItem.id
  )?.suggestions ?? []

  const handleMatch = useCallback(() => {
    if (selectedChargeCodeId) {
      matchMutation.mutate(selectedChargeCodeId)
    }
  }, [selectedChargeCodeId, matchMutation])

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-green-600'
    if (confidence >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedChargeCodeId(null)
      setSearchQuery('')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Match Charge Code</DialogTitle>
          <DialogDescription>
            Select a charge code for line item #{lineItem.lineNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Line item description */}
          <div className="p-3 bg-muted/50 rounded-md">
            <Label className="text-xs text-muted-foreground">Line Item Description</Label>
            <p className="text-sm mt-1">{lineItem.description}</p>
          </div>

          {/* AI Suggestions */}
          {(suggestionsLoading || lineItemSuggestions.length > 0) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <Label className="text-sm font-medium">AI Suggestions</Label>
              </div>

              {suggestionsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : (
                <div className="space-y-2">
                  {lineItemSuggestions.slice(0, 5).map((suggestion) => (
                    <div
                      key={suggestion.chargeCodeId}
                      className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
                        selectedChargeCodeId === suggestion.chargeCodeId
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedChargeCodeId(suggestion.chargeCodeId)}
                    >
                      <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        selectedChargeCodeId === suggestion.chargeCodeId
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground'
                      }`}>
                        {selectedChargeCodeId === suggestion.chargeCodeId && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono">
                            {suggestion.code}
                          </Badge>
                          <span
                            className={`text-xs font-medium ${getConfidenceColor(suggestion.confidence)}`}
                          >
                            {suggestion.confidence}%
                          </span>
                        </div>
                        {suggestion.name && (
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {suggestion.name}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {suggestion.matchReason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manual Search */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Search Charge Codes</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {searchQuery.length >= 2 && (
              <div className="mt-2 max-h-[200px] overflow-y-auto border rounded-md">
                {searchLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : searchResults?.items?.length ? (
                  <div className="divide-y">
                    {searchResults.items.map((cc) => (
                      <div
                        key={cc.id}
                        className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                          selectedChargeCodeId === cc.id
                            ? 'bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedChargeCodeId(cc.id)}
                      >
                        <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                          selectedChargeCodeId === cc.id
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground'
                        }`}>
                          {selectedChargeCodeId === cc.id && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Badge variant="secondary" className="font-mono">
                            {cc.code}
                          </Badge>
                          {cc.name && (
                            <p className="text-sm text-muted-foreground truncate mt-1">
                              {cc.name}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No charge codes found
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMatch}
            disabled={!selectedChargeCodeId || matchMutation.isPending}
          >
            {matchMutation.isPending ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Apply Match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
