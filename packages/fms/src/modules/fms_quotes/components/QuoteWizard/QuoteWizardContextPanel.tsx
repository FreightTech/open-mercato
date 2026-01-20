'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  Upload,
  Download,
  Sparkles,
  Trash2,
  Eye,
  File,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { DocumentUploadDialog } from '../../../fms_documents/components/DocumentUploadDialog'
import { MARGIN_THRESHOLDS, MARGIN_COLORS } from '../../constants'

// =============================================================================
// Types
// =============================================================================

type QuoteDocument = {
  id: string
  name: string
  category: string
  fileName: string
  fileSize: number
  attachmentId: string
  url: string
  processedAt?: string | null
  extractedData?: Record<string, unknown> | null
  createdAt: string
}

type ClientQuote = {
  id: string
  quoteNumber: string | null
  status: string
  direction: string | null
  createdAt: string
  totalCost?: string | null
  totalSales?: string | null
  originPorts?: Array<{ id: string; locode?: string | null; name?: string | null }> | null
  destinationPorts?: Array<{ id: string; locode?: string | null; name?: string | null }> | null
}

type ExchangeRateData = {
  id: string
  fromCurrencyCode: string
  toCurrencyCode: string
  rate: string
  date: string
  source: string
  isActive: boolean
}

type QuoteWizardContextPanelProps = {
  clientId?: string | null
  clientName?: string | null
  quoteId?: string | null
  quoteCurrency: string
  lineCurrencies: string[]
}

// =============================================================================
// Helper Functions
// =============================================================================

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (['pdf'].includes(ext || '')) return FileText
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return ImageIcon
  return File
}

const formatRelativeDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'won':
      return 'bg-green-100 text-green-700'
    case 'lost':
      return 'bg-red-100 text-red-700'
    case 'draft':
      return 'bg-gray-100 text-gray-700'
    case 'ready':
      return 'bg-blue-100 text-blue-700'
    case 'offered':
      return 'bg-purple-100 text-purple-700'
    case 'expired':
      return 'bg-orange-100 text-orange-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

const calculateMargin = (totalCost?: string | null, totalSales?: string | null): string | null => {
  if (!totalCost || !totalSales) return null
  const cost = parseFloat(totalCost)
  const sales = parseFloat(totalSales)
  if (cost === 0 || sales === 0) return null
  const margin = ((sales - cost) / sales) * 100
  return margin.toFixed(1)
}

const getMarginColor = (margin: string | null): string => {
  if (!margin) return ''
  const value = parseFloat(margin)
  if (value < MARGIN_THRESHOLDS.LOW) return MARGIN_COLORS.LOW
  if (value < MARGIN_THRESHOLDS.HIGH) return MARGIN_COLORS.MEDIUM
  return MARGIN_COLORS.HIGH
}

// =============================================================================
// Hooks
// =============================================================================

function useClientQuotes(clientId: string | null | undefined, currentQuoteId: string | null | undefined) {
  return useQuery({
    queryKey: ['client-quotes', clientId],
    queryFn: async () => {
      if (!clientId) return []

      const response = await apiCall<{
        items: ClientQuote[]
        total: number
      }>(`/api/fms_quotes?clientId=${clientId}&sortField=createdAt&sortDir=desc&pageSize=6`)

      if (!response.ok || !response.result?.items) {
        return []
      }

      // Filter out current quote and limit to 5
      return response.result.items
        .filter((q) => q.id !== currentQuoteId)
        .slice(0, 5)
    },
    enabled: !!clientId,
    staleTime: 30 * 1000, // 30 seconds
  })
}

function useQuoteDocuments(quoteId: string | null | undefined) {
  return useQuery({
    queryKey: ['quote_documents', quoteId],
    queryFn: async () => {
      if (!quoteId) return []

      const response = await apiCall<{ items: QuoteDocument[] }>(
        `/api/fms_documents/documents?relatedEntityId=${quoteId}&relatedEntityType=fms_quotes:fms_quote`
      )
      if (!response.ok) return []
      return response.result?.items || []
    },
    enabled: !!quoteId,
  })
}

function useExchangeRates(baseCurrency: string, currencies: string[]) {
  // Get unique currencies that are different from base currency
  const uniqueCurrencies = [...new Set(currencies)].filter(c => c !== baseCurrency)

  return useQuery({
    queryKey: ['exchange-rates', baseCurrency, uniqueCurrencies.sort().join(',')],
    queryFn: async () => {
      if (uniqueCurrencies.length === 0) return []

      // Fetch all active exchange rates
      const response = await apiCall<{
        items: ExchangeRateData[]
        total: number
      }>('/api/currencies/exchange-rates?isActive=true&pageSize=100')

      if (!response.ok || !response.result?.items) {
        return []
      }

      // Filter for relevant currency pairs
      const relevantRates = response.result.items.filter(rate => {
        // Match pairs where one side is the base currency and other is in our line currencies
        const isFromBase = rate.fromCurrencyCode === baseCurrency && uniqueCurrencies.includes(rate.toCurrencyCode)
        const isToBase = rate.toCurrencyCode === baseCurrency && uniqueCurrencies.includes(rate.fromCurrencyCode)
        return isFromBase || isToBase
      })

      // Group by currency pair and get the most recent rate for each
      const rateMap = new Map<string, ExchangeRateData>()
      for (const rate of relevantRates) {
        // Normalize key so USD->EUR and EUR->USD are treated as same pair
        const currencies = [rate.fromCurrencyCode, rate.toCurrencyCode].sort()
        const key = currencies.join('-')
        const existing = rateMap.get(key)
        if (!existing || new Date(rate.date) > new Date(existing.date)) {
          rateMap.set(key, rate)
        }
      }

      return Array.from(rateMap.values())
    },
    enabled: uniqueCurrencies.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

function formatRate(rate: string): string {
  const num = parseFloat(rate)
  if (isNaN(num)) return rate
  return num.toFixed(4)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function QuoteWizardContextPanel({
  clientId,
  clientName,
  quoteId,
  quoteCurrency,
  lineCurrencies,
}: QuoteWizardContextPanelProps) {
  const queryClient = useQueryClient()
  const [isFetching, setIsFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Document states
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [extractingId, setExtractingId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState<QuoteDocument | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showExtractedData, setShowExtractedData] = useState<QuoteDocument | null>(null)

  const { data: exchangeRates, isLoading: isLoadingRates } = useExchangeRates(quoteCurrency, lineCurrencies)
  const { data: clientQuotes, isLoading: isLoadingClientQuotes } = useClientQuotes(clientId, quoteId)
  const { data: documents, isLoading: isLoadingDocuments } = useQuoteDocuments(quoteId)

  // Document handlers
  const handleExtract = useCallback(
    async (doc: QuoteDocument) => {
      setExtractingId(doc.id)
      try {
        const response = await apiCall<{ ok: boolean; extractedData?: Record<string, unknown> }>(
          `/api/fms_documents/documents/${doc.id}/extract`,
          { method: 'POST' }
        )

        if (response.ok && response.result?.ok) {
          flash('Data extracted successfully', 'success')
          queryClient.invalidateQueries({ queryKey: ['quote_documents', quoteId] })
        } else {
          flash('Failed to extract data', 'error')
        }
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Extraction failed', 'error')
      } finally {
        setExtractingId(null)
      }
    },
    [quoteId, queryClient]
  )

  const handleDelete = useCallback(async () => {
    if (!showDeleteDialog) return

    setDeletingId(showDeleteDialog.id)
    try {
      const response = await apiCall(`/api/fms_documents/documents/${showDeleteDialog.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Document deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['quote_documents', quoteId] })
        setShowDeleteDialog(null)
      } else {
        flash('Failed to delete document', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Delete failed', 'error')
    } finally {
      setDeletingId(null)
    }
  }, [showDeleteDialog, quoteId, queryClient])

  // Check if there are currencies different from quote currency
  const hasMultipleCurrencies = lineCurrencies.some(c => c !== quoteCurrency)

  // Get the missing currencies for display
  const missingCurrencies = lineCurrencies.filter(c => c !== quoteCurrency)
  const missingCurrenciesDisplay = [...new Set(missingCurrencies)].join(', ')

  // Check if quote currency is PLN-based (providers only support PLN pairs)
  const isPLNBased = quoteCurrency === 'PLN' || missingCurrencies.includes('PLN')

  const handleFetchRates = async () => {
    setIsFetching(true)
    setFetchError(null)
    try {
      const response = await apiCall<{
        totalFetched: number
        byProvider: Record<string, { count: number; errors?: string[] }>
        errors: string[]
      }>('/api/currencies/fetch-rates', {
        method: 'POST',
        body: JSON.stringify({ date: new Date().toISOString() }),
      })
      if (response.ok) {
        // Invalidate query to refresh rates
        await queryClient.invalidateQueries({ queryKey: ['exchange-rates'] })
        // If no rates were fetched and we're not PLN-based, show provider limitation
        if (response.result?.totalFetched === 0 && !isPLNBased) {
          setFetchError('Providers only support PLN-based rates')
        }
      } else {
        setFetchError('Failed to fetch rates')
      }
    } catch (error) {
      setFetchError('Failed to fetch rates')
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <div className="w-80 border-l bg-muted/20 flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-sm font-medium">Context</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Exchange Rates Section */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-medium uppercase text-muted-foreground">
              Exchange Rates ({quoteCurrency})
            </h3>
          </div>
          {isLoadingRates ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading rates...</span>
            </div>
          ) : !hasMultipleCurrencies ? (
            <div className="text-sm text-muted-foreground italic">
              All products in {quoteCurrency}
            </div>
          ) : exchangeRates && exchangeRates.length > 0 ? (
            <div className="space-y-2">
              {exchangeRates.map((rate) => {
                const isFromBase = rate.fromCurrencyCode === quoteCurrency
                const otherCurrency = isFromBase ? rate.toCurrencyCode : rate.fromCurrencyCode
                const displayRate = isFromBase
                  ? `1 ${quoteCurrency} = ${formatRate(rate.rate)} ${otherCurrency}`
                  : `1 ${otherCurrency} = ${formatRate(rate.rate)} ${quoteCurrency}`

                return (
                  <div
                    key={rate.id}
                    className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1.5"
                  >
                    <span className="font-mono">{displayRate}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(rate.date)}
                    </span>
                  </div>
                )
              })}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleFetchRates}
                disabled={isFetching}
                className="h-7 text-xs"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh Rates
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground italic">
                No rates found for {missingCurrenciesDisplay}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleFetchRates}
                disabled={isFetching}
                className="h-7 text-xs"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Fetch Latest Rates
                  </>
                )}
              </Button>
              {fetchError && (
                <div className="text-xs text-red-500">{fetchError}</div>
              )}
            </div>
          )}
        </section>

        {/* Documents Section */}
        {quoteId && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-medium uppercase text-muted-foreground">Documents</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsUploadDialogOpen(true)}
                className="h-6 text-xs px-2"
              >
                <Upload className="h-3 w-3 mr-1" />
                Upload
              </Button>
            </div>
            {isLoadingDocuments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading...</span>
              </div>
            ) : documents && documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const FileIcon = getFileIcon(doc.fileName)
                  const hasExtractedData = !!doc.extractedData && Object.keys(doc.extractedData).length > 0

                  return (
                    <div
                      key={doc.id}
                      className="bg-muted/50 rounded px-2 py-1.5 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <FileIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium truncate flex-1 text-xs">{doc.name}</span>
                        {hasExtractedData && (
                          <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(doc.fileSize)}
                          {hasExtractedData ? ' • Extracted' : ' • Uploaded'}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {hasExtractedData && (
                            <button
                              onClick={() => setShowExtractedData(doc)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="View extracted data"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleExtract(doc)}
                            disabled={extractingId === doc.id}
                            className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                            title="Extract with AI"
                          >
                            {extractingId === doc.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                          </button>
                          <a
                            href={`/api/fms_documents/documents/${doc.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Download"
                          >
                            <Download className="h-3 w-3" />
                          </a>
                          <button
                            onClick={() => setShowDeleteDialog(doc)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div
                className="text-center py-3 text-xs text-muted-foreground border border-dashed rounded cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => setIsUploadDialogOpen(true)}
              >
                <Upload className="h-4 w-4 mx-auto mb-1 opacity-50" />
                <p>No documents uploaded</p>
              </div>
            )}
          </section>
        )}

        {/* Recent Client Quotes */}
        {clientId && clientName && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-medium uppercase text-muted-foreground truncate">
                Recent Quotes for {clientName}
              </h3>
            </div>
            {isLoadingClientQuotes ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading...</span>
              </div>
            ) : clientQuotes && clientQuotes.length > 0 ? (
              <div className="space-y-2">
                {clientQuotes.map((cq) => {
                  const margin = calculateMargin(cq.totalCost, cq.totalSales)
                  const relativeDate = formatRelativeDate(cq.createdAt)
                  const originDisplay = cq.originPorts?.map(p => p.locode || p.name).join(', ') || ''
                  const destDisplay = cq.destinationPorts?.map(p => p.locode || p.name).join(', ') || ''
                  const routeDisplay = originDisplay && destDisplay
                    ? `${originDisplay} → ${destDisplay}`
                    : originDisplay || destDisplay || 'No route'

                  return (
                    <div
                      key={cq.id}
                      className="bg-muted/50 rounded px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium truncate flex-1 mr-2">
                          {routeDisplay}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase flex-shrink-0 ${getStatusColor(cq.status)}`}
                        >
                          {cq.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {margin && (
                          <span className={`font-medium ${getMarginColor(margin)}`}>
                            {margin}% margin
                          </span>
                        )}
                        {margin && relativeDate && <span>•</span>}
                        {relativeDate && <span>{relativeDate}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No recent quotes found
              </div>
            )}
          </section>
        )}

      </div>

      {/* Upload Dialog */}
      {quoteId && (
        <DocumentUploadDialog
          open={isUploadDialogOpen}
          onOpenChange={setIsUploadDialogOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['quote_documents', quoteId] })
          }}
          relatedEntityId={quoteId}
          relatedEntityType="fms_quotes:fms_quote"
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!showDeleteDialog} onOpenChange={(open) => !open && setShowDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{showDeleteDialog?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)} disabled={!!deletingId}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!deletingId}>
              {deletingId ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extracted data dialog */}
      <Dialog open={!!showExtractedData} onOpenChange={(open) => !open && setShowExtractedData(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Extracted Data</DialogTitle>
            <DialogDescription>Data extracted from &quot;{showExtractedData?.name}&quot;</DialogDescription>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-4 overflow-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(showExtractedData?.extractedData, null, 2)}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtractedData(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
