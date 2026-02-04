'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'

type Project = {
  id: string
  projectNumber: string
  currentStep?: string | null
  shipmentType: string
  direction: string
  projectDate: string
  originAddress?: string | null
  destinationAddress?: string | null
  role: string
  createdAt: string
}

type ProjectsResponse = {
  items?: Project[]
  total?: number
  page?: number
  totalPages?: number
}

type ContractorProjectsSectionProps = {
  contractorId: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  booked: { label: 'Booked', color: 'bg-blue-100 text-blue-700' },
  in_transit: { label: 'In Transit', color: 'bg-yellow-100 text-yellow-700' },
  at_port: { label: 'At Port', color: 'bg-orange-100 text-orange-700' },
  customs: { label: 'Customs', color: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  client: { label: 'Client', color: 'bg-blue-100 text-blue-700' },
  shipper: { label: 'Shipper', color: 'bg-green-100 text-green-700' },
  consignee: { label: 'Consignee', color: 'bg-purple-100 text-purple-700' },
  carrier: { label: 'Carrier', color: 'bg-orange-100 text-orange-700' },
  notify_party: { label: 'Notify Party', color: 'bg-gray-100 text-gray-700' },
  controlling_agent: { label: 'Ctrl Agent', color: 'bg-yellow-100 text-yellow-700' },
  sending_agent: { label: 'Send Agent', color: 'bg-teal-100 text-teal-700' },
  receiving_agent: { label: 'Recv Agent', color: 'bg-cyan-100 text-cyan-700' },
  creditor: { label: 'Creditor', color: 'bg-pink-100 text-pink-700' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-700' },
}

const TYPE_CONFIG: Record<string, { label: string }> = {
  EXP: { label: 'Export' },
  IMP: { label: 'Import' },
  RAIL: { label: 'Rail' },
  FTL: { label: 'FTL' },
  LTL: { label: 'LTL' },
  DEPOT: { label: 'Depot' },
}

export function ContractorProjectsSection({ contractorId }: ContractorProjectsSectionProps) {
  const t = useT()
  const tableRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['contractor-projects', contractorId],
    queryFn: async () => {
      const response = await apiCall<ProjectsResponse>(
        `/api/contractors/projects?contractorId=${contractorId}&pageSize=10`
      )
      if (!response.ok) throw new Error('Failed to load projects')
      return response.result
    },
    enabled: !!contractorId,
  })

  const projects = data?.items ?? []

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }, [])

  const truncateAddress = useCallback((address: string | null | undefined, maxLength = 15) => {
    if (!address) return '-'
    if (address.length <= maxLength) return address
    return address.substring(0, maxLength) + '...'
  }, [])

  // Table columns definition
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'projectNumber',
      title: t('contractors.projects.number', 'Project #'),
      width: 120,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => (
        <Link
          href={`/backend/fms-projects/${row.id}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          {String(value)}
        </Link>
      ),
    },
    {
      data: 'currentStep',
      title: t('contractors.projects.status', 'Status'),
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => {
        const statusConfig = STATUS_CONFIG[String(value ?? 'draft')] ?? STATUS_CONFIG.draft
        return (
          <Badge variant="secondary" className={cn('text-xs', statusConfig.color)}>
            {statusConfig.label}
          </Badge>
        )
      },
    },
    {
      data: 'shipmentType',
      title: t('contractors.projects.type', 'Type'),
      width: 80,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => {
        const typeConfig = TYPE_CONFIG[String(value)] ?? { label: String(value) }
        return <span className="text-sm">{typeConfig.label}</span>
      },
    },
    {
      data: 'role',
      title: t('contractors.projects.role', 'Role'),
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => {
        const roleConfig = ROLE_CONFIG[String(value)] ?? ROLE_CONFIG.other
        return (
          <Badge variant="outline" className={cn('text-xs', roleConfig.color)}>
            {roleConfig.label}
          </Badge>
        )
      },
    },
    {
      data: 'route',
      title: t('contractors.projects.route', 'Route'),
      width: 200,
      type: 'text',
      readOnly: true,
      renderer: (_value: unknown, row: Record<string, unknown>) => (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span title={row.originAddress as string | undefined}>
            {truncateAddress(row.originAddress as string | null | undefined)}
          </span>
          <ArrowRight className="h-3 w-3 flex-shrink-0" />
          <span title={row.destinationAddress as string | undefined}>
            {truncateAddress(row.destinationAddress as string | null | undefined)}
          </span>
        </div>
      ),
    },
    {
      data: 'projectDate',
      title: t('contractors.projects.date', 'Date'),
      width: 80,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => (
        <span className="text-sm text-muted-foreground">
          {value ? formatDate(String(value)) : '-'}
        </span>
      ),
    },
  ], [t, formatDate, truncateAddress])

  // Table data
  const tableData = useMemo(() => {
    return projects.map(project => ({
      id: project.id,
      projectNumber: project.projectNumber,
      currentStep: project.currentStep ?? 'draft',
      shipmentType: project.shipmentType,
      role: project.role,
      originAddress: project.originAddress,
      destinationAddress: project.destinationAddress,
      projectDate: project.projectDate,
    }))
  }, [projects])

  // Generate key to force re-render when data changes
  const tableKey = useMemo(() => {
    if (projects.length === 0) return 'empty'
    return `projects-${projects.map(p => p.id).join('-')}`
  }, [projects])

  // Calculate dynamic height based on number of rows
  const tableHeight = useMemo(() => {
    const rowHeight = 40
    const headerHeight = 40
    const toolbarHeight = 40
    const minHeight = 160
    const maxHeight = 400
    const contentHeight = toolbarHeight + headerHeight + (tableData.length * rowHeight) + 20
    return Math.min(Math.max(contentHeight, minHeight), maxHeight)
  }, [tableData.length])

  if (isLoading) {
    return (
      <div style={{ height: 160 }}>
        <DynamicTable
          tableRef={tableRef}
          data={[]}
          columns={columns}
          tableName={t('contractors.projects.title', 'Projects')}
          idColumnName="id"
          width="100%"
          height="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          uiConfig={{
            hideToolbar: false,
            hideSearch: true,
            hideFilterButton: true,
            hideAddRowButton: true,
            hideBottomBar: true,
            hideActionsColumn: true,
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        key={tableKey}
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName={t('contractors.projects.title', 'Projects')}
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideToolbar: false,
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          hideActionsColumn: true,
        }}
      />
    </div>
  )
}
