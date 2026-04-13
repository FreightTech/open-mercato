"use client"
import * as React from 'react'

interface ParsedDocumentData {
  id: string
  documentType: 'bill_of_lading' | 'commercial_invoice' | 'packing_list'
  fileName: string
  extracted: Record<string, unknown> | null
  parseError: string | null
}

interface SourceQuote {
  quote: string
  page: number
}

interface ParsedDataViewProps {
  documents: ParsedDocumentData[]
  onVerify?: (docId: string, quote: string, page: number, fieldValue: string) => void
}

const FIELDS = [
  { key: 'documentNumber', label: 'Document Number' },
  { key: 'documentDate', label: 'Date' },
  { key: 'shipperName', label: 'Shipper' },
  { key: 'shipperAddress', label: 'Shipper Address' },
  { key: 'buyerName', label: 'Buyer' },
  { key: 'buyerAddress', label: 'Buyer Address' },
  { key: 'consigneeName', label: 'Consignee' },
  { key: 'consigneeAddress', label: 'Consignee Address' },
  { key: 'notifyParty', label: 'Notify Party' },
  { key: 'carrierName', label: 'Carrier' },
  { key: 'vessel', label: 'Vessel' },
  { key: 'voyageNumber', label: 'Voyage' },
  { key: 'placeOfReceipt', label: 'Place of Receipt' },
  { key: 'loadingPort', label: 'Port of Loading' },
  { key: 'dischargePort', label: 'Port of Discharge' },
  { key: 'placeOfDelivery', label: 'Place of Delivery' },
  { key: 'incoterms', label: 'Incoterms' },
  { key: 'freightTerms', label: 'Freight Terms' },
  { key: 'totalGrossWeightKg', label: 'Gross Weight (KG)' },
  { key: 'totalNetWeightKg', label: 'Net Weight (KG)' },
  { key: 'totalVolumeCbm', label: 'Volume (CBM)' },
  { key: 'totalPackages', label: 'Total Packages' },
  { key: 'totalValue', label: 'Total Value' },
  { key: 'currency', label: 'Currency' },
  { key: 'contractReference', label: 'Contract Reference' },
  { key: 'paymentTerms', label: 'Payment Terms' },
  { key: 'shippedOnBoard', label: 'Shipped on Board' },
  { key: 'containerNumbers', label: 'Container Numbers' },
  { key: 'sealNumbers', label: 'Seal Numbers' },
  { key: 'invoiceReference', label: 'Invoice Reference' },
]

const DOC_TYPE_LABELS: Record<string, string> = {
  bill_of_lading: 'B/L',
  commercial_invoice: 'Invoice',
  packing_list: 'Packing List',
}

function formatValue(value: unknown): string {
  if (value == null) return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'number') return value.toLocaleString()
  return String(value)
}

function getSourceQuote(extracted: Record<string, unknown>, fieldKey: string): SourceQuote | null {
  const quotes = extracted._sourceQuotes as Record<string, SourceQuote> | undefined
  if (!quotes) return null
  const entry = quotes[fieldKey]
  if (!entry || !entry.quote) return null
  return entry
}

export default function ParsedDataView({ documents, onVerify }: ParsedDataViewProps) {
  const docTypes = ['bill_of_lading', 'commercial_invoice', 'packing_list'] as const
  const extractedByType = new Map<string, Record<string, unknown>>()
  const docIdByType = new Map<string, string>()

  for (const doc of documents) {
    if (doc.extracted) {
      extractedByType.set(doc.documentType, doc.extracted)
      docIdByType.set(doc.documentType, doc.id)
    }
  }

  if (extractedByType.size === 0) {
    return <p className="text-sm text-muted-foreground">No parsed data available yet.</p>
  }

  // Detect value differences for highlighting
  function hasDifference(fieldKey: string): boolean {
    const values = docTypes
      .map((docType) => extractedByType.get(docType)?.[fieldKey])
      .filter((value) => value != null)
    if (values.length <= 1) return false
    const stringValues = values.map((value) => formatValue(value))
    return new Set(stringValues).size > 1
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-3 py-2 font-medium text-foreground w-40">Field</th>
            {docTypes.map((docType) => (
              <th key={docType} className="text-left px-3 py-2 font-medium text-foreground">
                {DOC_TYPE_LABELS[docType]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FIELDS.map((field) => {
            const isDiff = hasDifference(field.key)
            return (
              <tr key={field.key} className={`border-b border-border ${isDiff ? 'bg-amber-50 dark:bg-amber-500/10' : ''}`}>
                <td className="px-3 py-1.5 font-medium text-xs text-muted-foreground">
                  {field.label}
                </td>
                {docTypes.map((docType) => {
                  const extracted = extractedByType.get(docType)
                  const value = extracted?.[field.key]
                  const formatted = formatValue(value)
                  const sourceQuote = extracted ? getSourceQuote(extracted, field.key) : null
                  const docId = docIdByType.get(docType)
                  const isClickable = sourceQuote && onVerify && docId

                  return (
                    <td key={docType} className="px-3 py-1.5 text-xs">
                      {isClickable ? (
                        <button
                          onClick={() => onVerify(docId, sourceQuote.quote, sourceQuote.page, formatted)}
                          className={`text-left hover:bg-primary/10 rounded px-1 -mx-1 py-0.5 -my-0.5 transition-colors group ${
                            formatted === '—' ? 'text-muted-foreground' : 'text-foreground'
                          }`}
                          title={`Show in PDF (page ${sourceQuote.page})`}
                        >
                          <span>{formatted}</span>
                          <span className="ml-1 text-primary/0 group-hover:text-primary/60 transition-colors text-[10px]">p.{sourceQuote.page}</span>
                        </button>
                      ) : (
                        <span className={formatted === '—' ? 'text-muted-foreground' : 'text-foreground'}>
                          {formatted}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
