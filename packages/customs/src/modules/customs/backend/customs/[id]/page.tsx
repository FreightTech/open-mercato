"use client"
import * as React from 'react'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import ParsedDataView from '../../../components/ParsedDataView'
import ConsistencyReport from '../../../components/ConsistencyReport'
import HsClassificationPanel from '../../../components/HsClassificationPanel'
import DocumentUploadForm from '../../../components/DocumentUploadForm'
import ProductLinesSummary from '../../../components/ProductLinesSummary'
import PdfProofViewer from '../../../components/PdfProofViewer'

interface ParsedDocumentData {
  id: string
  documentType: 'bill_of_lading' | 'commercial_invoice' | 'packing_list'
  fileName: string
  extracted: Record<string, unknown> | null
  parseError: string | null
  createdAt: string
}

interface ConsistencyCheckData {
  id: string
  field: string
  label: string
  sourceDoc1: string
  sourceDoc2: string
  value1: unknown
  value2: unknown
  status: 'ok' | 'mismatch' | 'missing' | 'warning'
  discrepancy: string | null
}

interface HsSuggestionData {
  hsCode: string
  description: string
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
}

interface Isztar4ResultData {
  code: string
  description: string
  dutyAmount?: string
  supplementaryUnit?: string
  nonTariffMeasures?: string[]
  valid: boolean
}

interface TariffTreeNodeData {
  code?: string
  description: string
  children?: TariffTreeNodeData[]
}

interface TariffTreePathData {
  chapterCode: string
  chapterDescription: string
  headingCode: string
  headingDescription: string
  leafCode: string
  leafDescription: string
  reasoning: string
  alternativeHeadings?: { code: string; description: string; note: string }[]
}

interface HsClassificationData {
  id: string
  lineNumber: number
  productDescription: string
  aiSuggestions: HsSuggestionData[]
  isztar4Results: Isztar4ResultData[]
  tariffTree?: TariffTreeNodeData | null
  aiPath?: TariffTreePathData | null
  selectedHsCode: string | null
  selectedDescription: string | null
  selectedDutyRate: string | null
  selectedAt: string | null
}

interface ProductLineData {
  lineNumber: number
  description: string
  model?: string
  vinOrSerial?: string
  engineNumber?: string
  countryOfOrigin?: string
  quantity: number
  unit: string
  unitPrice?: number
  totalValue?: number
  currency?: string
  netWeightKg?: number
  grossWeightKg?: number
  hsCodeFromInvoice?: string
  incoterms?: string
}

interface ShipmentDetail {
  shipment: {
    id: string
    status: string
    blNumber: string | null
    invoiceNumber: string | null
    shipperName: string | null
    consigneeName: string | null
    loadingPort: string | null
    dischargePort: string | null
    vessel: string | null
    shippedOnBoard: string | null
    productLines: ProductLineData[]
    createdAt: string
    updatedAt: string
  }
  documents: ParsedDocumentData[]
  consistencyChecks: ConsistencyCheckData[]
  hsClassifications: HsClassificationData[]
}

const statusColors: Record<string, string> = {
  uploading: 'bg-muted text-muted-foreground',
  parsing: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  ready: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-destructive',
}

export default function CustomsDetailPage({ params }: { params: { id: string } }) {
  const shipmentId = params.id
  const [data, setData] = React.useState<ShipmentDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [activeTab, setActiveTab] = React.useState<'documents' | 'products' | 'parsed' | 'consistency' | 'hs'>('products')
  const [proofDocId, setProofDocId] = React.useState<string | null>(null)
  const [highlightQuote, setHighlightQuote] = React.useState<string | null>(null)
  const [highlightPage, setHighlightPage] = React.useState<number | null>(null)
  const [highlightFieldValue, setHighlightFieldValue] = React.useState<string | null>(null)
  const [showPdfPreview, setShowPdfPreview] = React.useState(false)

  const loadData = React.useCallback(async () => {
    if (!shipmentId) return
    setLoading(true)
    try {
      const { ok, result } = await apiCall<ShipmentDetail>(`/api/customs/customs/shipments/${shipmentId}`)
      if (ok && result) setData(result)
    } catch {
      // handled by apiCall
    } finally {
      setLoading(false)
    }
  }, [shipmentId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // Poll for status changes while parsing
  React.useEffect(() => {
    if (data?.shipment.status === 'parsing' || data?.shipment.status === 'uploading') {
      const interval = setInterval(loadData, 3000)
      return () => clearInterval(interval)
    }
  }, [data?.shipment.status, loadData])

  const handleExport = (format?: string) => {
    const url = `/api/customs/customs/shipments/${shipmentId}/export${format ? `?format=${format}` : ''}`
    window.open(url, '_blank')
  }

  const handleVerify = (docId: string, quote: string, page: number, fieldValue?: string) => {
    setShowPdfPreview(true)
    setProofDocId(docId)
    setHighlightQuote(quote)
    setHighlightPage(page)
    setHighlightFieldValue(fieldValue ?? null)
  }

  // Auto-select first document for proof viewer when enabling preview
  React.useEffect(() => {
    if (activeTab === 'parsed' && showPdfPreview && !proofDocId && data?.documents.length) {
      setProofDocId(data.documents[0].id)
    }
  }, [activeTab, showPdfPreview, proofDocId, data?.documents])

  if (loading && !data) {
    return (
      <Page>
        <PageBody>
          <p className="text-sm text-muted-foreground">Loading case...</p>
        </PageBody>
      </Page>
    )
  }

  if (!data) {
    return (
      <Page>
        <PageBody>
          <p className="text-sm text-destructive">Case not found</p>
        </PageBody>
      </Page>
    )
  }

  const { shipment, documents, consistencyChecks, hsClassifications } = data
  const routeLabel = `${shipment.loadingPort ?? '?'} \u2192 ${shipment.dischargePort ?? '?'}`
  const titleLabel = shipment.blNumber ?? shipment.invoiceNumber ?? shipment.id.slice(0, 8)

  const tabs = [
    { key: 'documents' as const, label: 'Documents' },
    { key: 'products' as const, label: `Products (${shipment.productLines.length})` },
    { key: 'parsed' as const, label: 'Parsed Data' },
    { key: 'consistency' as const, label: `Consistency (${consistencyChecks.filter((c) => c.status === 'mismatch').length} issues)` },
    { key: 'hs' as const, label: 'HS Classification' },
  ]

  return (
    <Page>
      <PageHeader
        title={`Case: ${titleLabel}`}
        description={`${shipment.shipperName ?? '\u2014'} \u2192 ${shipment.consigneeName ?? '\u2014'} | ${routeLabel}`}
      />
      <PageBody>
        {/* Status bar */}
        <div className="flex items-center gap-3 mb-4">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[shipment.status] ?? 'bg-muted'}`}>
            {shipment.status}
          </span>
          {shipment.vessel && <span className="text-sm text-muted-foreground">Vessel: {shipment.vessel}</span>}
          <span className="text-sm text-muted-foreground">Created: {new Date(shipment.createdAt).toLocaleString()}</span>
          <div className="flex-1" />
          <button
            onClick={() => handleExport('winsad')}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Export SAD CSV
          </button>
          <button
            onClick={() => handleExport()}
            className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted text-foreground"
          >
            Export JSON
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-border mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'documents' && (
          <DocumentUploadForm
            documents={documents}
            shipmentId={shipmentId}
            onReparse={loadData}
          />
        )}

        {activeTab === 'products' && (
          <ProductLinesSummary productLines={shipment.productLines} />
        )}

        {activeTab === 'parsed' && (
          <div>
            <div className="flex items-center justify-end mb-3">
              <button
                onClick={() => setShowPdfPreview((v) => !v)}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  showPdfPreview
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {showPdfPreview ? 'Hide PDF Preview' : 'Show PDF Preview'}
              </button>
            </div>
            <div className={showPdfPreview ? 'flex gap-4' : ''} style={showPdfPreview ? { minHeight: '600px' } : undefined}>
              <div className={showPdfPreview ? 'flex-1 min-w-0 overflow-auto' : ''}>
                <ParsedDataView
                  documents={documents}
                  onVerify={handleVerify}
                />
              </div>
              {showPdfPreview && documents.length > 0 && (
                <div className="w-[45%] shrink-0">
                  <PdfProofViewer
                    shipmentId={shipmentId}
                    documents={documents.map((d) => ({ id: d.id, documentType: d.documentType, fileName: d.fileName }))}
                    activeDocId={proofDocId}
                    onDocChange={(docId) => {
                      setProofDocId(docId)
                      setHighlightQuote(null)
                      setHighlightPage(null)
                      setHighlightFieldValue(null)
                    }}
                    highlightQuote={highlightQuote}
                    highlightPage={highlightPage}
                    highlightValue={highlightFieldValue}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'consistency' && (
          <ConsistencyReport checks={consistencyChecks} documents={documents} shipmentId={shipmentId} />
        )}

        {activeTab === 'hs' && (
          <HsClassificationPanel
            classifications={hsClassifications}
            shipmentId={shipmentId}
            productLines={shipment.productLines}
            onRefresh={loadData}
          />
        )}
      </PageBody>
    </Page>
  )
}
