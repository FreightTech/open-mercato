import type { KsefEnvironment } from '../data/types'
import {
  getSendInvoiceUrl,
  getInvoiceStatusUrl,
  getUpoUrl,
  getQueryInvoicesUrl,
  getInvoiceUrl,
} from '../lib/endpoints'
import type {
  KsefSendInvoiceRequest,
  KsefSendInvoiceResponse,
  KsefInvoiceStatusResponse,
  KsefUpoResponse,
  KsefQueryInvoicesRequest,
  KsefQueryInvoicesResponse,
  KsefDownloadInvoiceResponse,
  KsefErrorResponse,
} from '../lib/types'

export class KsefApiError extends Error {
  readonly statusCode: number
  readonly responseBody: string
  readonly ksefError: KsefErrorResponse | null

  constructor(statusCode: number, responseBody: string) {
    let ksefError: KsefErrorResponse | null = null
    let message = `KSeF API error ${statusCode}`

    try {
      ksefError = JSON.parse(responseBody) as KsefErrorResponse
      if (ksefError?.exception?.exceptionDetailList?.length) {
        const details = ksefError.exception.exceptionDetailList
          .map((detail) => `[${detail.exceptionCode}] ${detail.exceptionDescription}`)
          .join('; ')
        message = `KSeF API error ${statusCode}: ${details}`
      }
    } catch {
      message = `KSeF API error ${statusCode}: ${responseBody.slice(0, 500)}`
    }

    super(message)
    this.name = 'KsefApiError'
    this.statusCode = statusCode
    this.responseBody = responseBody
    this.ksefError = ksefError
  }
}

export class KsefClientService {
  private environment: KsefEnvironment
  private accessToken: string | null = null

  constructor(environment: KsefEnvironment) {
    this.environment = environment
  }

  getEnvironment(): KsefEnvironment {
    return this.environment
  }

  setAccessToken(token: string): void {
    this.accessToken = token
  }

  clearAccessToken(): void {
    this.accessToken = null
  }

  hasActiveToken(): boolean {
    return this.accessToken !== null
  }

  async sendInvoice(request: KsefSendInvoiceRequest): Promise<KsefSendInvoiceResponse> {
    this.assertAccessToken()
    const url = getSendInvoiceUrl(this.environment)
    return this.request<KsefSendInvoiceResponse>('POST', url, request)
  }

  async getInvoiceStatus(invoiceHash: string): Promise<KsefInvoiceStatusResponse> {
    this.assertAccessToken()
    const url = getInvoiceStatusUrl(this.environment, invoiceHash)
    return this.request<KsefInvoiceStatusResponse>('GET', url)
  }

  async downloadUpo(): Promise<KsefUpoResponse> {
    this.assertAccessToken()
    const url = getUpoUrl(this.environment)
    return this.request<KsefUpoResponse>('GET', url)
  }

  async queryInvoices(request: KsefQueryInvoicesRequest): Promise<KsefQueryInvoicesResponse> {
    this.assertAccessToken()
    const url = getQueryInvoicesUrl(this.environment)
    return this.request<KsefQueryInvoicesResponse>('POST', url, request)
  }

  async downloadInvoice(invoiceHash: string): Promise<KsefDownloadInvoiceResponse> {
    this.assertAccessToken()
    const url = getInvoiceUrl(this.environment, invoiceHash)
    return this.request<KsefDownloadInvoiceResponse>('GET', url)
  }

  private assertAccessToken(): void {
    if (!this.accessToken) {
      throw new Error('KSeF access token is required. Call setAccessToken() or authenticate first.')
    }
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body)
    }

    let response: Response
    try {
      response = await fetch(url, fetchOptions)
    } catch (err) {
      throw new Error(
        `KSeF API network error (${method} ${url}): ${err instanceof Error ? err.message : 'Connection failed'}`
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new KsefApiError(response.status, errorText)
    }

    const responseText = await response.text()
    if (!responseText || responseText.trim().length === 0) {
      return {} as T
    }

    try {
      return JSON.parse(responseText) as T
    } catch {
      throw new Error(`KSeF API returned invalid JSON from ${method} ${url}: ${responseText.slice(0, 200)}`)
    }
  }
}
