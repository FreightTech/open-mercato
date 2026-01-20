// Components
export { QuoteWizardDrawer } from './QuoteWizardDrawer'
export { QuoteWizardContent } from './QuoteWizardContent'
export { QuoteWizardHeader, QuoteWizardHeaderConnected } from './QuoteWizardHeader'
export { QuoteWizardLinesTable, QuoteWizardLinesTableConnected } from './QuoteWizardLinesTable'
export { QuoteWizardTotals, QuoteWizardTotalsConnected } from './QuoteWizardTotals'

// Context and Hooks
export { QuoteWizardProvider, QuoteWizardContext } from './hooks/QuoteWizardContext'
export {
  useQuoteWizardContext,
  useQuote,
  useQuoteLines,
  useQuoteTotalsFromContext,
  useSaveStatus,
  useQuoteWizardUI,
  useDraftState,
} from './hooks/useQuoteWizardContext'

// Legacy hooks (deprecated - use context instead)
export { useQuoteWizard } from './hooks/useQuoteWizard'
export { useNewQuoteWizard } from './hooks/useNewQuoteWizard'

// Types
export type {
  Quote,
  QuoteLine,
  DraftLine,
  NewLineData,
  PortRef,
  AssignedUser,
  QuoteTotals,
  SaveStatus,
  QuoteWizardMode,
  QuoteWizardState,
  QuoteWizardActions,
  QuoteWizardContextValue,
  ProductSearchResult,
  ProductConfirmData,
  UIState,
} from './types/quote-wizard'

// Calculation utilities
export {
  calculateFromMargin,
  calculateFromSales,
  calculateLineTotals,
  calculateQuoteTotals,
  useQuoteCalculations,
  useQuoteTotals,
} from './hooks/useQuoteCalculations'

// Table data utilities
export {
  useQuoteTableData,
  parseClientValue,
  parseAssignedToValue,
  parsePortValue,
  directionToLabel,
  labelToDirection,
  DIRECTION_OPTIONS,
  CURRENCY_OPTIONS,
} from './hooks/useQuoteTableData'
