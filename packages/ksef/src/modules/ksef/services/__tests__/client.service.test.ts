/** @jest-environment node */
import {
  KsefApiError,
  KsefClientService,
  parseRetryAfterMs,
  jitteredBackoffMs,
} from '../client.service'

describe('parseRetryAfterMs', () => {
  it('returns null for missing values', () => {
    expect(parseRetryAfterMs(null)).toBeNull()
    expect(parseRetryAfterMs(undefined)).toBeNull()
    expect(parseRetryAfterMs('')).toBeNull()
    expect(parseRetryAfterMs('   ')).toBeNull()
  })

  it('parses an integer delta-seconds value', () => {
    expect(parseRetryAfterMs('5')).toBe(5000)
    expect(parseRetryAfterMs('0')).toBe(0)
    expect(parseRetryAfterMs('120')).toBe(120_000)
  })

  it('parses an HTTP-date form and returns the future offset in ms', () => {
    const future = new Date(Date.now() + 30_000).toUTCString()
    const ms = parseRetryAfterMs(future)
    expect(ms).not.toBeNull()
    // Allow some slack — the test clock may advance between parse calls.
    expect(ms!).toBeGreaterThanOrEqual(25_000)
    expect(ms!).toBeLessThanOrEqual(31_000)
  })

  it('clamps past HTTP-dates to 0', () => {
    const past = new Date(Date.now() - 60_000).toUTCString()
    expect(parseRetryAfterMs(past)).toBe(0)
  })

  it('returns null for unparseable garbage', () => {
    expect(parseRetryAfterMs('later')).toBeNull()
  })
})

describe('jitteredBackoffMs', () => {
  it('scales exponentially with ±25% jitter around the base', () => {
    // attempt 0 → base 500ms, attempt 3 → base 4000ms
    for (const [attempt, base] of [[0, 500], [1, 1000], [2, 2000], [3, 4000]] as const) {
      for (let iter = 0; iter < 50; iter++) {
        const value = jitteredBackoffMs(attempt)
        expect(value).toBeGreaterThanOrEqual(Math.floor(base * 0.75))
        expect(value).toBeLessThanOrEqual(Math.ceil(base * 1.25))
      }
    }
  })
})

describe('KsefClientService — 429 Retry-After behaviour', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('retries on 429 honouring Retry-After and eventually succeeds', async () => {
    const client = new KsefClientService('test')
    client.setAccessToken('fake-token')

    let call = 0
    globalThis.fetch = (async () => {
      call += 1
      if (call === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '0' }, // 0s — immediate retry
        })
      }
      return new Response(JSON.stringify({ valid: 'TWybor1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof globalThis.fetch

    const result = await client.queryInvoices({
      queryCriteria: { subjectType: 'subject1', type: 'incremental' },
    } as never)
    expect(call).toBe(2)
    expect((result as { valid: string }).valid).toBe('TWybor1')
  })

  it('gives up after MAX_429_RETRIES consecutive 429 responses', async () => {
    const client = new KsefClientService('test')
    client.setAccessToken('fake-token')

    let call = 0
    globalThis.fetch = (async () => {
      call += 1
      return new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '0' },
      })
    }) as typeof globalThis.fetch

    await expect(
      client.queryInvoices({
        queryCriteria: { subjectType: 'subject1', type: 'incremental' },
      } as never),
    ).rejects.toBeInstanceOf(KsefApiError)
    // Initial attempt + MAX_429_RETRIES retries.
    expect(call).toBe(5)
  })

  it('propagates non-429 errors without retrying', async () => {
    const client = new KsefClientService('test')
    client.setAccessToken('fake-token')

    let call = 0
    globalThis.fetch = (async () => {
      call += 1
      return new Response(
        JSON.stringify({
          exception: {
            serviceCtx: 'test',
            serviceCode: 'E',
            serviceName: 'svc',
            timestamp: new Date().toISOString(),
            exceptionDetailList: [{ exceptionCode: 21010, exceptionDescription: 'Forbidden' }],
          },
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof globalThis.fetch

    await expect(
      client.queryInvoices({
        queryCriteria: { subjectType: 'subject1', type: 'incremental' },
      } as never),
    ).rejects.toBeInstanceOf(KsefApiError)
    expect(call).toBe(1)
  })
})
