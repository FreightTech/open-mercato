import type { FrcSalesStage, FrcDeliveryStatus } from '../../../lib/types'

export type ChipVariant = 'high' | 'medium' | 'low' | 'chance-high' | 'chance-medium' | 'chance-low'

export type TaskChip = {
  label: string
  variant: ChipVariant
}

export type TaskAssignee = {
  id: string
  name: string
  initials: string
  color?: string
}

export type FrcRfqBoardCard = {
  id: string
  name: string
  salesStage: FrcSalesStage
  deliveryStatus: FrcDeliveryStatus
  probability: number
  amount: string | null
  currencyCode: string
  originAirportCode: string | null
  originAirportName: string | null
  destinationAirportCode: string | null
  destinationAirportName: string | null
  product: string | null
  commodity: string | null
  totalPieces: number
  totalChargeableWeight: string
  accountId: string | null
  accountName: string | null
  contactId: string | null
  description: string | null
  assignee: TaskAssignee | null
  offerCount: number
  latestOfferStatus: string | null
  latestOfferId: string | null
  createdAt: string
  updatedAt: string
  chip: TaskChip
}

export type BoardColumn = {
  id: FrcSalesStage
  title: string
  color: string
}
