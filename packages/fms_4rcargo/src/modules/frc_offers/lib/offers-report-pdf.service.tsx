import React from 'react'
import ReactPDF, { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

// Colors
const ACCENT = '#1e3a5f'
const ACCENT_LIGHT = '#eef2f7'
const BORDER = '#dce3ed'
const TEXT_PRIMARY = '#1f2937'
const TEXT_SECONDARY = '#6b7280'
const ROW_ALT = '#f9fafb'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: TEXT_PRIMARY,
  },
  // Header
  header: {
    marginBottom: 20,
  },
  companyName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: ACCENT,
    marginBottom: 4,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  reportMeta: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 4,
  },
  metaItem: {
    flexDirection: 'row',
  },
  metaLabel: {
    fontSize: 8,
    color: TEXT_SECONDARY,
    marginRight: 4,
  },
  metaValue: {
    fontSize: 8,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
  },
  divider: {
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    marginVertical: 12,
  },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 7,
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: ACCENT,
  },
  // Table
  table: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: ACCENT,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeaderText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: 'white',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 24,
  },
  tableRowAlt: {
    backgroundColor: ROW_ALT,
  },
  tableCell: {
    fontSize: 8,
    color: TEXT_PRIMARY,
  },
  tableCellBold: {
    fontSize: 8,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
  },
  // Status badges
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 7,
    fontWeight: 'bold',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: TEXT_SECONDARY,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  // No data message
  noData: {
    textAlign: 'center',
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 40,
  },
  // Truncation note
  truncationNote: {
    fontSize: 8,
    color: TEXT_SECONDARY,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
})

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#f3f4f6', text: '#374151' },
  sent: { bg: '#dbeafe', text: '#1e40af' },
  booked: { bg: '#d1fae5', text: '#065f46' },
  rejected: { bg: '#fee2e2', text: '#991b1b' },
  expired: { bg: '#fef3c7', text: '#92400e' },
}

export interface ReportColumn {
  data: string
  title: string
  width?: number
}

export interface ReportOptions {
  columns: ReportColumn[]
  perspectiveName?: string
  dateFrom?: string
  dateTo?: string
  totalCount?: number
}

export interface OfferReportRow {
  id: string
  name: string
  rfqName?: string | null
  status: string
  currencyCode: string
  totalAmount?: number | string | null
  departureDate?: string | null
  validUntil?: string | null
  notes?: string | null
  createdAt: string
  updatedAt?: string
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d)
  } catch {
    return '-'
  }
}

function formatCurrency(value: number | string | null | undefined, currency: string): string {
  if (value === null || value === undefined) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatStatus(status: string): string {
  if (!status) return '-'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getColumnWidth(col: ReportColumn, totalColumns: number): string {
  if (col.width) {
    return `${Math.min(col.width / 8, 25)}%`
  }
  return `${Math.floor(100 / totalColumns)}%`
}

function getCellValue(row: OfferReportRow, columnData: string): string {
  switch (columnData) {
    case 'rfqName':
      return row.rfqName || '-'
    case 'name':
      return row.name || '-'
    case 'status':
      return formatStatus(row.status)
    case 'currencyCode':
      return row.currencyCode || '-'
    case 'totalAmount':
      return formatCurrency(row.totalAmount, row.currencyCode)
    case 'departureDate':
      return formatDate(row.departureDate)
    case 'validUntil':
      return formatDate(row.validUntil)
    case 'notes':
      return row.notes ? (row.notes.length > 50 ? row.notes.substring(0, 47) + '...' : row.notes) : '-'
    case 'createdAt':
      return formatDate(row.createdAt)
    case 'updatedAt':
      return formatDate(row.updatedAt)
    default:
      return (row as unknown as Record<string, unknown>)[columnData]?.toString() || '-'
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || { bg: '#f3f4f6', text: '#374151' }
  return (
    <Text
      style={[
        styles.statusBadge,
        { backgroundColor: colors.bg, color: colors.text },
      ]}
    >
      {formatStatus(status)}
    </Text>
  )
}

function ReportHeader({
  tenantName,
  options,
  totalOffers,
}: {
  tenantName: string
  options: ReportOptions
  totalOffers: number
}) {
  const dateRangeText =
    options.dateFrom && options.dateTo
      ? `${formatDate(options.dateFrom)} - ${formatDate(options.dateTo)}`
      : options.dateFrom
        ? `From ${formatDate(options.dateFrom)}`
        : options.dateTo
          ? `Until ${formatDate(options.dateTo)}`
          : 'All time'

  return (
    <View style={styles.header}>
      <Text style={styles.companyName}>{tenantName}</Text>
      <Text style={styles.reportTitle}>Offers Report</Text>
      <View style={styles.reportMeta}>
        {options.perspectiveName && (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Perspective:</Text>
            <Text style={styles.metaValue}>{options.perspectiveName}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Date Range:</Text>
          <Text style={styles.metaValue}>{dateRangeText}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Total Offers:</Text>
          <Text style={styles.metaValue}>{totalOffers}</Text>
        </View>
      </View>
      <View style={styles.divider} />
    </View>
  )
}

function SummarySection({ offers }: { offers: OfferReportRow[] }) {
  const statusCounts = offers.reduce(
    (acc, offer) => {
      acc[offer.status] = (acc[offer.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Total</Text>
        <Text style={styles.summaryValue}>{offers.length}</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Draft</Text>
        <Text style={styles.summaryValue}>{statusCounts.draft || 0}</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Sent</Text>
        <Text style={styles.summaryValue}>{statusCounts.sent || 0}</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Booked</Text>
        <Text style={styles.summaryValue}>{statusCounts.booked || 0}</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Rejected</Text>
        <Text style={styles.summaryValue}>{statusCounts.rejected || 0}</Text>
      </View>
    </View>
  )
}

function TableHeader({ columns }: { columns: ReportColumn[] }) {
  return (
    <View style={styles.tableHeader}>
      {columns.map((col) => (
        <View key={col.data} style={{ width: getColumnWidth(col, columns.length) }}>
          <Text style={styles.tableHeaderText}>{col.title}</Text>
        </View>
      ))}
    </View>
  )
}

function TableRow({
  row,
  columns,
  index,
}: {
  row: OfferReportRow
  columns: ReportColumn[]
  index: number
}) {
  const isAlt = index % 2 === 1
  const rowStyles = isAlt ? [styles.tableRow, styles.tableRowAlt] : [styles.tableRow]

  return (
    <View style={rowStyles} wrap={false}>
      {columns.map((col) => (
        <View key={col.data} style={{ width: getColumnWidth(col, columns.length) }}>
          {col.data === 'status' ? (
            <StatusBadge status={row.status} />
          ) : (
            <Text style={col.data === 'name' ? styles.tableCellBold : styles.tableCell}>
              {getCellValue(row, col.data)}
            </Text>
          )}
        </View>
      ))}
    </View>
  )
}

function OffersReportDocument({
  offers,
  options,
  tenantName,
}: {
  offers: OfferReportRow[]
  options: ReportOptions
  tenantName: string
}) {
  const isTruncated = options.totalCount && options.totalCount > offers.length
  const generatedDate = formatDate(new Date())

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <ReportHeader
          tenantName={tenantName}
          options={options}
          totalOffers={options.totalCount || offers.length}
        />

        <SummarySection offers={offers} />

        {offers.length === 0 ? (
          <Text style={styles.noData}>No offers found matching the selected criteria.</Text>
        ) : (
          <View style={styles.table}>
            <TableHeader columns={options.columns} />
            {offers.map((offer, index) => (
              <TableRow key={offer.id} row={offer} columns={options.columns} index={index} />
            ))}
          </View>
        )}

        {isTruncated && (
          <Text style={styles.truncationNote}>
            Showing {offers.length} of {options.totalCount} offers. Export with a narrower date
            range to see all results.
          </Text>
        )}

        <View style={styles.footer} fixed>
          <Text>Generated: {generatedDate}</Text>
          <Text>{tenantName} - Offers Report</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function generateOffersReportPdf(
  offers: OfferReportRow[],
  options: ReportOptions,
  tenantName: string
): Promise<Buffer> {
  const pdfStream = await ReactPDF.renderToStream(
    <OffersReportDocument offers={offers} options={options} tenantName={tenantName} />
  )

  const chunks: Buffer[] = []
  for await (const chunk of pdfStream) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}
