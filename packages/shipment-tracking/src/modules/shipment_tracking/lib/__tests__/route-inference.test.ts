import { inferRouteFromEvents, isValidUnlocode } from '../route-inference'
import { parseDcsaEvents } from '../dcsa-event-parser'
import { fixtures } from '../../__tests__/fixtures'

describe('Route Inference', () => {
  describe('inferRouteFromEvents', () => {
    it('should return null values for empty events array', () => {
      const result = inferRouteFromEvents([])

      expect(result.originUnlocode).toBeNull()
      expect(result.destinationUnlocode).toBeNull()
      expect(result.confidence.origin).toBeNull()
      expect(result.confidence.destination).toBeNull()
    })

    describe('Direct voyage (CNYTN -> PLGDN)', () => {
      it('should infer destination from EST ARRI event', () => {
        const events = parseDcsaEvents(fixtures.direct.events, 'MSC')
        const result = inferRouteFromEvents(events)

        expect(result.destinationUnlocode).toBe('PLGDN')
        expect(result.confidence.destination).toBe('high')
      })

      it('should infer origin from first DEPA with exportVoyageNumber', () => {
        const events = parseDcsaEvents(fixtures.direct.events, 'MSC')
        const result = inferRouteFromEvents(events)

        expect(result.originUnlocode).toBe('CNYTN')
        expect(result.confidence.origin).toBe('high')
      })

      it('should match expected route from fixture metadata', () => {
        const events = parseDcsaEvents(fixtures.direct.events, 'MSC')
        const result = inferRouteFromEvents(events)

        expect(result.originUnlocode).toBe(fixtures.direct.origin)
        expect(result.destinationUnlocode).toBe(fixtures.direct.destination)
      })
    })

    describe('Transshipment voyage (CNTAO -> CNNGB -> PLGDN)', () => {
      it('should infer origin from first LOAD at port of loading', () => {
        const events = parseDcsaEvents(fixtures.transshipment.events, 'MSC')
        const result = inferRouteFromEvents(events)

        // Origin should be first port of loading, not transshipment port
        expect(result.originUnlocode).toBe(fixtures.transshipment.origin)
        expect(result.confidence.origin).toBe('high')
      })

      it('should infer destination correctly', () => {
        const events = parseDcsaEvents(fixtures.transshipment.events, 'MSC')
        const result = inferRouteFromEvents(events)

        expect(result.destinationUnlocode).toBe(fixtures.transshipment.destination)
      })
    })

    describe('Completed multi-container transshipment (CRMOB -> BEANR -> PLGDY)', () => {
      it('should infer destination from last ACT ARRI when no EST events', () => {
        const events = parseDcsaEvents(fixtures.multiTransshipCompleted.events, 'MSC')
        const result = inferRouteFromEvents(events)

        // This is a completed voyage - no EST events, should use last ACT ARRI
        expect(result.destinationUnlocode).toBe('PLGDY')
        expect(result.confidence.destination).toBe('high')
      })

      it('should infer origin from first DEPA with exportVoyageNumber', () => {
        const events = parseDcsaEvents(fixtures.multiTransshipCompleted.events, 'MSC')
        const result = inferRouteFromEvents(events)

        // Origin should be CRMOB (port of loading), not CRCAR (inland depot)
        expect(result.originUnlocode).toBe('CRMOB')
        expect(result.confidence.origin).toBe('high')
      })

      it('should match expected route from fixture metadata', () => {
        const events = parseDcsaEvents(fixtures.multiTransshipCompleted.events, 'MSC')
        const result = inferRouteFromEvents(events)

        expect(result.originUnlocode).toBe(fixtures.multiTransshipCompleted.origin)
        expect(result.destinationUnlocode).toBe(fixtures.multiTransshipCompleted.destination)
      })
    })

    describe('Multi-container booking (32 containers)', () => {
      it('should infer route correctly for large booking', () => {
        const events = parseDcsaEvents(fixtures.multiContainer.events, 'MSC')
        const result = inferRouteFromEvents(events)

        // Note: The fixture metadata says CNYTN but actual events show CNDLC (Dalian)
        // The inference correctly identifies the actual port of loading from events
        expect(result.originUnlocode).toBe('CNDLC')
        expect(result.destinationUnlocode).toBe(fixtures.multiContainer.destination)
        expect(result.confidence.origin).toBe('high')
        expect(result.confidence.destination).toBe('high')
      })
    })
  })

  describe('isValidUnlocode', () => {
    it('should return true for valid UN/LOCODEs', () => {
      expect(isValidUnlocode('CNYTN')).toBe(true)
      expect(isValidUnlocode('PLGDN')).toBe(true)
      expect(isValidUnlocode('BEANR')).toBe(true)
      expect(isValidUnlocode('USNYC')).toBe(true)
      expect(isValidUnlocode('SGSIN')).toBe(true)
      expect(isValidUnlocode('DE123')).toBe(true) // 3 digits allowed
      expect(isValidUnlocode('USX1Y')).toBe(true) // mixed alphanumeric
    })

    it('should return false for invalid UN/LOCODEs', () => {
      expect(isValidUnlocode('')).toBe(false)
      expect(isValidUnlocode(null)).toBe(false)
      expect(isValidUnlocode(undefined)).toBe(false)
      expect(isValidUnlocode('CN')).toBe(false) // too short
      expect(isValidUnlocode('CNYTNX')).toBe(false) // too long
      expect(isValidUnlocode('12YTN')).toBe(false) // starts with digits
      expect(isValidUnlocode('C1YTN')).toBe(false) // second char is digit
      expect(isValidUnlocode('cn-ytn')).toBe(false) // invalid chars
    })

    it('should handle lowercase by converting to uppercase', () => {
      expect(isValidUnlocode('cnytn')).toBe(true)
      expect(isValidUnlocode('PlGdN')).toBe(true)
    })
  })
})
