'use client'

import * as React from 'react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Input } from '@open-mercato/ui/primitives/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'

type Contractor = {
  id: string
  name: string
  shortName?: string | null
  isActive: boolean
}

type ContractorSelectorProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (contractorId: string) => void
  excludeIds?: string[]
}

export function ContractorSelector({
  open,
  onOpenChange,
  onSelect,
  excludeIds = [],
}: ContractorSelectorProps) {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['contractors-search', search],
    queryFn: async () => {
      const params = new URLSearchParams({
        pageSize: '50',
        isActive: 'true',
      })
      if (search) params.set('search', search)

      const response = await apiCall<{ items: Contractor[] }>(
        `/api/contractors/contractors?${params.toString()}`
      )
      if (!response.ok) throw new Error('Failed to load contractors')
      return response.result?.items ?? []
    },
    enabled: open,
  })

  const filteredContractors = data?.filter(
    (contractor) => !excludeIds.includes(contractor.id)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Contractor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contractors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : filteredContractors?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {excludeIds.length > 0 && data && data.length > 0
                  ? 'All contractors are already assigned'
                  : 'No contractors found'}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredContractors?.map((contractor) => (
                  <button
                    key={contractor.id}
                    type="button"
                    onClick={() => onSelect(contractor.id)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <div className="font-medium text-sm">{contractor.name}</div>
                    {contractor.shortName && (
                      <div className="text-xs text-muted-foreground">
                        {contractor.shortName}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
