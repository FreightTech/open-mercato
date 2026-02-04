'use client'

import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'

interface PageThumbnailsProps {
  invoiceId: string
  totalPages: number
  selectedPage: number
  onSelectPage: (pageNumber: number) => void
  className?: string
}

export function PageThumbnails({
  invoiceId,
  totalPages,
  selectedPage,
  onSelectPage,
  className,
}: PageThumbnailsProps) {
  if (totalPages <= 1) return null

  return (
    <div className={cn('border-t bg-muted/30 p-2', className)}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            onClick={() => onSelectPage(pageNum)}
            className={cn(
              'flex-shrink-0 w-12 h-16 rounded border-2 overflow-hidden bg-white transition-all',
              'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
              selectedPage === pageNum
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-muted'
            )}
            title={`Page ${pageNum}`}
          >
            <img
              src={`/api/fms_financials/invoices/${invoiceId}/pages/${pageNum}/image`}
              alt={`Page ${pageNum} thumbnail`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
