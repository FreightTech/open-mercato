'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  FilterRow,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { TeamDropdownEditor } from '../../components/TeamDropdownEditor'
import { UserContractorsDrawer } from '../../components/UserContractorsDrawer'
import { TeamContractorsDrawer } from '../../components/TeamContractorsDrawer'

type TeamMember = {
  id: string | null
  teamId: string | null
  teamName: string | null
  userId: string
  userName: string
  userEmail: string
}

type Team = {
  id: string
  name: string
  isActive: boolean
  memberCount: number
}

type MembersResponse = {
  items?: TeamMember[]
  total?: number
  page?: number
  totalPages?: number
}

type TeamsResponse = {
  items?: Team[]
  total?: number
}

type TeamOption = {
  value: string | null
  label: string
}

// Global refs for click handlers
let onUserClickHandler: ((userId: string, userName: string, userEmail: string) => void) | null = null
let onTeamClickHandler: ((teamId: string, teamName: string) => void) | null = null

function setUserClickHandler(handler: typeof onUserClickHandler) {
  onUserClickHandler = handler
}

function setTeamClickHandler(handler: typeof onTeamClickHandler) {
  onTeamClickHandler = handler
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
          onUserClickHandler(rowData.userId, rowData.userName, rowData.userEmail)
        }
      }}
      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
    >
      {displayValue}
    </button>
  )
}

// Team name renderer with clickable link
const TeamNameRenderer = ({ value, rowData }: { value: string | null; rowData: TeamMember }) => {
  if (!value || !rowData.teamId) {
    return <span className="text-muted-foreground">-</span>
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onTeamClickHandler && rowData.teamId && rowData.teamName) {
          onTeamClickHandler(rowData.teamId, rowData.teamName)
        }
      }}
      className="text-blue-600 hover:text-blue-800 hover:underline text-left"
    >
      {value}
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
    data: 'teamId',
    title: 'Team',
    type: 'dropdown',
    width: 200,
    // Editor and renderer are added dynamically
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
  } | null>(null)
  const [teamDrawerOpen, setTeamDrawerOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<{
    teamId: string
    teamName: string
  } | null>(null)

  // Register click handlers
  useEffect(() => {
    setUserClickHandler((userId, userName, userEmail) => {
      setSelectedUser({ userId, userName, userEmail })
      setUserDrawerOpen(true)
    })
    return () => setUserClickHandler(null)
  }, [])

  useEffect(() => {
    setTeamClickHandler((teamId, teamName) => {
      setSelectedTeam({ teamId, teamName })
      setTeamDrawerOpen(true)
    })
    return () => setTeamClickHandler(null)
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

  // Fetch teams for dropdown
  const { data: teamsData } = useQuery({
    queryKey: ['fms-teams-list', scopeVersion],
    queryFn: async () => {
      const response = await apiCall<TeamsResponse>('/api/fms_teams/teams?pageSize=100')
      if (!response.ok) throw new Error('Failed to load teams')
      return response.result?.items ?? []
    },
  })

  // Teams map for name lookups
  const teamsMap = useMemo(() => {
    const map = new Map<string, Team>()
    ;(teamsData ?? []).forEach((team) => map.set(team.id, team))
    return map
  }, [teamsData])

  // Team options for dropdown
  const teamOptions: TeamOption[] = useMemo(
    () => (teamsData ?? []).map((team) => ({ value: team.id, label: team.name })),
    [teamsData]
  )

  // Handle team created from dropdown editor
  const handleTeamCreated = useCallback(
    (team: { id: string; name: string }) => {
      queryClient.invalidateQueries({ queryKey: ['fms-teams-list'] })
    },
    [queryClient]
  )

  // Create columns with dynamic editor
  const columns = useMemo(() => {
    return COLUMNS.map((col) => {
      if (col.data === 'teamId') {
        return {
          ...col,
          editor: (
            value: unknown,
            onChange: (val: unknown) => void,
            onSave: (val?: unknown, clearEditing?: boolean) => void,
            onCancel: () => void
          ) => {
            const currentValue = typeof value === 'string' ? value : null
            return (
              <TeamDropdownEditor
                value={currentValue}
                teams={teamOptions}
                onChange={(val) => onChange(val)}
                onSave={(val, clear) => onSave(val, clear)}
                onCancel={onCancel}
                onTeamCreated={handleTeamCreated}
              />
            )
          },
          renderer: (value: unknown, rowData: TeamMember) => {
            const teamName = rowData.teamName ?? teamsMap.get(value as string)?.name ?? null
            return <TeamNameRenderer value={teamName} rowData={rowData} />
          },
        }
      }
      return col
    })
  }, [teamOptions, teamsMap, handleTeamCreated])

  // Table data
  const tableData = useMemo(() => {
    return (membersData?.items ?? []).map((member) => ({
      id: member.userId, // Use userId as row id since FmsUserTeam.id may be null
      ...member,
    }))
  }, [membersData?.items])

  // Event handlers
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        })

        try {
          const rowData = tableData[payload.rowIndex]
          const userId = rowData?.userId

          if (!userId) {
            throw new Error('User ID not found')
          }

          if (payload.prop === 'teamId') {
            const teamId = payload.newValue === '' ? null : payload.newValue

            const response = await apiCall<{ ok: boolean; error?: string }>(
              `/api/fms_teams/members/${userId}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId }),
              }
            )

            if (response.ok) {
              flash('Team assignment updated', 'success')
              dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
                rowIndex: payload.rowIndex,
                colIndex: payload.colIndex,
              })
              queryClient.invalidateQueries({ queryKey: ['fms-team-members'] })
              queryClient.invalidateQueries({ queryKey: ['fms-teams-list'] })
            } else {
              const error = response.result?.error || 'Update failed'
              flash(error, 'error')
              dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
                rowIndex: payload.rowIndex,
                colIndex: payload.colIndex,
                error,
              })
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          })
        }
      },

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
            columns={columns}
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
          open={userDrawerOpen}
          onOpenChange={setUserDrawerOpen}
        />

        <TeamContractorsDrawer
          teamId={selectedTeam?.teamId ?? null}
          teamName={selectedTeam?.teamName ?? null}
          open={teamDrawerOpen}
          onOpenChange={setTeamDrawerOpen}
        />
      </PageBody>
    </Page>
  )
}
