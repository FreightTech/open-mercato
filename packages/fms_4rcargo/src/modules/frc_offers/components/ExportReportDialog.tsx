'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { FileDown, Calendar, Columns, Filter } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Label } from '@open-mercato/ui/primitives/label'
import { DatePicker } from '@open-mercato/ui/backend/inputs/DatePicker'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { FilterRow, SortRule } from '@open-mercato/ui/backend/dynamic-table'

interface ReportColumn {
  data: string
  title: string
  width?: number
}

interface ExportReportDialogProps {
  open: boolean
  onClose: () => void
  perspectiveName: string | null
  visibleColumns: ReportColumn[]
  currentFilters: FilterRow[]
  currentSorting: SortRule[]
}

function getDefaultDateFrom(): Date {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  date.setHours(0, 0, 0, 0)
  return date
}

function getDefaultDateTo(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function formatDateForApi(date: Date | null): string | undefined {
  if (!date) return undefined
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function ExportReportDialog({
  open,
  onClose,
  perspectiveName,
  visibleColumns,
  currentFilters,
  currentSorting,
}: ExportReportDialogProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [dateFrom, setDateFrom] = useState<Date | null>(getDefaultDateFrom)
  const [dateTo, setDateTo] = useState<Date | null>(getDefaultDateTo)
  const [useDateRange, setUseDateRange] = useState(true)

  // Reset dates when dialog opens
  React.useEffect(() => {
    if (open) {
      setDateFrom(getDefaultDateFrom())
      setDateTo(getDefaultDateTo())
      setUseDateRange(true)
    }
  }, [open])

  const handleExport = useCallback(async () => {
    // Validate date range
    if (useDateRange && dateFrom && dateTo && dateFrom > dateTo) {
      flash('Start date must be before end date', 'error')
      return
    }

    setIsExporting(true)

    try {
      const requestBody = {
        filters: currentFilters,
        sorting: currentSorting,
        columns: visibleColumns,
        dateFrom: useDateRange ? formatDateForApi(dateFrom) : undefined,
        dateTo: useDateRange ? formatDateForApi(dateTo) : undefined,
        perspectiveName: perspectiveName || 'All Offers',
      }

      // Use a custom parser for blob response
      const response = await apiCall<Blob>(
        '/api/frc_offers/offers/report/pdf',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        {
          parse: async (res) => {
            if (res.ok) {
              return res.blob()
            }
            return null
          },
        }
      )

      if (response.ok && response.result) {
        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.response.headers.get('Content-Disposition')
        let filename = `frc-offers-report-${new Date().toISOString().split('T')[0]}.pdf`
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/)
          if (match) {
            filename = match[1]
          }
        }

        // Create download link
        const url = window.URL.createObjectURL(response.result)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        flash('Report downloaded successfully', 'success')
        onClose()
      } else {
        // Try to parse error message from the response
        let errorMessage = 'Failed to generate report'
        try {
          const errorData = await response.response.json()
          errorMessage = errorData.error || errorData.message || errorMessage
        } catch {
          // Ignore JSON parse errors
        }
        flash(errorMessage, 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsExporting(false)
    }
  }, [
    useDateRange,
    dateFrom,
    dateTo,
    currentFilters,
    currentSorting,
    visibleColumns,
    perspectiveName,
    onClose,
  ])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isExporting) {
        e.preventDefault()
        handleExport()
      }
    },
    [handleExport, isExporting]
  )

  const activeFiltersCount = currentFilters.filter((f) => !f.field.startsWith('_')).length

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent style={{ width: '100%', maxWidth: 500 }} onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-blue-600" />
            Export Offers Report
          </DialogTitle>
          <DialogDescription>
            Generate a PDF report of offers based on the current view and date range.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Current View Summary */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="text-sm font-medium">Report Settings</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Perspective: </span>
                  <span className="font-medium">{perspectiveName || 'All Offers'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Columns className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Columns: </span>
                  <span className="font-medium">{visibleColumns.length}</span>
                </div>
              </div>
            </div>
            {activeFiltersCount > 0 && (
              <div className="text-xs text-muted-foreground">
                {activeFiltersCount} active filter{activeFiltersCount !== 1 ? 's' : ''} will be
                applied
              </div>
            )}
          </div>

          {/* Date Range Filter */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Date Range (Created Date)</Label>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDateRange}
                  onChange={(e) => setUseDateRange(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-muted-foreground">Filter by date</span>
              </label>
            </div>

            {useDateRange && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">
                    From
                  </Label>
                  <DatePicker
                    value={dateFrom}
                    onChange={setDateFrom}
                    showClearButton={false}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateTo" className="text-xs text-muted-foreground">
                    To
                  </Label>
                  <DatePicker
                    value={dateTo}
                    onChange={setDateTo}
                    showClearButton={false}
                  />
                </div>
              </div>
            )}

            {!useDateRange && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                All offers will be included regardless of creation date. Large datasets may take
                longer to generate.
              </div>
            )}
          </div>

          {/* Columns Preview */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Columns in report:</Label>
            <div className="flex flex-wrap gap-1">
              {visibleColumns.map((col) => (
                <span
                  key={col.data}
                  className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                >
                  {col.title}
                </span>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <span className="animate-spin mr-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </span>
                Generating...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
