import React from 'react'
import ReactPDF, { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../data/entities'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
  },
  companyName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a365d',
    marginBottom: 5,
  },
  documentTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  infoBlock: {
    width: '48%',
  },
  infoLabel: {
    fontSize: 8,
    color: '#718096',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  infoLabelSpaced: {
    fontSize: 8,
    color: '#718096',
    textTransform: 'uppercase',
    marginBottom: 3,
    marginTop: 10,
  },
  infoValue: {
    fontSize: 10,
    color: '#2d3748',
    marginBottom: 8,
  },
  table: {
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#edf2f7',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e0',
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  tableCell: {
    fontSize: 9,
  },
  colLineNum: { width: '5%' },
  colCode: { width: '10%' },
  colDescription: { width: '35%' },
  colType: { width: '10%' },
  colQty: { width: '8%', textAlign: 'right' },
  colUnitPrice: { width: '15%', textAlign: 'right' },
  colAmount: { width: '17%', textAlign: 'right' },
  headerText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#4a5568',
    textTransform: 'uppercase',
  },
  totalsSection: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 5,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    marginRight: 20,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a365d',
    width: 100,
    textAlign: 'right',
  },
  termsSection: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  termsTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 8,
  },
  termsText: {
    fontSize: 9,
    color: '#718096',
    lineHeight: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#a0aec0',
  },
  validBadge: {
    backgroundColor: '#c6f6d5',
    color: '#276749',
    padding: '4 8',
    borderRadius: 4,
    fontSize: 9,
    alignSelf: 'flex-start',
  },
  expiredBadge: {
    backgroundColor: '#fed7d7',
    color: '#c53030',
    padding: '4 8',
    borderRadius: 4,
    fontSize: 9,
    alignSelf: 'flex-start',
  },
  termBlock: {
    marginBottom: 15,
  },
})

function formatCurrency(value: number | string, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function OfferPdfDocument({ offer, companyName = 'Open Mercato' }: { offer: FmsOffer; companyName?: string }) {
  const lines = offer.lines?.getItems() || []
  const total = lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0)
  const isExpired = offer.validUntil && new Date(offer.validUntil) < new Date()
  const quote = offer.quote

  const originPorts = quote?.originPorts?.getItems?.()?.map((p: any) => p.locode || p.name).join(', ') || '-'
  const destPorts = quote?.destinationPorts?.getItems?.()?.map((p: any) => p.locode || p.name).join(', ') || '-'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>{companyName}</Text>
          <Text style={styles.documentTitle}>Freight Offer {offer.offerNumber}</Text>
        </View>

        {/* Info row */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>OFFER DETAILS</Text>
            <Text style={styles.infoValue}>Offer Number: {offer.offerNumber}</Text>
            <Text style={styles.infoValue}>Version: {offer.version}</Text>
            <Text style={styles.infoValue}>Status: {offer.status.toUpperCase()}</Text>
            <Text style={styles.infoValue}>Date: {formatDate(offer.createdAt)}</Text>
            {offer.validUntil && (
              <View style={isExpired ? styles.expiredBadge : styles.validBadge}>
                <Text>Valid Until: {formatDate(offer.validUntil)}{isExpired ? ' (EXPIRED)' : ''}</Text>
              </View>
            )}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>CLIENT INFORMATION</Text>
            {quote?.client ? (
              <View>
                <Text style={styles.infoValue}>{quote.client.name || '-'}</Text>
                {quote.client.taxId && <Text style={styles.infoValue}>Tax ID: {quote.client.taxId}</Text>}
              </View>
            ) : (
              <Text style={styles.infoValue}>-</Text>
            )}
            <Text style={styles.infoLabelSpaced}>ROUTE</Text>
            <Text style={styles.infoValue}>{originPorts} → {destPorts}</Text>
          </View>
        </View>

        {/* Lines table */}
        <View style={styles.table}>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.colLineNum]}>#</Text>
            <Text style={[styles.headerText, styles.colCode]}>CODE</Text>
            <Text style={[styles.headerText, styles.colDescription]}>DESCRIPTION</Text>
            <Text style={[styles.headerText, styles.colType]}>TYPE</Text>
            <Text style={[styles.headerText, styles.colQty]}>QTY</Text>
            <Text style={[styles.headerText, styles.colUnitPrice]}>UNIT PRICE</Text>
            <Text style={[styles.headerText, styles.colAmount]}>AMOUNT</Text>
          </View>
          {/* Table rows */}
          {lines.map((line, index) => (
            <View key={line.id} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colLineNum]}>{String(index + 1)}</Text>
              <Text style={[styles.tableCell, styles.colCode]}>{line.chargeCode || '-'}</Text>
              <Text style={[styles.tableCell, styles.colDescription]}>{line.productName || '-'}</Text>
              <Text style={[styles.tableCell, styles.colType]}>{line.containerSize || '-'}</Text>
              <Text style={[styles.tableCell, styles.colQty]}>1</Text>
              <Text style={[styles.tableCell, styles.colUnitPrice]}>
                {formatCurrency(line.unitPrice, line.currencyCode || offer.quote?.currencyCode)}
              </Text>
              <Text style={[styles.tableCell, styles.colAmount]}>
                {formatCurrency(line.amount, line.currencyCode || offer.quote?.currencyCode)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>{formatCurrency(total, offer.quote?.currencyCode)}</Text>
          </View>
        </View>

        {/* Terms section */}
        {(offer.paymentTerms || offer.specialTerms || offer.customerNotes) && (
          <View style={styles.termsSection}>
            {offer.paymentTerms && (
              <View style={styles.termBlock}>
                <Text style={styles.termsTitle}>Payment Terms</Text>
                <Text style={styles.termsText}>{offer.paymentTerms}</Text>
              </View>
            )}
            {offer.specialTerms && (
              <View style={styles.termBlock}>
                <Text style={styles.termsTitle}>Special Terms</Text>
                <Text style={styles.termsText}>{offer.specialTerms}</Text>
              </View>
            )}
            {offer.customerNotes && (
              <View style={styles.termBlock}>
                <Text style={styles.termsTitle}>Notes</Text>
                <Text style={styles.termsText}>{offer.customerNotes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            Generated on {formatDate(new Date())} | {companyName} | This is a computer-generated document
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export async function generateOfferPdf(offerId: string, em: EntityManager): Promise<Buffer> {
  const offer = await em.findOne(
    FmsOffer,
    { id: offerId, deletedAt: null },
    {
      populate: ['quote', 'quote.client', 'quote.originPorts', 'quote.destinationPorts', 'lines'],
    }
  )

  if (!offer) {
    throw new Error('Offer not found')
  }

  const pdfStream = await ReactPDF.renderToStream(
    <OfferPdfDocument offer={offer} companyName="Open Mercato" />
  )

  // Convert stream to buffer
  const chunks: Buffer[] = []
  for await (const chunk of pdfStream) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

export async function getOfferForPdf(offerId: string, em: EntityManager): Promise<FmsOffer | null> {
  return em.findOne(
    FmsOffer,
    { id: offerId, deletedAt: null },
    {
      populate: ['quote', 'quote.client', 'quote.originPorts', 'quote.destinationPorts', 'lines'],
    }
  )
}
