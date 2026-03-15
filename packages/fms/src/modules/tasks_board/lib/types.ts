import type { FmsRfqStatus } from '../../fms_offers/data/types'

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

export type RfqBoardCard = {
  id: string
  title: string
  description: string
  referenceNumber: string
  status: FmsRfqStatus
  direction: string | null
  transportMode: string | null
  cargoType: string | null
  containerTypes: string[] | null
  origin: string | null
  destination: string | null
  originLocationId: string | null
  destinationLocationId: string | null
  placeOfLoading: string | null
  placeOfLoadingId: string | null
  placeOfDelivery: string | null
  placeOfDeliveryId: string | null
  companyName: string | null
  contractorId: string | null
  contactPerson: string | null
  contactPersonId: string | null
  context: string | null
  assignee: TaskAssignee | null
  updatedAt: string
  createdAt: string
  offerCount: number
  latestOfferStatus: string | null
  latestOfferId: string | null
  latestOfferNumber: string | null
  latestOfferVersion: number | null
  latestOfferCreatedAt: string | null
  chip: TaskChip
}

export type BoardColumn = {
  id: string
  title: string
  color?: string
}

export type ViewMode = 'board' | 'table'

export type RfqTableRow = {
  id: string
  title: string
  status: FmsRfqStatus
  companyName: string | null
  origin: string | null
  destination: string | null
  direction: string | null
  transportMode: string | null
  cargoType: string | null
  contactPerson: string | null
  assignedToId: string | null
  createdAt: string
  updatedAt: string
}
