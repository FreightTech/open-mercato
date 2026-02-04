'use client'

import { useContext } from 'react'
import { ProductWizardContext } from './ProductWizardContext'
import type { ProductWizardContextValue } from '../types/product-wizard'

export function useProductWizardContext(): ProductWizardContextValue {
  const context = useContext(ProductWizardContext)
  if (!context) {
    throw new Error('useProductWizardContext must be used within a ProductWizardProvider')
  }
  return context
}
