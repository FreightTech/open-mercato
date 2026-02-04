import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_teams.view'] },
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const columns = [
    {
      data: 'userName',
      title: 'Name',
      type: 'text',
      width: 200,
      readOnly: true,
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
      width: 180,
      readOnly: false,
    },
  ]

  const filterFields = [
    { field: 'userName', label: 'Name', type: 'text' },
    { field: 'userEmail', label: 'Email', type: 'text' },
    { field: 'teamId', label: 'Team', type: 'select' },
  ]

  return NextResponse.json({
    columns,
    filterFields,
    defaultSort: { field: 'userName', direction: 'asc' },
  })
}
