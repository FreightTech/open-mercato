/**
 * FMS Booking Module - Table Configuration
 * DynamicTable configuration for bookings list view
 */

import { useMemo } from 'react'

export function useTableConfig() {
  const columns = useMemo(
    () => [
      {
        data: 'booking_number',
        title: 'Booking #',
        width: 150,
        readOnly: true,
        className: 'font-mono font-semibold',
      },
      {
        data: 'current_step',
        title: 'Status',
        width: 120,
        readOnly: true,
        renderer: (instance: any, td: HTMLTableCellElement, row: number, col: number, prop: string, value: any) => {
          const statusMap: Record<string, { label: string; color: string }> = {
            draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
            plan_route: { label: 'Planning', color: 'bg-blue-100 text-blue-800' },
            add_cargo: { label: 'Adding Cargo', color: 'bg-yellow-100 text-yellow-800' },
            validated: { label: 'Validated', color: 'bg-green-100 text-green-800' },
            confirmed: { label: 'Confirmed', color: 'bg-purple-100 text-purple-800' },
            in_transit: { label: 'In Transit', color: 'bg-indigo-100 text-indigo-800' },
            delivered: { label: 'Delivered', color: 'bg-teal-100 text-teal-800' },
            completed: { label: 'Completed', color: 'bg-green-200 text-green-900' },
            cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
          }

          const status = statusMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
          td.innerHTML = `<span class="inline-flex px-2 py-1 text-xs rounded-full ${status.color}">${status.label}</span>`
          return td
        },
      },
      {
        data: 'client_name',
        title: 'Client',
        width: 180,
        readOnly: true,
      },
      {
        data: 'cargo_type',
        title: 'Type',
        width: 80,
        readOnly: true,
        renderer: (instance: any, td: HTMLTableCellElement, row: number, col: number, prop: string, value: any) => {
          td.innerHTML = value ? value.toUpperCase() : ''
          return td
        },
      },
      {
        data: 'shipment_type',
        title: 'Shipment',
        width: 100,
        readOnly: true,
      },
      {
        data: 'origin_address',
        title: 'Origin',
        width: 180,
        readOnly: true,
        className: 'text-sm',
      },
      {
        data: 'destination_address',
        title: 'Destination',
        width: 180,
        readOnly: true,
        className: 'text-sm',
      },
      {
        data: 'requested_pickup_date',
        title: 'Pickup Date',
        width: 120,
        type: 'date',
        dateFormat: 'YYYY-MM-DD',
        readOnly: true,
      },
      {
        data: 'client_reference',
        title: 'Client Ref',
        width: 140,
        readOnly: true,
      },
      {
        data: 'created_at',
        title: 'Created',
        width: 140,
        type: 'date',
        dateFormat: 'YYYY-MM-DD HH:mm',
        readOnly: true,
      },
    ],
    []
  )

  const perspectives = useMemo(
    () => [
      {
        id: 'all',
        name: 'All Bookings',
        filters: [],
      },
      {
        id: 'draft',
        name: 'Draft',
        filters: [{ column: 'current_step', operator: 'eq', value: 'draft' }],
      },
      {
        id: 'planning',
        name: 'Planning',
        filters: [
          {
            column: 'current_step',
            operator: 'in',
            value: ['plan_route', 'add_cargo'],
          },
        ],
      },
      {
        id: 'validated',
        name: 'Validated',
        filters: [{ column: 'current_step', operator: 'eq', value: 'validated' }],
      },
      {
        id: 'active',
        name: 'Active',
        filters: [
          {
            column: 'current_step',
            operator: 'in',
            value: ['confirmed', 'in_transit'],
          },
        ],
      },
      {
        id: 'completed',
        name: 'Completed',
        filters: [
          {
            column: 'current_step',
            operator: 'in',
            value: ['delivered', 'completed'],
          },
        ],
      },
      {
        id: 'fcl',
        name: 'FCL Only',
        filters: [{ column: 'cargo_type', operator: 'eq', value: 'fcl' }],
      },
      {
        id: 'lcl',
        name: 'LCL Only',
        filters: [{ column: 'cargo_type', operator: 'eq', value: 'lcl' }],
      },
    ],
    []
  )

  return { columns, perspectives }
}
