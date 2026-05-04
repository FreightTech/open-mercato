import { metadata as fetchRatesWorkerMetadata } from '../../workers/fetch-rates.worker'
import {
  FETCH_RATES_QUEUE_NAME,
  buildFetchScheduleId,
  stableUuidFromString,
  syncTimeToCron,
} from '../fetchScheduleService'

describe('fetchScheduleService helpers', () => {
  describe('queue name', () => {
    it('worker metadata.queue equals FETCH_RATES_QUEUE_NAME', () => {
      // The worker file has to keep its metadata as a literal so the module
      // generator's AST extractor can read it. This guards against the two
      // string literals drifting apart.
      expect(fetchRatesWorkerMetadata.queue).toBe(FETCH_RATES_QUEUE_NAME)
    })
  })

  describe('syncTimeToCron', () => {
    it('converts HH:MM to a daily cron expression', () => {
      expect(syncTimeToCron('09:00')).toBe('0 9 * * *')
      expect(syncTimeToCron('14:30')).toBe('30 14 * * *')
      expect(syncTimeToCron('00:00')).toBe('0 0 * * *')
      expect(syncTimeToCron('23:59')).toBe('59 23 * * *')
    })

    it('returns null for missing or malformed input', () => {
      expect(syncTimeToCron(null)).toBeNull()
      expect(syncTimeToCron(undefined)).toBeNull()
      expect(syncTimeToCron('')).toBeNull()
      expect(syncTimeToCron('9:00')).toBeNull()
      expect(syncTimeToCron('24:00')).toBeNull()
      expect(syncTimeToCron('12:60')).toBeNull()
      expect(syncTimeToCron('not a time')).toBeNull()
    })
  })

  describe('stableUuidFromString', () => {
    it('returns a valid RFC 4122 v5-shaped UUID', () => {
      const id = stableUuidFromString('test')
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('is deterministic for the same input', () => {
      expect(stableUuidFromString('a')).toBe(stableUuidFromString('a'))
    })

    it('produces distinct ids for distinct inputs', () => {
      expect(stableUuidFromString('a')).not.toBe(stableUuidFromString('b'))
    })
  })

  describe('buildFetchScheduleId', () => {
    it('namespaces under "currencies:fetch-rates:"', () => {
      const configId = '00000000-0000-0000-0000-000000000001'
      expect(buildFetchScheduleId(configId)).toBe(
        stableUuidFromString(`currencies:fetch-rates:${configId}`),
      )
    })
  })
})
