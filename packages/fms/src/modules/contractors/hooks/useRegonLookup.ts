'use client'

import { useState, useCallback } from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { RegonLookupResponse } from '../api/regon-lookup/route'

export interface RegonLookupParams {
  nip?: string
  regon?: string
}

export interface UseRegonLookupResult {
  lookup: (params: RegonLookupParams) => Promise<RegonLookupResponse>
  isLoading: boolean
  error: string | null
  data: RegonLookupResponse | null
  isAvailable: boolean
  reset: () => void
}

export function useRegonLookup(): UseRegonLookupResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<RegonLookupResponse | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)

  const lookup = useCallback(async (params: RegonLookupParams): Promise<RegonLookupResponse> => {
    setIsLoading(true)
    setError(null)

    try {
      const queryParams = new URLSearchParams()
      if (params.nip) queryParams.set('nip', params.nip)
      if (params.regon) queryParams.set('regon', params.regon)

      const response = await apiCall<RegonLookupResponse>(
        `/api/contractors/regon-lookup?${queryParams.toString()}`
      )

      if (!response.ok) {
        const result = response.result
        const errorMsg = result?.error ?? 'Lookup failed'
        setError(errorMsg)
        setIsAvailable(result?.available ?? false)
        return { available: result?.available ?? false, company: null, error: errorMsg }
      }

      const result = response.result
      if (!result) {
        setError('No response from server')
        return { available: false, company: null, error: 'No response from server' }
      }

      setData(result)
      setIsAvailable(result.available)

      if (result.error) {
        setError(result.error)
      }

      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      return { available: false, company: null, error: errorMsg }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setError(null)
    setData(null)
  }, [])

  return {
    lookup,
    isLoading,
    error,
    data,
    isAvailable,
    reset,
  }
}
