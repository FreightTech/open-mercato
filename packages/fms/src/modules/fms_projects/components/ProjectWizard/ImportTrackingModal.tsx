'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  Ship,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Container,
} from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

// Supported carriers (hardcoded list from spec)
const CARRIERS = [
  { code: 'maersk', name: 'Maersk' },
  { code: 'msc', name: 'MSC' },
  { code: 'cma-cgm', name: 'CMA CGM' },
  { code: 'hapag-lloyd', name: 'Hapag-Lloyd' },
  { code: 'evergreen', name: 'Evergreen' },
  { code: 'cosco', name: 'COSCO' },
  { code: 'zim', name: 'ZIM' },
]

// Reference types with full descriptive names
// Values must be lowercase to match shipment-tracking module: 'bol' | 'booking' | 'container'
const REFERENCE_TYPES = [
  { value: 'bol', label: 'Bill of Lading' },
  { value: 'booking', label: 'Booking Number' },
  { value: 'container', label: 'Container Number' },
]

type ImportResult = {
  success: boolean
  trackingJobId?: string
  containersCreated?: number
  containersUpdated?: number
  shipmentsFound?: number
  containers?: Array<{
    id: string
    containerNumber: string | null
    action: 'created' | 'updated'
  }>
  error?: string
}

type ImportTrackingModalProps = {
  open: boolean
  onClose: () => void
  projectId: string
  onSuccess?: () => void
}

export function ImportTrackingModal({
  open,
  onClose,
  projectId,
  onSuccess,
}: ImportTrackingModalProps) {
  const [carrierCode, setCarrierCode] = useState<string>('')
  const [referenceType, setReferenceType] = useState<string>('')
  const [referenceValue, setReferenceValue] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const resetForm = useCallback(() => {
    setCarrierCode('')
    setReferenceType('')
    setReferenceValue('')
    setResult(null)
  }, [])

  const handleClose = useCallback(() => {
    if (!isLoading) {
      resetForm()
      onClose()
    }
  }, [isLoading, resetForm, onClose])

  const handleImport = async () => {
    if (!carrierCode || !referenceType || !referenceValue.trim()) {
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      const response = await apiCall<ImportResult>(`/api/fms_projects/projects/${projectId}/import-tracking`, {
        method: 'POST',
        body: JSON.stringify({
          carrierCode,
          referenceType,
          referenceValue: referenceValue.trim(),
        }),
      })

      const data = response.result

      if (response.ok && data?.success) {
        setResult({
          success: true,
          trackingJobId: data.trackingJobId,
          containersCreated: data.containersCreated,
          containersUpdated: data.containersUpdated,
          shipmentsFound: data.shipmentsFound,
          containers: data.containers,
        })

        // Notify parent of success after a brief delay to show the result
        if (onSuccess) {
          setTimeout(() => {
            onSuccess()
            handleClose()
          }, 1500)
        }
      } else {
        setResult({
          success: false,
          error: data?.error || 'Failed to import tracking data',
        })
      }
    } catch (error) {
      console.error('[ImportTrackingModal] Error:', error)
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = carrierCode && referenceType && referenceValue.trim() && !isLoading

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Import from Carrier Tracking
          </DialogTitle>
          <DialogDescription>
            Enter carrier details to import container tracking data. The system will discover all containers and sync their status.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Carrier Selection */}
          <div className="space-y-2">
            <Label htmlFor="carrier">Carrier</Label>
            <select
              id="carrier"
              value={carrierCode}
              onChange={(e) => setCarrierCode(e.target.value)}
              disabled={isLoading}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Select carrier</option>
              {CARRIERS.map((carrier) => (
                <option key={carrier.code} value={carrier.code}>
                  {carrier.name} ({carrier.code})
                </option>
              ))}
            </select>
          </div>

          {/* Reference Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="referenceType">Reference Type</Label>
            <select
              id="referenceType"
              value={referenceType}
              onChange={(e) => setReferenceType(e.target.value)}
              disabled={isLoading}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Select reference type</option>
              {REFERENCE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reference Value Input */}
          <div className="space-y-2">
            <Label htmlFor="referenceValue">Reference Number</Label>
            <Input
              id="referenceValue"
              value={referenceValue}
              onChange={(e) => setReferenceValue(e.target.value.toUpperCase())}
              placeholder={
                referenceType === 'CONTAINER'
                  ? 'e.g., MAEU1234567'
                  : referenceType === 'BL'
                    ? 'e.g., MAEU123456789'
                    : 'Enter reference number'
              }
              disabled={isLoading}
              className="font-mono"
            />
          </div>

          {/* Result Display */}
          {result && (
            <div
              className={cn(
                'rounded-lg border p-4',
                result.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              )}
            >
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  {result.success ? (
                    <>
                      <p className="text-sm font-medium text-green-800">
                        Successfully imported tracking data
                      </p>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-green-700">
                          {result.shipmentsFound} container(s) found
                        </p>
                        {(result.containersCreated ?? 0) > 0 && (
                          <p className="text-xs text-green-700">
                            {result.containersCreated} container(s) created
                          </p>
                        )}
                        {(result.containersUpdated ?? 0) > 0 && (
                          <p className="text-xs text-green-700">
                            {result.containersUpdated} container(s) updated
                          </p>
                        )}
                      </div>
                      {result.containers && result.containers.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium text-green-800">Containers:</p>
                          {result.containers.map((container) => (
                            <div
                              key={container.id}
                              className="flex items-center gap-2 text-xs text-green-700"
                            >
                              <Container className="h-3 w-3" />
                              <span className="font-mono">
                                {container.containerNumber || 'Unknown'}
                              </span>
                              <span className="text-green-600">({container.action})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-red-800">Import failed</p>
                      <p className="text-xs text-red-700 mt-1">{result.error}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            {result?.success ? 'Close' : 'Cancel'}
          </Button>
          {!result?.success && (
            <Button onClick={handleImport} disabled={!canSubmit}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Ship className="h-4 w-4 mr-2" />
                  Import Tracking
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
