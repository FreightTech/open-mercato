// ============================================
// 4R Cargo FMS - Shared Types
// ============================================

// RFQ Sales Stage (lifecycle stages)
export const FRC_SALES_STAGES = [
  'received',
  'offer_sent',
  'offer_accepted',
  'closed_lost',
] as const
export type FrcSalesStage = (typeof FRC_SALES_STAGES)[number]

// Delivery Status
export const FRC_DELIVERY_STATUSES = [
  'awaiting',
  'in_transit',
  'in_transit_delayed',
  'delivered',
  'paid',
] as const
export type FrcDeliveryStatus = (typeof FRC_DELIVERY_STATUSES)[number]

// Origin Type
export const FRC_ORIGIN_TYPES = ['airport', 'warehouse', 'door'] as const
export type FrcOriginType = (typeof FRC_ORIGIN_TYPES)[number]

// Loose or Unitised
export const FRC_LOOSE_OR_UNITISED = ['loose', 'unitised'] as const
export type FrcLooseOrUnitised = (typeof FRC_LOOSE_OR_UNITISED)[number]

// Stackable Type
export const FRC_STACKABLE_TYPES = ['fully_stackable', 'non_stackable'] as const
export type FrcStackableType = (typeof FRC_STACKABLE_TYPES)[number]

// Offer Status
export const FRC_OFFER_STATUSES = [
  'draft',
  'sent',
  'booked',
  'rejected',
  'expired',
] as const
export type FrcOfferStatus = (typeof FRC_OFFER_STATUSES)[number]

// Connection Method
export const FRC_CONNECTION_METHODS = [
  '4r_consol_truck',
  'direct',
  'connecting_flight',
] as const
export type FrcConnectionMethod = (typeof FRC_CONNECTION_METHODS)[number]

// Routing Type
export const FRC_ROUTING_TYPES = [
  'direct_pickup_truck_management',
  'direct_flight',
  'connecting_flight',
] as const
export type FrcRoutingType = (typeof FRC_ROUTING_TYPES)[number]

// Truck Booking Status
export const FRC_BOOKING_STATUSES = [
  'draft',
  'booked',
  'completed',
  'cancelled',
] as const
export type FrcBookingStatus = (typeof FRC_BOOKING_STATUSES)[number]

// Project Status
export const FRC_PROJECT_STATUSES = ['active', 'completed', 'cancelled'] as const
export type FrcProjectStatus = (typeof FRC_PROJECT_STATUSES)[number]

// Product Types (General Cargo, Dangerous Goods, etc.)
export const FRC_PRODUCT_TYPES = [
  'general_cargo',
  'dangerous_goods',
  'perishable',
  'valuable',
  'live_animals',
  'pharmaceuticals',
] as const
export type FrcProductType = (typeof FRC_PRODUCT_TYPES)[number]
