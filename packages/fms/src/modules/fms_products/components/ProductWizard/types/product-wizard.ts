/**
 * Draft state for the product being created
 */
export type ProductDraft = {
  id: string | null
  name: string
  chargeCodeId: string | null
  chargeCodeName: string | null
  chargeCodeCode: string | null
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
 * Draft state for variants being created
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
  priceTypeId: string | null
  priceTypeName: string | null
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
  // Product state
  product: ProductDraft
  updateProduct: (updates: Partial<ProductDraft>) => void

  // Variants state
  variants: VariantDraft[]
  addVariant: (variant?: Partial<VariantDraft>) => void
  updateVariant: (tempId: string, updates: Partial<VariantDraft>) => void
  removeVariant: (tempId: string) => void

  // Persistence
  persistedProductId: string | null
  saveStatus: SaveStatus
  saveError: string | null
  isDirty: boolean

  // Actions
  createProduct: () => Promise<string | null>
  saveVariants: () => Promise<void>
  reset: () => void
}

/**
 * Props for ProductWizardProvider
 */
export type ProductWizardProviderProps = {
  children: React.ReactNode
  onProductCreated?: (productId: string) => void
  onClose: () => void
}

/**
 * Props for ProductWizardDrawer
 */
export type ProductWizardDrawerProps = {
  open: boolean
  onClose: () => void
  onProductCreated?: (productId: string) => void
}
