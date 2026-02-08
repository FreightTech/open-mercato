import type { BoardColumn, RfqBoardCard, TaskChip } from './types'

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'incoming', title: 'Incoming RFQ', color: '#6366f1' },
  { id: 'in_progress', title: 'In Progress', color: '#f59e0b' },
  { id: 'waiting_for_client', title: 'Waiting for Client', color: '#8b5cf6' },
  { id: 'approved', title: 'Approved', color: '#10b981' },
  { id: 'declined', title: 'Declined', color: '#ef4444' },
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

export function deriveChip(card: Pick<RfqBoardCard, 'offerCount' | 'latestOfferStatus'>): TaskChip {
  if (card.offerCount > 0) {
    if (card.latestOfferStatus === 'accepted') {
      return { label: 'Accepted', variant: 'chance-high' }
    }
    if (card.latestOfferStatus === 'sent') {
      return { label: 'Offer sent', variant: 'chance-medium' }
    }
    if (card.latestOfferStatus === 'declined') {
      return { label: 'Declined', variant: 'chance-low' }
    }
    return { label: `${card.offerCount} offer${card.offerCount > 1 ? 's' : ''}`, variant: 'medium' }
  }
  return { label: 'New', variant: 'high' }
}
