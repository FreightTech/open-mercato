import type { BoardColumn, FrcRfqBoardCard, TaskChip } from './board-types'

export const FRC_BOARD_COLUMNS: BoardColumn[] = [
  { id: 'received', title: 'New Opportunities', color: '#6366f1' },
  { id: 'offer_sent', title: 'Offer Sent', color: '#f59e0b' },
  { id: 'offer_accepted', title: 'Accepted', color: '#10b981' },
  { id: 'closed_lost', title: 'Closed/Lost', color: '#ef4444' },
]

export function getTimeAgo(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

export function deriveChip(card: Pick<FrcRfqBoardCard, 'offerCount' | 'latestOfferStatus'>): TaskChip {
  if (card.offerCount > 0) {
    if (card.latestOfferStatus === 'booked') {
      return { label: 'Booked', variant: 'chance-high' }
    }
    if (card.latestOfferStatus === 'sent') {
      return { label: 'Offer sent', variant: 'chance-medium' }
    }
    if (card.latestOfferStatus === 'rejected') {
      return { label: 'Rejected', variant: 'chance-low' }
    }
    if (card.latestOfferStatus === 'expired') {
      return { label: 'Expired', variant: 'chance-low' }
    }
    return { label: `${card.offerCount} offer${card.offerCount > 1 ? 's' : ''}`, variant: 'medium' }
  }
  return { label: 'New', variant: 'high' }
}
