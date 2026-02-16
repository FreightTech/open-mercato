'use client'

import * as React from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type LinkedOffer = {
  id: string
  name: string
  status: string
}

export type LinkedOffersTableProps = {
  offers: LinkedOffer[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  booked: { label: 'Booked', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', color: 'bg-amber-100 text-amber-700' },
}

export function LinkedOffersTable({ offers }: LinkedOffersTableProps) {
  const t = useT()

  if (offers.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_rfqs.detail.offers.empty', 'No offers yet')}
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>{t('frc_rfqs.detail.offers.name', 'Offer Name')}</TableHead>
            <TableHead>{t('frc_rfqs.detail.offers.status', 'Status')}</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {offers.map((offer) => {
            const statusConfig = STATUS_CONFIG[offer.status] ?? { label: offer.status, color: 'bg-gray-100 text-gray-700' }
            return (
              <TableRow key={offer.id}>
                <TableCell className="font-medium">{offer.name}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig.color}`}>
                    {t(`frc_offers.status.${offer.status}`, statusConfig.label)}
                  </span>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/backend/frc-offers/${offer.id}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {t('frc_rfqs.detail.offers.view', 'View')}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
