'use client'

import * as React from 'react'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { FileText, ExternalLink, Link2 } from 'lucide-react'

interface LineItem {
  description: string | null
  quantity: string | number | null
  unit: string | null
  unitPriceNet: string | number | null
  netAmount: string | number | null
  vatAmount: string | number | null
  grossAmount: string | number | null
  currency: string | null
}

interface DocumentMatch {
  documentId: string
  documentName: string
  documentType: string | null
  category: string
  currency: string | null
  sellerName: string | null
  totalGrossAmount: string | null
  matchedBy: string[]
  lineItems: LineItem[]
}

interface MatchedDocumentsResponse {
  matches: DocumentMatch[]
}

type FileDocumentCostsSectionProps = {
  fileId: string
}

const documentTypeLabels: Record<string, string> = {
  invoice: 'Invoice',
  bill_of_lading: 'Bill of Lading',
  customs_declaration: 'Customs Declaration',
  delivery_note: 'Delivery Note',
  booking_confirmation: 'Booking Confirmation',
  packing_list: 'Packing List',
  vgm_certificate: 'VGM Certificate',
}

function formatAmount(val: unknown): string {
  if (val === null || val === undefined || val === '') return '-'
  const num = typeof val === 'string' ? parseFloat(val) : Number(val)
  if (isNaN(num)) return '-'
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function matchedByLabel(match: string): string {
  if (match === 'blNumber') return 'BL Number'
  if (match === 'mblNumber') return 'MBL Number'
  if (match === 'bookingNumber') return 'Booking Number'
  if (match === 'directLink') return 'Direct Link'
  if (match.startsWith('containerNumber:')) return `Container: ${match.split(':')[1]}`
  return match
}

const lineItemColumns: ColumnDef[] = [
  { data: 'description', title: 'Description', readOnly: true },
  { data: 'quantity', title: 'Qty', width: 70, readOnly: true, renderer: (val: unknown) => String(val ?? '-') },
  { data: 'unit', title: 'Unit', width: 70, readOnly: true, renderer: (val: unknown) => String(val || '-') },
  { data: 'unitPriceNet', title: 'Unit Price', width: 100, readOnly: true, renderer: formatAmount },
  { data: 'netAmount', title: 'Net', width: 100, readOnly: true, renderer: formatAmount },
  { data: 'vatAmount', title: 'VAT', width: 100, readOnly: true, renderer: formatAmount },
  { data: 'grossAmount', title: 'Gross', width: 100, readOnly: true, renderer: formatAmount },
  { data: 'currency', title: 'Ccy', width: 60, readOnly: true, renderer: (val: unknown) => String(val || '-') },
]

function DocumentCardTable({ doc }: { doc: DocumentMatch }) {
  const tableRef = React.useRef<HTMLDivElement>(null)

  const tableData = useMemo(() =>
    doc.lineItems.map((item, idx) => ({
      id: `line-${idx}`,
      description: item.description || '-',
      quantity: item.quantity ?? '-',
      unit: item.unit || '',
      unitPriceNet: item.unitPriceNet,
      netAmount: item.netAmount,
      vatAmount: item.vatAmount,
      grossAmount: item.grossAmount,
      currency: item.currency || doc.currency || '',
    })),
    [doc.lineItems, doc.currency]
  )

  const typeLabel = doc.documentType
    ? documentTypeLabels[doc.documentType] || doc.documentType.replace(/_/g, ' ')
    : null

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{doc.documentName}</span>
        {typeLabel && (
          <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
        )}
        {doc.sellerName && (
          <span className="text-xs text-muted-foreground truncate max-w-[150px]">{doc.sellerName}</span>
        )}
        {doc.totalGrossAmount && (
          <span className="text-sm font-semibold tabular-nums">
            {formatAmount(doc.totalGrossAmount)} {doc.currency || ''}
          </span>
        )}
        {/* matchedBy pills */}
        <div className="flex items-center gap-1">
          {doc.matchedBy.map((match) => (
            <Badge key={match} variant="secondary" className="text-xs">
              {matchedByLabel(match)}
            </Badge>
          ))}
        </div>
        <a
          href={`/backend/fms-documents?doc=${doc.documentId}`}
          className="text-muted-foreground hover:text-foreground"
          title="Open document"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* DynamicTable for line items */}
      {tableData.length > 0 && (
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={lineItemColumns}
          tableName=""
          idColumnName="id"
          width="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          uiConfig={{
            hideToolbar: true,
            hideSearch: true,
            hideAddRowButton: true,
            hideActionsColumn: true,
            hideBottomBar: true,
            hideFilterButton: true,
            readOnlyStyle: 'normal',
          }}
        />
      )}
    </div>
  )
}

export function FileDocumentCostsSection({ fileId }: FileDocumentCostsSectionProps) {
  const { data } = useQuery({
    queryKey: ['file-matched-documents', fileId],
    queryFn: async (): Promise<MatchedDocumentsResponse | null> => {
      const response = await apiCall<MatchedDocumentsResponse>(
        `/api/fms_files/files/${fileId}/matched-documents`
      )
      return response.ok ? (response.result as MatchedDocumentsResponse) : null
    },
    enabled: !!fileId,
  })

  if (!data?.matches?.length) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link2 className="h-4 w-4" />
          <span className="font-medium">Linked Documents</span>
          <Badge variant="secondary" className="text-xs">{data.matches.length}</Badge>
        </div>
        <div className="flex-1 border-t" />
      </div>
      {data.matches.map((doc) => (
        <DocumentCardTable key={doc.documentId} doc={doc} />
      ))}
    </div>
  )
}

export default FileDocumentCostsSection
