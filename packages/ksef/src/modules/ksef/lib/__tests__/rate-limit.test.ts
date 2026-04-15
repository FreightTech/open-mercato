/** @jest-environment node */
import { parseKsefRetryMs, ksefFetchWithRetry } from '../rate-limit'

// ═══════════════════════════════════════════════════════════════════════════
// parseKsefRetryMs
// ═══════════════════════════════════════════════════════════════════════════

describe('parseKsefRetryMs', () => {
  it('parses minutes and seconds', () => {
    const body = '{"status":{"code":429,"description":"Too Many Requests","details":["Przekroczono limit 20 żądań na godzinę. Spróbuj ponownie po 5 minutach i 51 sekundach."]}}'
    expect(parseKsefRetryMs(body)).toBe((5 * 60 + 51) * 1000)
  })

  it('parses minutes and seconds (different grammatical form)', () => {
    expect(parseKsefRetryMs('Spróbuj ponownie po 3 minuty i 20 sekund.')).toBe((3 * 60 + 20) * 1000)
  })

  it('parses single minute with diacritic (minutę)', () => {
    expect(parseKsefRetryMs('Spróbuj ponownie po 1 minutę i 5 sekundach.')).toBe((1 * 60 + 5) * 1000)
  })

  it('parses minutes only (minutach)', () => {
    expect(parseKsefRetryMs('Spróbuj ponownie po 10 minutach.')).toBe(10 * 60 * 1000)
  })

  it('parses minutes only (minuty)', () => {
    expect(parseKsefRetryMs('po 2 minuty')).toBe(2 * 60 * 1000)
  })

  it('parses seconds only (sekundach)', () => {
    expect(parseKsefRetryMs('Spróbuj ponownie po 45 sekundach.')).toBe(45 * 1000)
  })

  it('parses seconds only (sekund)', () => {
    expect(parseKsefRetryMs('po 30 sekund')).toBe(30 * 1000)
  })

  it('parses seconds only (sekundy)', () => {
    expect(parseKsefRetryMs('po 2 sekundy')).toBe(2 * 1000)
  })

  it('parses 0 minutes and N seconds', () => {
    expect(parseKsefRetryMs('po 0 minutach i 30 sekundach')).toBe(30 * 1000)
  })

  it('parses large values (59 min 59 sec)', () => {
    expect(parseKsefRetryMs('po 59 minutach i 59 sekundach')).toBe((59 * 60 + 59) * 1000)
  })

  // Real KSeF error format variations (per limity-api.md):
  // "Przekroczono limit 20 żądań na minutę. Spróbuj ponownie po 30 sekundach."
  // "Przekroczono limit 20 żądań na godzinę. Spróbuj ponownie po 5 minutach i 51 sekundach."

  it('parses the exact per-minute limit message from KSeF docs', () => {
    const body = JSON.stringify({
      status: {
        code: 429,
        description: 'Too Many Requests',
        details: ['Przekroczono limit 20 żądań na minutę. Spróbuj ponownie po 30 sekundach.'],
      },
    })
    expect(parseKsefRetryMs(body)).toBe(30 * 1000)
  })

  it('parses the exact per-hour limit message from KSeF docs', () => {
    const body = JSON.stringify({
      status: {
        code: 429,
        description: 'Too Many Requests',
        details: ['Przekroczono limit 20 żądań na godzinę. Spróbuj ponownie po 5 minutach i 51 sekundach.'],
      },
    })
    expect(parseKsefRetryMs(body)).toBe((5 * 60 + 51) * 1000)
  })

  it('parses per-second limit message', () => {
    const body = JSON.stringify({
      status: {
        code: 429,
        description: 'Too Many Requests',
        details: ['Przekroczono limit 8 żądań na sekundę. Spróbuj ponownie po 1 sekundach.'],
      },
    })
    expect(parseKsefRetryMs(body)).toBe(1 * 1000)
  })

  it('returns null for English text', () => {
    expect(parseKsefRetryMs('Try again after 5 minutes')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseKsefRetryMs('')).toBeNull()
  })

  it('returns null for JSON without retry info', () => {
    expect(parseKsefRetryMs('{"error": "something"}')).toBeNull()
  })

  it('returns null for unrelated Polish text', () => {
    expect(parseKsefRetryMs('Faktura została przyjęta do przetwarzania')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ksefFetchWithRetry
// ═══════════════════════════════════════════════════════════════════════════

describe('ksefFetchWithRetry', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('passes through a successful response without retrying', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof globalThis.fetch

    const response = await ksefFetchWithRetry('https://test.ksef.mf.gov.pl/api/test', { method: 'GET' })
    expect(response.status).toBe(200)
    expect(calls).toBe(1)
  })

  it('passes through non-429 errors without retrying', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response('Forbidden', { status: 403 })
    }) as typeof globalThis.fetch

    const response = await ksefFetchWithRetry('https://test.ksef.mf.gov.pl/api/test', { method: 'GET' })
    expect(response.status).toBe(403)
    expect(calls).toBe(1)
  })

  it('retries on 429 and eventually succeeds', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      if (calls <= 2) {
        return new Response('rate limited', { status: 429 })
      }
      return new Response('ok', { status: 200 })
    }) as typeof globalThis.fetch

    const response = await ksefFetchWithRetry(
      'https://test.ksef.mf.gov.pl/api/test',
      { method: 'GET' },
      { maxWaitMs: 10 }, // very short wait for testing
    )
    expect(response.status).toBe(200)
    expect(calls).toBe(3)
  })

  it('gives up after maxRetries and returns the 429 response', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response('rate limited', { status: 429 })
    }) as typeof globalThis.fetch

    const response = await ksefFetchWithRetry(
      'https://test.ksef.mf.gov.pl/api/test',
      { method: 'GET' },
      { maxRetries: 2, maxWaitMs: 10 },
    )
    expect(response.status).toBe(429)
    // initial attempt + 2 retries = 3 calls
    expect(calls).toBe(3)
  })

  it('respects Retry-After header (delta-seconds form)', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': '0' }, // 0 seconds — immediate retry
        })
      }
      return new Response('ok', { status: 200 })
    }) as typeof globalThis.fetch

    const start = Date.now()
    const response = await ksefFetchWithRetry(
      'https://test.ksef.mf.gov.pl/api/test',
      { method: 'GET' },
    )
    expect(response.status).toBe(200)
    expect(calls).toBe(2)
    // With Retry-After: 0, the wait should be essentially instant
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('parses KSeF Polish response body for wait time', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            status: {
              code: 429,
              description: 'Too Many Requests',
              details: ['Spróbuj ponownie po 0 minutach i 0 sekundach.'],
            },
          }),
          { status: 429 },
        )
      }
      return new Response('ok', { status: 200 })
    }) as typeof globalThis.fetch

    const response = await ksefFetchWithRetry(
      'https://test.ksef.mf.gov.pl/api/test',
      { method: 'GET' },
      { maxWaitMs: 100 },
    )
    expect(response.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('calls onRetry callback before each retry', async () => {
    let calls = 0
    const retryLog: Array<{ attempt: number; waitMs: number }> = []
    globalThis.fetch = (async () => {
      calls++
      if (calls <= 2) {
        return new Response('rate limited', { status: 429 })
      }
      return new Response('ok', { status: 200 })
    }) as typeof globalThis.fetch

    await ksefFetchWithRetry(
      'https://test.ksef.mf.gov.pl/api/test',
      { method: 'GET' },
      {
        maxWaitMs: 10,
        onRetry: (attempt, waitMs) => {
          retryLog.push({ attempt, waitMs })
        },
      },
    )
    expect(retryLog).toHaveLength(2)
    expect(retryLog[0]!.attempt).toBe(0)
    expect(retryLog[1]!.attempt).toBe(1)
  })

  it('caps wait time at maxWaitMs', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        // KSeF says wait 10 minutes — but our max is 50ms
        return new Response(
          JSON.stringify({
            status: { code: 429, details: ['Spróbuj ponownie po 10 minutach.'] },
          }),
          { status: 429 },
        )
      }
      return new Response('ok', { status: 200 })
    }) as typeof globalThis.fetch

    const start = Date.now()
    await ksefFetchWithRetry(
      'https://test.ksef.mf.gov.pl/api/test',
      { method: 'GET' },
      { maxWaitMs: 50 },
    )
    // Should have waited ~50ms, not 10 minutes
    expect(Date.now() - start).toBeLessThan(2000)
    expect(calls).toBe(2)
  })

  it('defaults to 3 retries when maxRetries is not specified', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response('rate limited', { status: 429 })
    }) as typeof globalThis.fetch

    await ksefFetchWithRetry(
      'https://test.ksef.mf.gov.pl/api/test',
      { method: 'GET' },
      { maxWaitMs: 10 },
    )
    // initial + 3 retries = 4
    expect(calls).toBe(4)
  })

  it('propagates network errors without retrying', async () => {
    globalThis.fetch = (async () => {
      throw new Error('Network unreachable')
    }) as typeof globalThis.fetch

    await expect(
      ksefFetchWithRetry('https://test.ksef.mf.gov.pl/api/test', { method: 'GET' }),
    ).rejects.toThrow('Network unreachable')
  })

  it('handles async onRetry callback', async () => {
    let calls = 0
    let asyncCallbackExecuted = false
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response('rate limited', { status: 429 })
      }
      return new Response('ok', { status: 200 })
    }) as typeof globalThis.fetch

    await ksefFetchWithRetry(
      'https://test.ksef.mf.gov.pl/api/test',
      { method: 'GET' },
      {
        maxWaitMs: 10,
        onRetry: async () => {
          asyncCallbackExecuted = true
        },
      },
    )
    expect(asyncCallbackExecuted).toBe(true)
  })
})
