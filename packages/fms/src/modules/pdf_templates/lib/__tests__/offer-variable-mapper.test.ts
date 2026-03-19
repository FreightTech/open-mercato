import { describe, it, expect } from 'vitest'
import {
  mapOfferToInputs,
  settingsToBranding,
  DEFAULT_LABELS,
  type OfferData,
  type BrandingData,
} from '../offer-variable-mapper'

describe('offer-variable-mapper', () => {
  describe('DEFAULT_LABELS', () => {
    it('should have English labels defined', () => {
      expect(DEFAULT_LABELS.labelOffer).toBe('OFFER')
      expect(DEFAULT_LABELS.labelClient).toBe('CLIENT')
      expect(DEFAULT_LABELS.labelValidity).toBe('Valid Until')
    })

    it('should have cargo label defined', () => {
      expect(DEFAULT_LABELS.labelCargo).toBe('Cargo')
      expect(DEFAULT_LABELS.labelCargoType).toBe('Cargo Type')
    })

    it('should have table column labels defined', () => {
      expect(DEFAULT_LABELS.labelLineNumber).toBe('No.')
      expect(DEFAULT_LABELS.labelName).toBe('Name')
      expect(DEFAULT_LABELS.labelQuantity).toBe('Qty')
      expect(DEFAULT_LABELS.labelRate).toBe('Rate')
      expect(DEFAULT_LABELS.labelTotal).toBe('Total')
    })

    it('should have terms and conditions label', () => {
      expect(DEFAULT_LABELS.labelTermsTitle).toBe('TERMS & CONDITIONS')
    })
  })

  describe('mapOfferToInputs', () => {
    const mockBranding: BrandingData = {
      companyName: 'Test Company',
      companyLogoUrl: 'https://example.com/logo.png',
      primaryColor: '#1a365d',
      accentColor: '#f7fafc',
    }

    const createMinimalOffer = (overrides: Partial<OfferData> = {}): OfferData => ({
      id: 'test-id',
      offerNumber: 'OFF-001',
      version: 1,
      status: 'draft',
      createdAt: new Date('2026-03-13'),
      ...overrides,
    })

    it('should return a flat record of strings', () => {
      const offer = createMinimalOffer()
      const result = mapOfferToInputs(offer, mockBranding)

      expect(typeof result).toBe('object')
      Object.values(result).forEach((value) => {
        expect(typeof value).toBe('string')
      })
    })

    it('should map offer number correctly', () => {
      const offer = createMinimalOffer({ offerNumber: 'OFF-TEST-123' })
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.offerNumber).toBe('OFF-TEST-123')
    })

    it('should map company branding correctly', () => {
      const offer = createMinimalOffer()
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.companyName).toBe('Test Company')
      expect(result.companyLogo).toBe('https://example.com/logo.png')
      expect(result.primaryColor).toBe('#1a365d')
    })

    it('should include default labels', () => {
      const offer = createMinimalOffer()
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.labelOffer).toBe('OFFER')
      expect(result.labelClient).toBe('CLIENT')
      expect(result.labelValidity).toBe('Valid Until')
    })

    it('should allow custom labels override', () => {
      const offer = createMinimalOffer()
      const customLabels = { labelOffer: 'QUOTATION', labelClient: 'CUSTOMER' }

      const result = mapOfferToInputs(offer, mockBranding, customLabels)

      expect(result.labelOffer).toBe('QUOTATION')
      expect(result.labelClient).toBe('CUSTOMER')
    })

    it('should format dates correctly', () => {
      const offer = createMinimalOffer({
        createdAt: new Date('2026-03-15'),
        validUntil: new Date('2026-04-15'),
      })
      const result = mapOfferToInputs(offer, mockBranding)

      // Date formatting varies by locale, just check it's not empty and not raw ISO
      expect(result.createdDate).not.toBe('')
      expect(result.createdDate).not.toBe('2026-03-15')
      expect(result.validUntil).not.toBe('')
    })

    it('should handle missing optional fields', () => {
      const offer = createMinimalOffer()
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.clientName).toBe('')
      expect(result.clientAddress).toBe('')
      expect(result.incoterms).toBe('')
      expect(result.cargoDescription).toBe('')
    })

    it('should map client data when provided', () => {
      const offer = createMinimalOffer({
        client: {
          id: 'client-1',
          name: 'Global Shipping Inc',
          address: '123 Port Street\nShipping City, SC 12345',
          taxId: 'TAX-123456',
        },
      })
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.clientName).toBe('Global Shipping Inc')
      expect(result.clientAddress).toBe('123 Port Street\nShipping City, SC 12345')
      expect(result.clientTaxId).toBe('TAX-123456')
    })

    it('should map offer details correctly', () => {
      const offer = createMinimalOffer({
        incoterms: 'FOB',
        cargoDescription: 'Electronics equipment',
        cargoType: 'General cargo',
        currencyCode: 'EUR',
        paymentTerms: 'Net 30',
        customerNotes: 'Handle with care',
      })
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.incoterms).toBe('FOB')
      expect(result.cargoDescription).toBe('Electronics equipment')
      expect(result.cargoType).toBe('General cargo')
      expect(result.currencyCode).toBe('EUR')
      expect(result.paymentTerms).toBe('Net 30')
      expect(result.customerNotes).toBe('Handle with care')
    })

    it('should set isExpired to false for future dates', () => {
      const futureDate = new Date()
      futureDate.setMonth(futureDate.getMonth() + 1)

      const offer = createMinimalOffer({ validUntil: futureDate })
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.isExpired).toBe('false')
    })

    it('should set isExpired to true for past dates', () => {
      const pastDate = new Date()
      pastDate.setMonth(pastDate.getMonth() - 1)

      const offer = createMinimalOffer({ validUntil: pastDate })
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.isExpired).toBe('true')
    })

    it('should use default currency when not provided', () => {
      const offer = createMinimalOffer()
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.currencyCode).toBe('USD')
    })

    it('should format exchange rates', () => {
      const offer = createMinimalOffer()
      const result = mapOfferToInputs(offer, mockBranding, DEFAULT_LABELS, {
        exchangeRates: { EUR: 1.0856, GBP: 0.8542 },
      })

      expect(result.exchangeRates).toContain('EUR')
      expect(result.exchangeRates).toContain('GBP')
    })

    it('should include current date', () => {
      const offer = createMinimalOffer()
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.currentDate).not.toBe('')
    })

    it('should handle routes with lines', () => {
      const offer = createMinimalOffer({
        routes: [
          {
            id: 'route-1',
            routeLabel: 'Shanghai → Rotterdam',
            transportMode: 'sea',
            lines: [
              {
                lineNumber: 1,
                productName: 'Ocean Freight',
                currencyCode: 'USD',
                containerSize: '40HC',
                quantity: 2,
                unitPrice: 1500,
                amount: 3000,
              },
            ],
          },
        ],
      })
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.routesContent).toContain('Shanghai → Rotterdam')
      expect(result.routesContent).toContain('Ocean Freight')
    })

    it('should handle empty routes array', () => {
      const offer = createMinimalOffer({ routes: [] })
      const result = mapOfferToInputs(offer, mockBranding)

      expect(result.routesContent).toBe('')
    })

    it('should use locale for date formatting', () => {
      const offer = createMinimalOffer({
        createdAt: new Date('2026-03-15'),
      })

      const resultEN = mapOfferToInputs(offer, mockBranding, DEFAULT_LABELS, { locale: 'en-US' })
      const resultDE = mapOfferToInputs(offer, mockBranding, DEFAULT_LABELS, { locale: 'de-DE' })

      // Different locales should produce different date formats
      expect(resultEN.createdDate).not.toBe(resultDE.createdDate)
    })
  })

  describe('settingsToBranding', () => {
    it('should convert full email settings to branding data', () => {
      const settings = {
        companyName: 'Acme Corp',
        companyLogoUrl: 'https://example.com/logo.png',
        primaryColor: '#ff0000',
        accentColor: '#00ff00',
      }

      const result = settingsToBranding(settings)

      expect(result.companyName).toBe('Acme Corp')
      expect(result.companyLogoUrl).toBe('https://example.com/logo.png')
      expect(result.primaryColor).toBe('#ff0000')
      expect(result.accentColor).toBe('#00ff00')
    })

    it('should return defaults for null settings', () => {
      const result = settingsToBranding(null)

      expect(result.companyName).toBe('Open Mercato')
      expect(result.primaryColor).toBe('#1a365d')
      expect(result.accentColor).toBe('#f7fafc')
    })

    it('should handle partial settings', () => {
      const settings = {
        companyName: 'Partial Corp',
        // Other fields missing
      }

      const result = settingsToBranding(settings as any)

      expect(result.companyName).toBe('Partial Corp')
      expect(result.companyLogoUrl).toBeUndefined()
    })

    it('should set footer and rules to null', () => {
      const settings = {
        companyName: 'Test',
        companyLogoUrl: null,
        primaryColor: '#123456',
        accentColor: '#654321',
      }

      const result = settingsToBranding(settings)

      expect(result.footerHtml).toBeNull()
      expect(result.rulesAgreementHtml).toBeNull()
      expect(result.coverPageImageUrl).toBeNull()
    })
  })
})
