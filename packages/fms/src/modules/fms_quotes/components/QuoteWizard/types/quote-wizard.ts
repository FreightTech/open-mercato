/**
 * QuoteWizard Types
 *
 * Centralized type definitions for the QuoteWizard state management.
 * All quote-related types are exported from here to ensure consistency.
 */

// =============================================================================
// Port Reference Types
// =============================================================================

export type PortRef = {
  id: string
  locode?: string | null
  name: string
  city?: string | null
  country?: string | null
}

// =============================================================================
// User Types
// =============================================================================

export type AssignedUser = {
  id: string
  name: string
  email: string
}

// =============================================================================
// Quote Types
// =============================================================================

export type FmsQuoteStatus = 'draft' | 'ready' | 'offered' | 'won' | 'lost' | 'expired' | 'archived'

export type FmsTransportMode = 'sea' | 'air' | 'road' | 'rail' | 'barge'

export type Quote = {
  id: string
  quoteNumber?: string | null
  clientId?: string | null
  clientName?: string | null
  assignedToId?: string | null
  assignedToName?: string | null
  assignedTo?: AssignedUser | null
  containerCount?: number | null
  status: string
  direction?: string | null
  incoterm?: string | null
  cargoType?: string | null
  modes?: FmsTransportMode[]
  originPorts?: PortRef[]
  destinationPorts?: PortRef[]
  validUntil?: string | null
  currencyCode: string
  notes?: string | null
}

// =============================================================================
// Quote Line Types
// =============================================================================

export type QuoteLine = {
  id: string
  lineNumber: number
  productId?: string | null
  variantId?: string | null
  priceId?: string | null
  providerId?: string | null
  productName: string
  chargeCode?: string | null
  productType?: string | null
  providerName?: string | null
  containerSize?: string | null
  contractType?: string | null
  quantity: string
  currencyCode: string
  unitCost: string
  marginPercent: string
  unitSales: string
}

// Draft line extends QuoteLine with temp ID for tracking before persistence
export type DraftLine = {
  tempId: string
  realId?: string
} & Omit<QuoteLine, 'id'>

// Line data for creating new lines (before ID assignment)
export type NewLineData = Omit<QuoteLine, 'id' | 'lineNumber'>

// =============================================================================
// Product Search Types
// =============================================================================

export type ProductSearchResult = {
  productId: string
  productName: string
  productType: string
  chargeCode: string
  chargeCodeName: string
  variantId: string | null
  variantName?: string | null
  containerSize?: string | null
  priceId: string | null
  price: string | null
  currencyCode: string | null
  contractType: string | null
  contractNumber?: string | null
  validityStart: string | null
  validityEnd?: string | null
  providerContractorId?: string | null
  loop?: string | null
  source?: string | null
  destination?: string | null
  transitTime?: number | null
}

export type ProductConfirmData = {
  productId: string
  variantId?: string
  priceId?: string
  productName: string
  chargeCode: string
  productType: string
  providerName?: string
  containerSize?: string
  contractType: string
  quantity: number
  unitCost: number
  currencyCode: string
  marginPercent: number
}

// =============================================================================
// Totals Types
// =============================================================================

export type QuoteTotals = {
  totalCost: number
  totalSales: number
  totalProfit: number
  lineCount: number
  averageMargin: number
}

export type CurrencyTotals = {
  currencyCode: string
  lineCount: number
  totalCost: number
  totalSales: number
  totalProfit: number
  marginPercent: number
}

export type MultiCurrencyTotals = {
  byCurrency: CurrencyTotals[]
  overall: {
    lineCount: number
    averageMargin: number
  }
}

// =============================================================================
// Save Status Types
// =============================================================================

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// =============================================================================
// Context State Types
// =============================================================================

export type QuoteWizardMode = 'new' | 'edit'

export type UIState = {
  showProductSearch: boolean
  selectedProduct: ProductSearchResult | null
  showCreateOfferDrawer: boolean
  showCustomProductModal: boolean
  showDiscardDialog: boolean
  contextPanelOpen: boolean
  continueAddingMode: boolean
  error: string | null
}

export type QuoteWizardState = {
  // Mode
  mode: QuoteWizardMode

  // Server state (from React Query)
  quote: Quote | null
  lines: QuoteLine[]
  isLoadingQuote: boolean
  isLoadingLines: boolean

  // Draft-specific state
  effectiveQuoteId: string | null
  isDirty: boolean
  persistedQuoteId: string | null

  // Save status
  saveStatus: SaveStatus
  hasPendingChanges: boolean
  isCreating: boolean
  isDeleting: boolean

  // Derived state (memoized)
  totals: QuoteTotals

  // UI state
  ui: UIState
}

export type QuoteWizardActions = {
  // Quote mutations
  updateQuote: (updates: Partial<Quote>) => void

  // Line mutations
  addLine: (lineData: NewLineData) => Promise<QuoteLine | DraftLine>
  updateLine: (lineId: string, field: string, value: unknown) => void
  removeLine: (lineId: string) => Promise<void>

  // UI actions
  openProductSearch: () => void
  closeProductSearch: () => void
  selectProduct: (product: ProductSearchResult | null) => void
  setError: (error: string | null) => void
  openCreateOfferDrawer: () => void
  closeCreateOfferDrawer: () => void
  openCustomProductModal: () => void
  closeCustomProductModal: () => void
  openDiscardDialog: () => void
  closeDiscardDialog: () => void
  toggleContextPanel: () => void
  setContinueAddingMode: (mode: boolean) => void

  // Lifecycle
  forceSave: () => Promise<void>
  resetDraft: () => void

  // Explicit save (for new mode) - creates quote + all lines
  handleSave: () => Promise<string | null>
}

export type QuoteWizardContextValue = QuoteWizardState & QuoteWizardActions

// =============================================================================
// Provider Props
// =============================================================================

export type QuoteWizardProviderProps = {
  quoteId: string | null
  mode: QuoteWizardMode
  children: React.ReactNode
  onQuoteCreated?: (quoteId: string) => void
  onClose: () => void
}

// =============================================================================
// API Response Types
// =============================================================================

export type QuoteLinesResponse = {
  items: QuoteLine[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type CreateQuoteResponse = {
  id: string
  quoteNumber?: string
  error?: string
}

export type CreateLineResponse = {
  id: string
  error?: string
}
