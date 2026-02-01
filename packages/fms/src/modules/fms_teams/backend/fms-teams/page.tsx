'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  FilterRow,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { UserContractorsDrawer } from '../../components/UserContractorsDrawer'
import { TeamDetailsDrawer } from '../../components/TeamDetailsDrawer'

type TeamMember = {
  id: string | null
  teamId: string | null
  teamName: string | null
  userId: string
  userName: string
  userEmail: string
}

type MembersResponse = {
  items?: TeamMember[]
  total?: number
  page?: number
  totalPages?: number
}

// Global ref for click handler
let onUserClickHandler: ((userId: string, userName: string, userEmail: string, teamId: string | null, teamName: string | null) => void) | null = null

function setUserClickHandler(handler: typeof onUserClickHandler) {
  onUserClickHandler = handler
}

// User name renderer with clickable link
const UserNameRenderer = ({ value, rowData }: { value: string; rowData: TeamMember }) => {
  const displayValue = value || rowData.userEmail || '-'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onUserClickHandler && rowData.userId) {
          onUserClickHandler(rowData.userId, rowData.userName, rowData.userEmail, rowData.teamId, rowData.teamName)
        }
      }}
      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
    >
      {displayValue}
    </button>
  )
}

// Team name renderer - clicking opens user drawer (same as clicking user name)
const TeamNameRenderer = ({ value, rowData }: { value: string | null; rowData: TeamMember }) => {
  const displayValue = value || '(No team)'
  const hasTeam = !!value && !!rowData.teamId

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onUserClickHandler && rowData.userId) {
          onUserClickHandler(rowData.userId, rowData.userName, rowData.userEmail, rowData.teamId, rowData.teamName)
        }
      }}
      className={`text-left hover:underline ${hasTeam ? 'text-blue-600 hover:text-blue-800' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {displayValue}
    </button>
  )
}

// Static columns definition
const COLUMNS: ColumnDef[] = [
  {
    data: 'userName',
    title: 'Name',
    type: 'text',
    width: 200,
    readOnly: true,
    renderer: (value: string, rowData: TeamMember) => (
      <UserNameRenderer value={value} rowData={rowData} />
    ),
  },
  {
    data: 'userEmail',
    title: 'Email',
    type: 'text',
    width: 220,
    readOnly: true,
  },
  {
    data: 'teamName',
    title: 'Team',
    type: 'text',
    width: 200,
    readOnly: true,
    renderer: (value: string | null, rowData: TeamMember) => (
      <TeamNameRenderer value={value} rowData={rowData} />
    ),
  },
]

export default function TeamsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()

  // State for pagination and filtering
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('userName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Drawer states
  const [userDrawerOpen, setUserDrawerOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<{
    userId: string
    userName: string
    userEmail: string
    teamId: string | null
    teamName: string | null
  } | null>(null)
  const [teamDrawerOpen, setTeamDrawerOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<{
    teamId: string
    teamName: string
  } | null>(null)

  // Register click handler for table cell renderers
  useEffect(() => {
    setUserClickHandler((userId, userName, userEmail, teamId, teamName) => {
      setSelectedUser({ userId, userName, userEmail, teamId, teamName })
      setUserDrawerOpen(true)
    })
    return () => setUserClickHandler(null)
  }, [])

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('search', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))
    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters])

  // Fetch members
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['fms-team-members', queryParams, scopeVersion],
    queryFn: async () => {
      const response = await apiCall<MembersResponse>(`/api/fms_teams/members?${queryParams}`)
      if (!response.ok) throw new Error('Failed to load members')
      const payload = response.result ?? {}
      return {
        items: payload.items ?? [],
        total: payload.total ?? 0,
        totalPages: payload.totalPages ?? 1,
      }
    },
  })

  // Table data
  const tableData = useMemo(() => {
    return (membersData?.items ?? []).map((member) => {
      // Destructure to avoid id duplication (member.id is FmsUserTeam.id which may be null)
      // Use userId as row id for the table
      const { id: _unusedId, ...rest } = member
      return {
        id: member.userId,
        ...rest,
      }
    })
  }, [membersData?.items])

  // Handle team change from drawer - refresh table data
  const handleTeamChange = () => {
    queryClient.invalidateQueries({ queryKey: ['fms-team-members'] })
  }

  // Handle opening team details drawer from user drawer
  const handleTeamClick = (teamId: string, teamName: string) => {
    setSelectedTeam({ teamId, teamName })
    setTeamDrawerOpen(true)
  }

  // Event handlers
  useEventHandlers(
    {
      [TableEvents.COLUMN_SORT]: (payload: { columnName: string; direction: 'asc' | 'desc' | null }) => {
        setSortField(payload.columnName)
        setSortDir(payload.direction || 'asc')
        setPage(1)
      },

      [TableEvents.SEARCH]: (payload: { query: string }) => {
        setSearch(payload.query)
        setPage(1)
      },

      [TableEvents.FILTER_CHANGE]: (payload: { filters: FilterRow[] }) => {
        setFilters(payload.filters)
        setPage(1)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Show skeleton on initial load
  if (membersLoading && !membersData) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={3} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div inert={userDrawerOpen || teamDrawerOpen ? true : undefined}>
          <DynamicTable
            tableRef={tableRef}
            data={tableData}
            columns={COLUMNS}
            tableName="Team Members"
            idColumnName="id"
            height={600}
            colHeaders={true}
            rowHeaders={true}
            stretchColumns={true}
            uiConfig={{ hideAddRowButton: true }}
            pagination={{
              currentPage: page,
              totalPages: Math.ceil((membersData?.total || 0) / limit),
              limit,
              limitOptions: [25, 50, 100],
              onPageChange: setPage,
              onLimitChange: (l) => {
                setLimit(l)
                setPage(1)
              },
            }}
          />
        </div>

        <UserContractorsDrawer
          userId={selectedUser?.userId ?? null}
          userName={selectedUser?.userName ?? null}
          userEmail={selectedUser?.userEmail ?? null}
          teamId={selectedUser?.teamId ?? null}
          teamName={selectedUser?.teamName ?? null}
          open={userDrawerOpen}
          onOpenChange={setUserDrawerOpen}
          onTeamClick={handleTeamClick}
          onTeamChange={handleTeamChange}
        />

        <TeamDetailsDrawer
          teamId={selectedTeam?.teamId ?? null}
          teamName={selectedTeam?.teamName ?? null}
          open={teamDrawerOpen}
          onOpenChange={setTeamDrawerOpen}
        />
      </PageBody>
    </Page>
  )
}
