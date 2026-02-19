'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, ExternalLink, Loader2 } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type OfferLine = {
  id: string
  lineNumber: number
  productName?: string | null
  chargeCode?: string | null
  chargeBasis?: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  isEnabled: boolean
}

type OfferCalculation = {
  id: string
  calculationNumber: number
  label?: string | null
  lines: OfferLine[]
}

type Offer = {
  id: string
  offerNumber: string
  status: string
  calculations?: OfferCalculation[]
}

type ProjectOfferLinesProps = {
  offerId: string | null | undefined
  rfqId?: string | null | undefined
  currencyCode?: string
}

const formatCurrency = (value: number | string, currency: string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function ProjectOfferLines({ offerId, rfqId, currencyCode = 'USD' }: ProjectOfferLinesProps) {
  const { data: offer, isLoading } = useQuery({
    queryKey: ['fms_offer', offerId],
    queryFn: async () => {
      if (!offerId) return null
      const response = await apiCall<Offer>(`/api/fms_offers/offers/${offerId}`)
      if (!response.ok) throw new Error('Failed to load offer')
      return response.result
    },
    enabled: !!offerId,
  })

  if (!offerId) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Offer Line Items
        </h2>
        <div className="text-sm text-gray-500">
          This project was not created from an offer.
          {rfqId && (
            <span className="ml-1">
              <a
                href={`/backend/fms-rfqs/${rfqId}`}
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                View RFQ <ExternalLink className="h-3 w-3" />
              </a>
            </span>
          )}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Offer Line Items
        </h2>
        <div className="flex items-center justify-center py-4 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading offer details...
        </div>
      </div>
    )
  }

  if (!offer) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Offer Line Items
        </h2>
        <div className="text-sm text-gray-500">Offer not found</div>
      </div>
    )
  }

  const allLines = (offer.calculations || []).flatMap(c => c.lines || [])
  const enabledLines = allLines.filter(l => l.isEnabled)
  const totalAmount = enabledLines.reduce((sum, line) => sum + (parseFloat(line.sellPrice) || 0), 0)

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Offer Line Items
        </h2>
        <div className="flex items-center gap-3">
          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
            offer.status === 'accepted' ? 'bg-green-100 text-green-800' :
            offer.status === 'sent' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {offer.status.toUpperCase()}
          </span>
          <a
            href={`/backend/fms-offers`}
            className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            {offer.offerNumber} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {enabledLines.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">#</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Code</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Product / Service</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Basis</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Buy</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Sell</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {enabledLines.map((line) => (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-500">{line.lineNumber}</td>
                    <td className="py-2 px-3 font-mono text-xs">{line.chargeCode || '-'}</td>
                    <td className="py-2 px-3">{line.productName || '-'}</td>
                    <td className="py-2 px-3">{line.chargeBasis || '-'}</td>
                    <td className="py-2 px-3 text-right">
                      {formatCurrency(line.buyPrice, line.currencyCode || currencyCode)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {formatCurrency(line.sellPrice, line.currencyCode || currencyCode)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-gray-50">
                <tr>
                  <td colSpan={5} className="py-3 px-3 text-right font-semibold">
                    Total:
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-lg">
                    {formatCurrency(totalAmount, currencyCode)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <div className="text-sm text-gray-500">No line items in this offer</div>
      )}
    </div>
  )
}
