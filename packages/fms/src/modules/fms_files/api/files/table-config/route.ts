/**
 * FMS Files - Table Config API
 * GET /api/fms_files/files/table-config — column definitions for file list DynamicTable
 */

import { NextResponse } from 'next/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
}

function getColumns() {
  return [
    { data: 'referenceNumber', title: 'Reference #', width: 210, readOnly: true, renderer: 'referenceNumber' },
    { data: 'status.transport', title: 'Transport', width: 120, readOnly: true, renderer: 'transportStatus' },
    { data: 'status.financial', title: 'Financial', width: 110, readOnly: true, renderer: 'financialStatus' },
    { data: 'status.documentation', title: 'Docs', width: 100, readOnly: true, renderer: 'documentationStatus' },
    { data: 'cargoType', title: 'Type', width: 60, readOnly: true, renderer: 'cargoType' },
    { data: 'shipmentType', title: 'Ship', width: 60, readOnly: true, renderer: 'shipmentType' },
    { data: 'contractorName', title: 'Client', width: 150, readOnly: true },
    { data: 'assigneeName', title: 'Assignee', width: 120, readOnly: true },
    { data: 'createdAt', title: 'Created', width: 100, readOnly: true },
  ]
}

export async function GET() {
  const columns = getColumns()
  return NextResponse.json({ columns, meta: { totalColumns: columns.length } })
}

export const openApi = {
  get: {
    operationId: 'getFmsFilesTableConfig',
    summary: 'Get table config for FMS files list',
    tags: ['FMS Files'],
    responses: { 200: { description: 'Column definitions' } },
  },
}
