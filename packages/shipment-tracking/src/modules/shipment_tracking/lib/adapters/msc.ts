import crypto from 'node:crypto'
import fs, { writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { CarrierAdapter, CarrierFetchResult, CarrierAdapterTestResult } from '../carrier-adapter'
import type { TrackingReferenceType } from '../../data/entities'
import { base64UrlEncode } from '../auth/base64url'
import { buildDcsaQueryParams } from '../dcsa-params'
import { parseDcsaEvents } from '../dcsa-event-parser'
import { withCarrierApiSpan } from '../logger'

const TOKEN_URL = 'https://login.microsoftonline.com/088e9b00-ffd0-458e-bfa1-acf4c596d3cb/oauth2/v2.0/token'
const EVENTS_URL = 'https://api.tech.msc.com/msc/trackandtrace/v2.2/events'
const MSC_CLIENT_ID = '6e36f21a-8d25-41f4-95c5-5f2f60b0f35d'
const MSC_SCOPE = 'f96a3d9e-70fc-4cb1-8925-36d921309bdb/.default'
const MSC_AUD = 'https://login.microsoftonline.com/088e9b00-ffd0-458e-bfa1-acf4c596d3cb/oauth2/token'

type MscAuthConfig = {
  certificate_base64: string
}

function getAuth(authConfig: Record<string, unknown> | null | undefined): MscAuthConfig {
  const certBase64 = authConfig?.certificate_base64 as string | undefined
  if (!certBase64) {
    throw new Error('MSC authConfig requires certificate_base64')
  }
  return { certificate_base64: certBase64 }
}

function extractPfxComponents(pfxBuffer: Buffer): { privateKeyPem: string; certPem: string } {
  const tempDir = os.tmpdir()
  const uid = crypto.randomUUID()
  const pfxPath = path.join(tempDir, `msc_${uid}.pfx`)
  const certPath = path.join(tempDir, `msc_cert_${uid}.pem`)
  const keyPath = path.join(tempDir, `msc_key_${uid}.pem`)

  try {
    fs.writeFileSync(pfxPath, pfxBuffer)

    execFileSync('openssl', ['pkcs12', '-in', pfxPath, '-nokeys', '-out', certPath, '-passin', 'pass:'])
    execFileSync('openssl', ['pkcs12', '-in', pfxPath, '-nocerts', '-nodes', '-out', keyPath, '-passin', 'pass:'])

    const certPem = fs.readFileSync(certPath, 'utf8')
    const privateKeyPem = fs.readFileSync(keyPath, 'utf8')

    return { privateKeyPem, certPem }
  } finally {
    for (const filePath of [pfxPath, certPath, keyPath]) {
      try { fs.unlinkSync(filePath) } catch { /* ignore cleanup errors */ }
    }
  }
}

function createMscJwt(auth: MscAuthConfig): string {
  const pfxBuffer = Buffer.from(auth.certificate_base64, 'base64')
  const { privateKeyPem, certPem } = extractPfxComponents(pfxBuffer)

  // Extract the last certificate from the chain for x5t thumbprint
  const certMatches = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
  if (!certMatches?.length) {
    throw new Error('No certificates found in PFX')
  }

  const lastCert = certMatches[certMatches.length - 1]
  const certDerBase64 = lastCert
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\r?\n/g, '')
    .trim()

  const certDer = Buffer.from(certDerBase64, 'base64')
  const sha1Hash = crypto.createHash('sha1').update(certDer).digest()
  const x5t = base64UrlEncode(sha1Hash)

  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT', x5t }
  const payload = {
    aud: MSC_AUD,
    exp: now + 120,
    iss: MSC_CLIENT_ID,
    jti: crypto.randomUUID(),
    nbf: now,
    sub: MSC_CLIENT_ID,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(unsignedToken)
  const signature = sign.sign(privateKeyPem)
  const encodedSignature = base64UrlEncode(signature)

  return `${unsignedToken}.${encodedSignature}`
}

async function authenticate(auth: MscAuthConfig): Promise<string> {
  return withCarrierApiSpan(
    { carrierCode: 'msc', operation: 'authenticate' },
    async (span) => {
      const jwt = createMscJwt(auth)

      const body = new URLSearchParams({
        client_id: MSC_CLIENT_ID,
        client_assertion: jwt,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        scope: MSC_SCOPE,
        grant_type: 'client_credentials',
      })

      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })

      span.setAttribute('http.status_code', response.status)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown')
        throw new Error(`MSC token request failed (${response.status}): ${errorText}`)
      }

      const data = await response.json() as { access_token: string }
      return data.access_token
    },
  )
}

export class MscAdapter implements CarrierAdapter {
  readonly carrierCode = 'msc'
  readonly supportedReferenceTypes: TrackingReferenceType[] = ['container', 'booking', 'bol']

  async fetchEvents(input: {
    referenceType: TrackingReferenceType
    referenceValue: string
    apiEndpoint?: string | null
    authConfig?: Record<string, unknown> | null
  }): Promise<CarrierFetchResult> {
    return withCarrierApiSpan(
      {
        carrierCode: this.carrierCode,
        operation: 'fetchEvents',
        referenceType: input.referenceType,
        referenceValue: input.referenceValue,
      },
      async (span) => {
        const auth = getAuth(input.authConfig)
        const token = await authenticate(auth)
        const params = buildDcsaQueryParams(input.referenceValue, input.referenceType)
        const url = `${input.apiEndpoint || EVENTS_URL}?${params}`

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })

        span.setAttribute('http.status_code', response.status)

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown')
          throw new Error(`MSC API error (${response.status}): ${errorText}`)
        }

        const data = await response.json()
        const events = parseDcsaEvents(data, 'MSC')

        span.setAttribute('events.count', events.length)
        return { events }
      },
    )
  }

  async testConnection(input: {
    apiEndpoint?: string | null
    authConfig?: Record<string, unknown> | null
  }): Promise<CarrierAdapterTestResult> {
    const start = Date.now()
    try {
      const auth = getAuth(input.authConfig)
      await authenticate(auth)
      return { success: true, message: 'MSC authentication successful', latencyMs: Date.now() - start }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, message: `MSC connection failed: ${message}`, latencyMs: Date.now() - start }
    }
  }
}
