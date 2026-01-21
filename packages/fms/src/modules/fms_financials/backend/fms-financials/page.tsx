/**
 * FMS Financials Module - Dashboard View
 * Financial overview with margin analysis using DynamicTable
 * Multiple perspectives: All Projects, By Salesperson, By Client, By Trade Lane, By Ops Staff
 */

'use client'

import * as React from 'react'
import { useMemo, useRef, useState, useCallback } from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  TableEvents,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  PerspectiveConfig,
  PerspectiveSelectEvent,
} from '@open-mercato/ui/backend/dynamic-table'

// ============================================
// TYPE DEFINITIONS
// ============================================

interface ProjectFinancialRow {
  id: string
  projectNumber: string
  client: string
  tradeLane: string
  salesperson: string
  operationsStaff: string
  revenue: number
  cost: number
  grossProfit: number
  marginPercent: number
  containers: number
  teu: number
  status: string
  invoiceStatus: string
  createdAt: string
  completedAt: string | null
}

interface AggregatedRow {
  id: string
  groupKey: string
  projectCount: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  avgMargin: number
  totalTeu: number
  teuPerPerson?: number
}

// ============================================
// MOCK DATA - 40 RECORDS
// ============================================

const PROJECTS_DATA: ProjectFinancialRow[] = [
  // IKEA - High volume, consistent margins
  {
    id: '1',
    projectNumber: 'FMS-2026-001',
    client: 'IKEA Logistics',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 148500,
    cost: 118800,
    grossProfit: 29700,
    marginPercent: 20.0,
    containers: 6,
    teu: 12,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-02',
    completedAt: '2026-01-15',
  },
  {
    id: '2',
    projectNumber: 'FMS-2026-002',
    client: 'IKEA Logistics',
    tradeLane: 'China → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 189000,
    cost: 151200,
    grossProfit: 37800,
    marginPercent: 20.0,
    containers: 8,
    teu: 16,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-07',
    completedAt: '2026-01-25',
  },
  // Żabka - New client, small margins, high volume
  {
    id: '3',
    projectNumber: 'FMS-2026-003',
    client: 'Żabka Polska',
    tradeLane: 'China → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 67000,
    cost: 63650,
    grossProfit: 3350,
    marginPercent: 5.0,
    containers: 3,
    teu: 6,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-04',
    completedAt: '2026-01-20',
  },
  {
    id: '4',
    projectNumber: 'FMS-2026-004',
    client: 'Żabka Polska',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 54000,
    cost: 52380,
    grossProfit: 1620,
    marginPercent: 3.0,
    containers: 2,
    teu: 4,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-10',
    completedAt: '2026-01-28',
  },
  // Biedronka - Huge volume, tight margins
  {
    id: '5',
    projectNumber: 'FMS-2026-005',
    client: 'Biedronka (Jeronimo Martins)',
    tradeLane: 'China → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 245000,
    cost: 232750,
    grossProfit: 12250,
    marginPercent: 5.0,
    containers: 10,
    teu: 20,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-05',
    completedAt: '2026-01-22',
  },
  {
    id: '6',
    projectNumber: 'FMS-2026-006',
    client: 'Biedronka (Jeronimo Martins)',
    tradeLane: 'India → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 178000,
    cost: 174440,
    grossProfit: 3560,
    marginPercent: 2.0,
    containers: 7,
    teu: 14,
    status: 'completed',
    invoiceStatus: 'partial',
    createdAt: '2026-01-12',
    completedAt: '2026-01-30',
  },
  // Media Expert - Problem client, negative margins
  {
    id: '7',
    projectNumber: 'FMS-2026-007',
    client: 'Media Expert',
    tradeLane: 'China → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 89000,
    cost: 97900,
    grossProfit: -8900,
    marginPercent: -10.0,
    containers: 4,
    teu: 8,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-06',
    completedAt: '2026-01-23',
  },
  {
    id: '8',
    projectNumber: 'FMS-2026-008',
    client: 'Media Expert',
    tradeLane: 'Thailand → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 56000,
    cost: 64400,
    grossProfit: -8400,
    marginPercent: -15.0,
    containers: 2,
    teu: 4,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-15',
    completedAt: '2026-02-02',
  },
  // Allegro - Good client, healthy margins
  {
    id: '9',
    projectNumber: 'FMS-2026-009',
    client: 'Allegro',
    tradeLane: 'China → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 123000,
    cost: 98400,
    grossProfit: 24600,
    marginPercent: 20.0,
    containers: 5,
    teu: 10,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-08',
    completedAt: '2026-01-26',
  },
  {
    id: '10',
    projectNumber: 'FMS-2026-010',
    client: 'Allegro',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 87000,
    cost: 73950,
    grossProfit: 13050,
    marginPercent: 15.0,
    containers: 4,
    teu: 8,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-14',
    completedAt: '2026-02-01',
  },
  // Rossmann - Steady business
  {
    id: '11',
    projectNumber: 'FMS-2026-011',
    client: 'Rossmann Polska',
    tradeLane: 'China → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 76000,
    cost: 64600,
    grossProfit: 11400,
    marginPercent: 15.0,
    containers: 3,
    teu: 6,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-09',
    completedAt: '2026-01-27',
  },
  {
    id: '12',
    projectNumber: 'FMS-2026-012',
    client: 'Rossmann Polska',
    tradeLane: 'India → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 54000,
    cost: 48600,
    grossProfit: 5400,
    marginPercent: 10.0,
    containers: 2,
    teu: 4,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-16',
    completedAt: '2026-02-03',
  },
  // Pepco - Growing client
  {
    id: '13',
    projectNumber: 'FMS-2026-013',
    client: 'Pepco',
    tradeLane: 'Bangladesh → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 156000,
    cost: 124800,
    grossProfit: 31200,
    marginPercent: 20.0,
    containers: 6,
    teu: 12,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-11',
    completedAt: '2026-01-29',
  },
  {
    id: '14',
    projectNumber: 'FMS-2026-014',
    client: 'Pepco',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 98000,
    cost: 83300,
    grossProfit: 14700,
    marginPercent: 15.0,
    containers: 4,
    teu: 8,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-17',
    completedAt: '2026-02-04',
  },
  // Action - Discount retailer, razor thin margins
  {
    id: '15',
    projectNumber: 'FMS-2026-015',
    client: 'Action Polska',
    tradeLane: 'China → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 134000,
    cost: 132660,
    grossProfit: 1340,
    marginPercent: 1.0,
    containers: 6,
    teu: 12,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-13',
    completedAt: '2026-01-31',
  },
  {
    id: '16',
    projectNumber: 'FMS-2026-016',
    client: 'Action Polska',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 89000,
    cost: 91670,
    grossProfit: -2670,
    marginPercent: -3.0,
    containers: 4,
    teu: 8,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-18',
    completedAt: '2026-02-05',
  },
  // LPP SA - Fashion, seasonal
  {
    id: '17',
    projectNumber: 'FMS-2026-017',
    client: 'LPP SA',
    tradeLane: 'Bangladesh → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 198000,
    cost: 158400,
    grossProfit: 39600,
    marginPercent: 20.0,
    containers: 8,
    teu: 16,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-03',
    completedAt: '2026-01-18',
  },
  {
    id: '18',
    projectNumber: 'FMS-2026-018',
    client: 'LPP SA',
    tradeLane: 'China → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 145000,
    cost: 130500,
    grossProfit: 14500,
    marginPercent: 10.0,
    containers: 6,
    teu: 12,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-19',
    completedAt: '2026-02-06',
  },
  // RTV Euro AGD - Electronics, volatile
  {
    id: '19',
    projectNumber: 'FMS-2026-019',
    client: 'RTV Euro AGD',
    tradeLane: 'China → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 167000,
    cost: 150300,
    grossProfit: 16700,
    marginPercent: 10.0,
    containers: 7,
    teu: 14,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-08',
    completedAt: '2026-01-26',
  },
  {
    id: '20',
    projectNumber: 'FMS-2026-020',
    client: 'RTV Euro AGD',
    tradeLane: 'Thailand → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 78000,
    cost: 85800,
    grossProfit: -7800,
    marginPercent: -10.0,
    containers: 3,
    teu: 6,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-20',
    completedAt: '2026-02-07',
  },
  // Orlen - Industrial, premium rates
  {
    id: '21',
    projectNumber: 'FMS-2026-021',
    client: 'Orlen SA',
    tradeLane: 'China → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 234000,
    cost: 175500,
    grossProfit: 58500,
    marginPercent: 25.0,
    containers: 9,
    teu: 18,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-10',
    completedAt: '2026-01-28',
  },
  {
    id: '22',
    projectNumber: 'FMS-2026-022',
    client: 'Orlen SA',
    tradeLane: 'India → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 189000,
    cost: 141750,
    grossProfit: 47250,
    marginPercent: 25.0,
    containers: 7,
    teu: 14,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-21',
    completedAt: '2026-02-08',
  },
  // Decathlon - Sports, seasonal peaks
  {
    id: '23',
    projectNumber: 'FMS-2026-023',
    client: 'Decathlon Poland',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 112000,
    cost: 95200,
    grossProfit: 16800,
    marginPercent: 15.0,
    containers: 5,
    teu: 10,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-12',
    completedAt: '2026-01-30',
  },
  {
    id: '24',
    projectNumber: 'FMS-2026-024',
    client: 'Decathlon Poland',
    tradeLane: 'China → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 87000,
    cost: 78300,
    grossProfit: 8700,
    marginPercent: 10.0,
    containers: 4,
    teu: 8,
    status: 'completed',
    invoiceStatus: 'partial',
    createdAt: '2026-01-22',
    completedAt: '2026-02-09',
  },
  // Leroy Merlin - DIY, bulky goods
  {
    id: '25',
    projectNumber: 'FMS-2026-025',
    client: 'Leroy Merlin',
    tradeLane: 'China → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 145000,
    cost: 130500,
    grossProfit: 14500,
    marginPercent: 10.0,
    containers: 6,
    teu: 12,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-14',
    completedAt: '2026-02-01',
  },
  {
    id: '26',
    projectNumber: 'FMS-2026-026',
    client: 'Leroy Merlin',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 98000,
    cost: 88200,
    grossProfit: 9800,
    marginPercent: 10.0,
    containers: 4,
    teu: 8,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-23',
    completedAt: '2026-02-10',
  },
  // CCC Shoes - Footwear, mixed results
  {
    id: '27',
    projectNumber: 'FMS-2026-027',
    client: 'CCC Shoes',
    tradeLane: 'China → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 67000,
    cost: 73700,
    grossProfit: -6700,
    marginPercent: -10.0,
    containers: 3,
    teu: 6,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-09',
    completedAt: '2026-01-27',
  },
  {
    id: '28',
    projectNumber: 'FMS-2026-028',
    client: 'CCC Shoes',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 54000,
    cost: 48600,
    grossProfit: 5400,
    marginPercent: 10.0,
    containers: 2,
    teu: 4,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-24',
    completedAt: '2026-02-11',
  },
  // InPost - Logistics tech
  {
    id: '29',
    projectNumber: 'FMS-2026-029',
    client: 'InPost',
    tradeLane: 'China → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 89000,
    cost: 75650,
    grossProfit: 13350,
    marginPercent: 15.0,
    containers: 4,
    teu: 8,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-15',
    completedAt: '2026-02-02',
  },
  {
    id: '30',
    projectNumber: 'FMS-2026-030',
    client: 'InPost',
    tradeLane: 'India → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 56000,
    cost: 50400,
    grossProfit: 5600,
    marginPercent: 10.0,
    containers: 2,
    teu: 4,
    status: 'completed',
    invoiceStatus: 'matched',
    createdAt: '2026-01-25',
    completedAt: '2026-02-12',
  },
  // In transit projects
  {
    id: '31',
    projectNumber: 'FMS-2026-031',
    client: 'IKEA Logistics',
    tradeLane: 'Bangladesh → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 196000,
    cost: 156800,
    grossProfit: 39200,
    marginPercent: 20.0,
    containers: 8,
    teu: 16,
    status: 'in_transit',
    invoiceStatus: 'pending',
    createdAt: '2026-01-19',
    completedAt: null,
  },
  {
    id: '32',
    projectNumber: 'FMS-2026-032',
    client: 'Biedronka (Jeronimo Martins)',
    tradeLane: 'China → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 267000,
    cost: 253650,
    grossProfit: 13350,
    marginPercent: 5.0,
    containers: 11,
    teu: 22,
    status: 'in_transit',
    invoiceStatus: 'pending',
    createdAt: '2026-01-20',
    completedAt: null,
  },
  {
    id: '33',
    projectNumber: 'FMS-2026-033',
    client: 'Orlen SA',
    tradeLane: 'Thailand → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 178000,
    cost: 133500,
    grossProfit: 44500,
    marginPercent: 25.0,
    containers: 7,
    teu: 14,
    status: 'in_transit',
    invoiceStatus: 'pending',
    createdAt: '2026-01-21',
    completedAt: null,
  },
  // Confirmed projects
  {
    id: '34',
    projectNumber: 'FMS-2026-034',
    client: 'Pepco',
    tradeLane: 'China → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 134000,
    cost: 107200,
    grossProfit: 26800,
    marginPercent: 20.0,
    containers: 5,
    teu: 10,
    status: 'confirmed',
    invoiceStatus: 'pending',
    createdAt: '2026-01-22',
    completedAt: null,
  },
  {
    id: '35',
    projectNumber: 'FMS-2026-035',
    client: 'LPP SA',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 167000,
    cost: 141950,
    grossProfit: 25050,
    marginPercent: 15.0,
    containers: 7,
    teu: 14,
    status: 'confirmed',
    invoiceStatus: 'pending',
    createdAt: '2026-01-23',
    completedAt: null,
  },
  // Draft projects
  {
    id: '36',
    projectNumber: 'FMS-2026-036',
    client: 'Żabka Polska',
    tradeLane: 'Thailand → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 78000,
    cost: 74100,
    grossProfit: 3900,
    marginPercent: 5.0,
    containers: 3,
    teu: 6,
    status: 'draft',
    invoiceStatus: 'pending',
    createdAt: '2026-01-24',
    completedAt: null,
  },
  {
    id: '37',
    projectNumber: 'FMS-2026-037',
    client: 'Allegro',
    tradeLane: 'India → Poland',
    salesperson: 'Anna Kowalska',
    operationsStaff: 'Monika Nowak',
    revenue: 98000,
    cost: 78400,
    grossProfit: 19600,
    marginPercent: 20.0,
    containers: 4,
    teu: 8,
    status: 'draft',
    invoiceStatus: 'pending',
    createdAt: '2026-01-25',
    completedAt: null,
  },
  {
    id: '38',
    projectNumber: 'FMS-2026-038',
    client: 'Media Expert',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 112000,
    cost: 117600,
    grossProfit: -5600,
    marginPercent: -5.0,
    containers: 5,
    teu: 10,
    status: 'draft',
    invoiceStatus: 'pending',
    createdAt: '2026-01-26',
    completedAt: null,
  },
  {
    id: '39',
    projectNumber: 'FMS-2026-039',
    client: 'Rossmann Polska',
    tradeLane: 'Vietnam → Poland',
    salesperson: 'Tomasz Lewandowski',
    operationsStaff: 'Katarzyna Zielińska',
    revenue: 67000,
    cost: 56950,
    grossProfit: 10050,
    marginPercent: 15.0,
    containers: 3,
    teu: 6,
    status: 'draft',
    invoiceStatus: 'pending',
    createdAt: '2026-01-27',
    completedAt: null,
  },
  {
    id: '40',
    projectNumber: 'FMS-2026-040',
    client: 'Action Polska',
    tradeLane: 'Bangladesh → Poland',
    salesperson: 'Piotr Wiśniewski',
    operationsStaff: 'Paweł Dąbrowski',
    revenue: 145000,
    cost: 143550,
    grossProfit: 1450,
    marginPercent: 1.0,
    containers: 6,
    teu: 12,
    status: 'draft',
    invoiceStatus: 'pending',
    createdAt: '2026-01-28',
    completedAt: null,
  },
]

// ============================================
// AGGREGATION FUNCTIONS
// ============================================

function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const groupKey = String(item[key])
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(item)
      return groups
    },
    {} as Record<string, T[]>
  )
}

function sum(items: ProjectFinancialRow[], key: keyof ProjectFinancialRow): number {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0)
}

function average(items: ProjectFinancialRow[], key: keyof ProjectFinancialRow): number {
  if (items.length === 0) return 0
  return sum(items, key) / items.length
}

function aggregateBySalesperson(data: ProjectFinancialRow[]): AggregatedRow[] {
  const grouped = groupBy(data, 'salesperson')
  return Object.entries(grouped).map(([salesperson, projects]) => ({
    id: `salesperson-${salesperson}`,
    groupKey: salesperson,
    projectCount: projects.length,
    totalRevenue: sum(projects, 'revenue'),
    totalCost: sum(projects, 'cost'),
    totalProfit: sum(projects, 'grossProfit'),
    avgMargin: average(projects, 'marginPercent'),
    totalTeu: sum(projects, 'teu'),
  }))
}

function aggregateByClient(data: ProjectFinancialRow[]): AggregatedRow[] {
  const grouped = groupBy(data, 'client')
  return Object.entries(grouped).map(([client, projects]) => ({
    id: `client-${client}`,
    groupKey: client,
    projectCount: projects.length,
    totalRevenue: sum(projects, 'revenue'),
    totalCost: sum(projects, 'cost'),
    totalProfit: sum(projects, 'grossProfit'),
    avgMargin: average(projects, 'marginPercent'),
    totalTeu: sum(projects, 'teu'),
  }))
}

function aggregateByTradeLane(data: ProjectFinancialRow[]): AggregatedRow[] {
  const grouped = groupBy(data, 'tradeLane')
  return Object.entries(grouped).map(([tradeLane, projects]) => ({
    id: `tradeLane-${tradeLane}`,
    groupKey: tradeLane,
    projectCount: projects.length,
    totalRevenue: sum(projects, 'revenue'),
    totalCost: sum(projects, 'cost'),
    totalProfit: sum(projects, 'grossProfit'),
    avgMargin: average(projects, 'marginPercent'),
    totalTeu: sum(projects, 'teu'),
  }))
}

function aggregateByOpsStaff(data: ProjectFinancialRow[]): AggregatedRow[] {
  const grouped = groupBy(data, 'operationsStaff')
  return Object.entries(grouped).map(([opsStaff, projects]) => ({
    id: `opsStaff-${opsStaff}`,
    groupKey: opsStaff,
    projectCount: projects.length,
    totalRevenue: sum(projects, 'revenue'),
    totalCost: sum(projects, 'cost'),
    totalProfit: sum(projects, 'grossProfit'),
    avgMargin: average(projects, 'marginPercent'),
    totalTeu: sum(projects, 'teu'),
    teuPerPerson: sum(projects, 'teu'),
  }))
}

// ============================================
// PERSPECTIVES CONFIGURATION
// ============================================

const PERSPECTIVES: PerspectiveConfig[] = [
  {
    id: 'all',
    name: 'All Projects',
    color: 'blue',
    columns: {
      visible: [
        'projectNumber',
        'client',
        'tradeLane',
        'revenue',
        'cost',
        'grossProfit',
        'marginPercent',
        'teu',
        'status',
      ],
      hidden: ['salesperson', 'operationsStaff', 'containers', 'invoiceStatus', 'createdAt', 'completedAt'],
    },
    filters: [],
    sorting: [{ id: 'grossProfit', field: 'grossProfit', direction: 'desc' }],
  },
  {
    id: 'by-salesperson',
    name: 'By Salesperson',
    color: 'purple',
    columns: {
      visible: ['groupKey', 'projectCount', 'totalRevenue', 'totalCost', 'totalProfit', 'avgMargin', 'totalTeu'],
      hidden: [],
    },
    filters: [],
    sorting: [{ id: 'totalProfit', field: 'totalProfit', direction: 'desc' }],
  },
  {
    id: 'by-client',
    name: 'By Client',
    color: 'green',
    columns: {
      visible: ['groupKey', 'projectCount', 'totalRevenue', 'totalCost', 'totalProfit', 'avgMargin', 'totalTeu'],
      hidden: [],
    },
    filters: [],
    sorting: [{ id: 'totalProfit', field: 'totalProfit', direction: 'desc' }],
  },
  {
    id: 'by-trade-lane',
    name: 'By Trade Lane',
    color: 'orange',
    columns: {
      visible: ['groupKey', 'projectCount', 'totalRevenue', 'totalCost', 'totalProfit', 'avgMargin', 'totalTeu'],
      hidden: [],
    },
    filters: [],
    sorting: [{ id: 'totalProfit', field: 'totalProfit', direction: 'desc' }],
  },
  {
    id: 'by-ops-staff',
    name: 'By Ops Staff',
    color: 'teal',
    columns: {
      visible: ['groupKey', 'projectCount', 'totalRevenue', 'totalCost', 'totalProfit', 'teuPerPerson'],
      hidden: ['avgMargin', 'totalTeu'],
    },
    filters: [],
    sorting: [{ id: 'totalProfit', field: 'totalProfit', direction: 'desc' }],
  },
]

// ============================================
// RENDERERS
// ============================================

const StatusRenderer = ({ value }: { value: string }) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    confirmed: { label: 'Confirmed', color: 'bg-purple-100 text-purple-800' },
    in_transit: { label: 'In Transit', color: 'bg-blue-100 text-blue-800' },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  }

  const status = statusMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
      {status.label}
    </span>
  )
}

const InvoiceStatusRenderer = ({ value }: { value: string }) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800' },
    partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-800' },
    matched: { label: 'Matched', color: 'bg-green-100 text-green-800' },
  }

  const status = statusMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
      {status.label}
    </span>
  )
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`
}

const ProjectNumberRenderer = ({ value }: { value: string }) => {
  return (
    <a
      href={`/backend/fms-projects?q=${value}`}
      className="text-blue-600 hover:text-blue-800 hover:underline font-medium font-mono"
    >
      {value}
    </a>
  )
}

const CurrencyRenderer = (value: number) => formatCurrency(value || 0)

const ProfitRenderer = (value: number) => formatCurrency(value || 0)

const MarginRenderer = (value: number) => formatPercent(value || 0)

// Cell class name functions for conditional styling
const profitCellClassName = (value: number) => {
  if (value > 0) return 'cell-green'
  if (value < 0) return 'cell-red'
  return ''
}

const marginCellClassName = (value: number) => {
  if (value > 0) return 'cell-green'
  if (value < 0) return 'cell-red'
  return ''
}

const DETAIL_RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  ProjectNumberRenderer: (value) => <ProjectNumberRenderer value={value} />,
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  InvoiceStatusRenderer: (value) => <InvoiceStatusRenderer value={value} />,
  CurrencyRenderer: (value) => CurrencyRenderer(value),
  ProfitRenderer: (value) => ProfitRenderer(value),
  MarginRenderer: (value) => MarginRenderer(value),
}

const AGGREGATED_RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  CurrencyRenderer: (value) => CurrencyRenderer(value),
  ProfitRenderer: (value) => ProfitRenderer(value),
  MarginRenderer: (value) => MarginRenderer(value),
}

// ============================================
// COLUMN DEFINITIONS
// ============================================

function getDetailColumns(): ColumnDef[] {
  return [
    {
      data: 'projectNumber',
      title: 'Project #',
      width: 120,
      readOnly: true,
      renderer: DETAIL_RENDERERS.ProjectNumberRenderer,
    },
    {
      data: 'client',
      title: 'Client',
      width: 140,
      readOnly: true,
    },
    {
      data: 'tradeLane',
      title: 'Trade Lane',
      width: 150,
      readOnly: true,
    },
    {
      data: 'salesperson',
      title: 'Salesperson',
      width: 140,
      readOnly: true,
    },
    {
      data: 'operationsStaff',
      title: 'Ops Staff',
      width: 140,
      readOnly: true,
    },
    {
      data: 'revenue',
      title: 'Revenue',
      width: 100,
      type: 'numeric',
      readOnly: true,
      renderer: DETAIL_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'cost',
      title: 'Cost',
      width: 100,
      type: 'numeric',
      readOnly: true,
      renderer: DETAIL_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'grossProfit',
      title: 'Gross Profit',
      width: 110,
      type: 'numeric',
      readOnly: true,
      renderer: DETAIL_RENDERERS.ProfitRenderer,
      cellClassName: profitCellClassName,
    },
    {
      data: 'marginPercent',
      title: 'Margin %',
      width: 80,
      type: 'numeric',
      readOnly: true,
      renderer: DETAIL_RENDERERS.MarginRenderer,
      cellClassName: marginCellClassName,
    },
    {
      data: 'containers',
      title: 'Containers',
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'teu',
      title: 'TEU',
      width: 60,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'status',
      title: 'Status',
      width: 100,
      readOnly: true,
      renderer: DETAIL_RENDERERS.StatusRenderer,
    },
    {
      data: 'invoiceStatus',
      title: 'Invoice',
      width: 90,
      readOnly: true,
      renderer: DETAIL_RENDERERS.InvoiceStatusRenderer,
    },
    {
      data: 'createdAt',
      title: 'Created',
      width: 100,
      type: 'date',
      readOnly: true,
    },
    {
      data: 'completedAt',
      title: 'Completed',
      width: 100,
      type: 'date',
      readOnly: true,
    },
  ] as ColumnDef[]
}

function getAggregatedColumns(perspectiveId: string): ColumnDef[] {
  const titleMap: Record<string, string> = {
    'by-salesperson': 'Salesperson',
    'by-client': 'Client',
    'by-trade-lane': 'Trade Lane',
    'by-ops-staff': 'Ops Staff',
  }

  const baseColumns: ColumnDef[] = [
    {
      data: 'groupKey',
      title: titleMap[perspectiveId] || 'Group',
      width: 160,
      readOnly: true,
    },
    {
      data: 'projectCount',
      title: 'Projects',
      width: 80,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'totalRevenue',
      title: 'Revenue',
      width: 110,
      type: 'numeric',
      readOnly: true,
      renderer: AGGREGATED_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'totalCost',
      title: 'Cost',
      width: 100,
      type: 'numeric',
      readOnly: true,
      renderer: AGGREGATED_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'totalProfit',
      title: 'Profit',
      width: 100,
      type: 'numeric',
      readOnly: true,
      renderer: AGGREGATED_RENDERERS.ProfitRenderer,
      cellClassName: profitCellClassName,
    },
    {
      data: 'avgMargin',
      title: 'Avg Margin',
      width: 90,
      type: 'numeric',
      readOnly: true,
      renderer: AGGREGATED_RENDERERS.MarginRenderer,
      cellClassName: marginCellClassName,
    },
    {
      data: 'totalTeu',
      title: 'TEU',
      width: 70,
      type: 'numeric',
      readOnly: true,
    },
  ]

  // Add teuPerPerson for ops staff view
  if (perspectiveId === 'by-ops-staff') {
    baseColumns.push({
      data: 'teuPerPerson',
      title: 'TEU/Person',
      width: 90,
      type: 'numeric',
      readOnly: true,
    })
  }

  return baseColumns as ColumnDef[]
}


// ============================================
// MAIN COMPONENT
// ============================================

export default function FinancialsDashboardPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const [activePerspectiveId, setActivePerspectiveId] = useState<string>('all')

  // Get data based on active perspective
  const tableData = useMemo(() => {
    switch (activePerspectiveId) {
      case 'by-salesperson':
        return aggregateBySalesperson(PROJECTS_DATA)
      case 'by-client':
        return aggregateByClient(PROJECTS_DATA)
      case 'by-trade-lane':
        return aggregateByTradeLane(PROJECTS_DATA)
      case 'by-ops-staff':
        return aggregateByOpsStaff(PROJECTS_DATA)
      case 'all':
      default:
        return PROJECTS_DATA
    }
  }, [activePerspectiveId])

  // Get columns based on active perspective
  const columns = useMemo(() => {
    if (activePerspectiveId === 'all') {
      return getDetailColumns()
    }
    return getAggregatedColumns(activePerspectiveId)
  }, [activePerspectiveId])

  // Handle perspective change
  const handlePerspectiveSelect = useCallback((payload: PerspectiveSelectEvent) => {
    if (payload.id) {
      setActivePerspectiveId(payload.id)
    } else {
      setActivePerspectiveId('all')
    }
  }, [])

  useEventHandlers(
    {
      [TableEvents.PERSPECTIVE_SELECT]: handlePerspectiveSelect,
    },
    tableRef as React.RefObject<HTMLElement>
  )

  return (
    <Page>
      <PageBody>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="FMS Financials"
          idColumnName="id"
          height="calc(100vh - 110px)"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          savedPerspectives={PERSPECTIVES}
          activePerspectiveId={activePerspectiveId}
          uiConfig={{
            hideAddRowButton: true,
            hideActionsColumn: true,
            enableFullscreen: true,
          }}
        />
      </PageBody>
    </Page>
  )
}
