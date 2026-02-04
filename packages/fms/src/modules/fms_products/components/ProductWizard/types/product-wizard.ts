/**
 * Mode for the ProductWizard
 */
export type ProductWizardMode = 'new' | 'edit'

/**
 * Draft state for the product being created/edited
 */
export type ProductDraft = {
  id: string | null
  name: string
  chargeCodeId: string | null
  chargeCodeName: string | null
  chargeCodeCode: string | null
  chargeUnit: string | null
  carrierId: string | null
  carrierName: string | null
  loop: string | null
  sourceId: string | null
  sourceName: string | null
  destinationId: string | null
  destinationName: string | null
  transitTime: number | null
  locationId: string | null
  locationName: string | null
  description: string | null
  internalNotes: string | null
  isActive: boolean
}

/**
 * Draft state for variants being created/edited
 */
export type VariantDraft = {
  tempId: string
  realId?: string
  validityStart: string | null
  validityEnd: string | null
  containerSize: string | null
  reference: string | null
  price: string | null
  currencyCode: string
  providerId: string | null
  providerName: string | null
  isActive: boolean
}

/**
 * Save status for the wizard
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Context value for the ProductWizard
 */
export type ProductWizardContextValue = {
  // Mode
  mode: ProductWizardMode

  // Loading state
  isLoading: boolean

  // Product state
  product: ProductDraft
  updateProduct: (updates: Partial<ProductDraft>) => void

  // Variants state
  variants: VariantDraft[]
  addVariant: (variant?: Partial<VariantDraft>) => void
  addVariantWithRealId: (realId: string, data: Omit<VariantDraft, 'tempId' | 'realId'>) => void
  updateVariant: (tempId: string, updates: Partial<VariantDraft>) => void
  removeVariant: (tempId: string) => Promise<void>

  // Persistence
  persistedProductId: string | null
  saveStatus: SaveStatus
  saveError: string | null
  isDirty: boolean

  // Actions
  createProduct: () => Promise<string | null>
  updateProductOnServer: (updates?: Partial<ProductDraft>) => Promise<boolean>
  reset: () => void
}

/**
 * Props for ProductWizardProvider
 */
export type ProductWizardProviderProps = {
  children: React.ReactNode
  mode: ProductWizardMode
  productId?: string | null
  onProductCreated?: (productId: string) => void
  onProductUpdated?: (productId: string) => void
  onClose: () => void
}

/**
 * Props for ProductWizardDrawer
 */
export type ProductWizardDrawerProps = {
  open: boolean
  mode: ProductWizardMode
  productId?: string | null
  onClose: () => void
  onProductCreated?: (productId: string) => void
  onProductUpdated?: (productId: string) => void
}
