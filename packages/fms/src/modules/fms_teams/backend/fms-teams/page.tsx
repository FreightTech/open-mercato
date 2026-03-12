'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
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
  const scopeVersion = useOrganizationScopeVersion()

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

  const table = useDynamicTablePage<TeamMember>({
    source: '/api/fms_teams/members',
    columns: COLUMNS,
    tableName: 'Team Members',
    defaultSort: { field: 'userName', direction: 'asc' },
    queryKey: 'fms-team-members',
    queryKeyDeps: [scopeVersion],
    mapApiItem: (item: any) => ({
      id: item.userId,
      teamId: item.teamId || null,
      teamName: item.teamName || null,
      userId: item.userId,
      userName: item.userName || item.userEmail,
      userEmail: item.userEmail,
    }),
    cellEdit: false,
    tableProps: {
      height: 600,
      stretchColumns: true,
      uiConfig: { hideAddRowButton: true, borderless: true },
    },
  })

  // Handle team change from drawer - refresh table data
  const handleTeamChange = () => {
    table.refresh()
  }

  // Handle opening team details drawer from user drawer
  const handleTeamClick = (teamId: string, teamName: string) => {
    setSelectedTeam({ teamId, teamName })
    setTeamDrawerOpen(true)
  }

  // Show skeleton on initial load
  if (table.isLoading) {
    return (
      <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
        <TableSkeleton rows={10} columns={3} />
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <div inert={userDrawerOpen || teamDrawerOpen ? true : undefined}>
        <DynamicTable {...table.props} />
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
    </div>
  )
}
