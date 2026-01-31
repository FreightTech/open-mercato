/**
 * REGON (GUS BIR) API Service
 *
 * Provides server-side integration with the Polish REGON API for:
 * - Company lookup by NIP (tax ID) or REGON number
 * - Fetching company details including name, address, and registration data
 *
 * API Key is kept server-side to protect it from client exposure.
 * The service uses SOAP 1.2 protocol over HTTPS.
 */

import { XMLParser } from 'fast-xml-parser'

// API URLs for production and test environments
const REGON_API_URL_PROD = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc'
const REGON_API_URL_TEST = 'https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc'

// Well-known test API key (public, for testing purposes)
const REGON_TEST_API_KEY = 'abcde12345abcde12345'

const SOAP_ACTION_LOGIN = 'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj'
const SOAP_ACTION_SEARCH = 'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty'
const SOAP_ACTION_FULL_REPORT = 'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DanePobierzPelnyRaport'
const SOAP_ACTION_LOGOUT = 'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Wyloguj'

const SESSION_EXPIRY_MS = 55 * 60 * 1000 // 55 minutes (session lasts 60 min, refresh early)

export interface RegonCompanyData {
  regon: string
  nip: string
  krs?: string | null
  name: string
  shortName?: string | null
  street?: string | null
  buildingNumber?: string | null
  apartmentNumber?: string | null
  postalCode?: string | null
  city?: string | null
  voivodeship?: string | null
  country?: string | null
  legalForm?: string | null
  registrationDate?: string | null
  pkdMainCode?: string | null
  pkdMainDescription?: string | null
}

export interface RegonLookupResult {
  available: boolean
  company: RegonCompanyData | null
  error?: string
}

interface SessionState {
  sessionId: string
  createdAt: number
}

export class RegonApiService {
  private apiKey: string
  private apiUrl: string
  private session: SessionState | null = null
  private parser: XMLParser

  constructor() {
    // Use test environment if REGON_API_ENV=test, otherwise production
    const isTestEnv = process.env.REGON_API_ENV === 'test'

    if (isTestEnv) {
      // Test environment uses well-known public test key
      this.apiKey = REGON_TEST_API_KEY
      this.apiUrl = REGON_API_URL_TEST
      console.log('[REGON] Using TEST environment:', this.apiUrl)
    } else {
      // Production environment requires API key
      const apiKey = process.env.REGON_API_KEY
      if (!apiKey) {
        throw new Error('REGON_API_KEY environment variable is not set (or set REGON_API_ENV=test for test mode)')
      }
      this.apiKey = apiKey
      this.apiUrl = REGON_API_URL_PROD
      console.log('[REGON] Using PRODUCTION environment:', this.apiUrl)
    }

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseTagValue: true,
      trimValues: true,
      removeNSPrefix: true,
    })
  }

  /**
   * Check if the service is available (API key is configured or test mode)
   */
  static isAvailable(): boolean {
    return process.env.REGON_API_ENV === 'test' || !!process.env.REGON_API_KEY
  }

  /**
   * Search for a company by NIP (tax ID)
   */
  async searchByNip(nip: string): Promise<RegonCompanyData | null> {
    const cleanNip = nip.replace(/[^0-9]/g, '')
    if (cleanNip.length !== 10) {
      throw new Error('Invalid NIP format. NIP must be 10 digits.')
    }

    return this.search({ nip: cleanNip })
  }

  /**
   * Search for a company by REGON number
   */
  async searchByRegon(regon: string): Promise<RegonCompanyData | null> {
    const cleanRegon = regon.replace(/[^0-9]/g, '')
    if (cleanRegon.length !== 9 && cleanRegon.length !== 14) {
      throw new Error('Invalid REGON format. REGON must be 9 or 14 digits.')
    }

    return this.search({ regon: cleanRegon })
  }

  private async search(params: { nip?: string; regon?: string }): Promise<RegonCompanyData | null> {
    const sessionId = await this.ensureSession()

    const searchBody = this.buildSearchEnvelope(sessionId, params)
    const response = await this.soapRequest(SOAP_ACTION_SEARCH, searchBody, sessionId)

    const parsed = this.parser.parse(response)
    const searchResult = this.extractSearchResult(parsed)

    if (!searchResult) {
      return null
    }

    // Get full report for more details
    const fullReport = await this.getFullReport(sessionId, searchResult.regon, searchResult.type)

    return this.mergeResults(searchResult, fullReport)
  }

  private async ensureSession(): Promise<string> {
    if (this.session && Date.now() - this.session.createdAt < SESSION_EXPIRY_MS) {
      console.log('[REGON] Reusing existing session')
      return this.session.sessionId
    }

    console.log('[REGON] Creating new session...')
    console.log('[REGON] API URL:', this.apiUrl)
    console.log('[REGON] API Key (first 10 chars):', this.apiKey.substring(0, 10) + '...')

    const loginBody = this.buildLoginEnvelope()
    const response = await this.soapRequest(SOAP_ACTION_LOGIN, loginBody)

    console.log('[REGON] Raw login response:', response.substring(0, 500))

    const parsed = this.parser.parse(response)
    console.log('[REGON] Parsed XML structure:', JSON.stringify(parsed, null, 2).substring(0, 1000))

    const sessionId = this.extractSessionId(parsed)
    console.log('[REGON] Extracted session ID:', sessionId)

    if (!sessionId) {
      throw new Error('Failed to obtain REGON API session')
    }

    this.session = {
      sessionId,
      createdAt: Date.now(),
    }

    console.log('[REGON] Session created successfully')
    return sessionId
  }

  private async soapRequest(action: string, body: string, sessionId?: string): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      SOAPAction: action,
    }

    if (sessionId) {
      headers.sid = sessionId
    }

    console.log('[REGON] SOAP Request to:', this.apiUrl)
    console.log('[REGON] SOAP Action:', action)

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers,
      body,
    })

    console.log('[REGON] HTTP Response status:', response.status, response.statusText)

    if (!response.ok) {
      const errorBody = await response.text()
      console.log('[REGON] Error response body:', errorBody.substring(0, 500))
      throw new Error(`REGON API error: ${response.status} ${response.statusText}`)
    }

    const responseText = await response.text()

    // Extract XML from MTOM/XOP multipart response if present
    return this.extractXmlFromResponse(responseText)
  }

  /**
   * Extract SOAP XML from potentially MTOM/XOP multipart response
   * The REGON API may return responses wrapped in MIME multipart format
   */
  private extractXmlFromResponse(responseText: string): string {
    const trimmed = responseText.trim()

    // Check if response is a MIME multipart (MTOM/XOP) response
    // Response may start with newlines before the MIME boundary
    if (trimmed.startsWith('--') || responseText.includes('Content-ID:')) {
      console.log('[REGON] Detected MTOM/XOP multipart response')

      // Find the XML envelope within the multipart response
      const envelopeStart = responseText.indexOf('<s:Envelope')
      if (envelopeStart === -1) {
        // Try alternate namespace prefix
        const altStart = responseText.indexOf('<soap:Envelope')
        if (altStart !== -1) {
          const altEnd = responseText.indexOf('</soap:Envelope>')
          if (altEnd !== -1) {
            const xml = responseText.substring(altStart, altEnd + '</soap:Envelope>'.length)
            console.log('[REGON] Extracted XML from MTOM response (soap: prefix)')
            return xml
          }
        }
        console.log('[REGON] Could not find SOAP Envelope in MTOM response')
        return responseText
      }

      const envelopeEnd = responseText.indexOf('</s:Envelope>')
      if (envelopeEnd !== -1) {
        const xml = responseText.substring(envelopeStart, envelopeEnd + '</s:Envelope>'.length)
        console.log('[REGON] Extracted XML from MTOM response (s: prefix)')
        return xml
      }
    }

    // Response is already plain XML
    return responseText
  }

  private buildLoginEnvelope(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${this.apiUrl}</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj</wsa:Action>
  </soap:Header>
  <soap:Body>
    <ns:Zaloguj>
      <ns:pKluczUzytkownika>${this.escapeXml(this.apiKey)}</ns:pKluczUzytkownika>
    </ns:Zaloguj>
  </soap:Body>
</soap:Envelope>`
  }

  private buildSearchEnvelope(sessionId: string, params: { nip?: string; regon?: string }): string {
    let searchParams = ''
    if (params.nip) {
      searchParams = `<dat:Nip>${this.escapeXml(params.nip)}</dat:Nip>`
    } else if (params.regon) {
      searchParams = `<dat:Regon>${this.escapeXml(params.regon)}</dat:Regon>`
    }

    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${this.apiUrl}</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty</wsa:Action>
  </soap:Header>
  <soap:Body>
    <ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        ${searchParams}
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>
  </soap:Body>
</soap:Envelope>`
  }

  private buildFullReportEnvelope(regon: string, reportName: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${this.apiUrl}</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DanePobierzPelnyRaport</wsa:Action>
  </soap:Header>
  <soap:Body>
    <ns:DanePobierzPelnyRaport>
      <ns:pRegon>${this.escapeXml(regon)}</ns:pRegon>
      <ns:pNazwaRaportu>${this.escapeXml(reportName)}</ns:pNazwaRaportu>
    </ns:DanePobierzPelnyRaport>
  </soap:Body>
</soap:Envelope>`
  }

  private extractSessionId(parsed: Record<string, unknown>): string | null {
    try {
      console.log('[REGON] extractSessionId - Top-level keys:', Object.keys(parsed))

      const envelope = parsed['Envelope']
      if (!envelope) {
        console.log('[REGON] extractSessionId - No Envelope found')
        return null
      }
      console.log('[REGON] extractSessionId - Envelope keys:', Object.keys(envelope as object))

      const body = (envelope as Record<string, unknown>)['Body']
      if (!body) {
        console.log('[REGON] extractSessionId - No Body found')
        return null
      }
      console.log('[REGON] extractSessionId - Body keys:', Object.keys(body as object))

      const response = (body as Record<string, unknown>)['ZalogujResponse']
      if (!response) {
        console.log('[REGON] extractSessionId - No ZalogujResponse found')
        return null
      }
      console.log('[REGON] extractSessionId - ZalogujResponse keys:', Object.keys(response as object))

      const result = (response as Record<string, unknown>)['ZalogujResult']
      console.log('[REGON] extractSessionId - ZalogujResult:', result, 'type:', typeof result)

      if (typeof result === 'string' && result.length > 0) {
        return result
      }

      return null
    } catch (err) {
      console.log('[REGON] extractSessionId - Error:', err)
      return null
    }
  }

  private extractSearchResult(parsed: Record<string, unknown>): { regon: string; type: string; basicData: Record<string, unknown> } | null {
    try {
      const envelope = parsed['Envelope']
      if (!envelope) return null

      const body = (envelope as Record<string, unknown>)['Body']
      if (!body) return null

      const response = (body as Record<string, unknown>)['DaneSzukajPodmiotyResponse']
      if (!response) return null

      const resultXml = (response as Record<string, unknown>)['DaneSzukajPodmiotyResult']
      if (typeof resultXml !== 'string' || !resultXml.trim()) return null

      // Parse the inner XML
      const innerParsed = this.parser.parse(resultXml)
      const root = innerParsed.root ?? innerParsed
      const dane = root.dane ?? root

      if (!dane) return null

      // Handle both single result and array
      const firstDane = Array.isArray(dane) ? dane[0] : dane

      const regon = String(firstDane.Regon ?? firstDane.regon ?? '')
      const type = String(firstDane.Typ ?? firstDane.typ ?? 'P') // P = prawna (legal entity), F = fizyczna (natural person)

      if (!regon) return null

      return {
        regon,
        type,
        basicData: firstDane,
      }
    } catch {
      return null
    }
  }

  private async getFullReport(sessionId: string, regon: string, type: string): Promise<Record<string, unknown> | null> {
    // Determine report name based on entity type and REGON length
    let reportName: string
    if (type === 'P' || type === 'LP') {
      // Legal entity
      reportName = 'BIR11OsPrawna'
    } else if (type === 'F' || type === 'LF') {
      // Natural person / sole proprietor
      if (regon.length === 14) {
        reportName = 'BIR11OsFizycznaDzworcentowka'
      } else {
        reportName = 'BIR11OsFizycznaCeidg'
      }
    } else {
      reportName = 'BIR11OsPrawna'
    }

    try {
      const reportBody = this.buildFullReportEnvelope(regon, reportName)
      const response = await this.soapRequest(SOAP_ACTION_FULL_REPORT, reportBody, sessionId)
      const parsed = this.parser.parse(response)

      return this.extractFullReportResult(parsed)
    } catch {
      // Fall back to basic search data if full report fails
      return null
    }
  }

  private extractFullReportResult(parsed: Record<string, unknown>): Record<string, unknown> | null {
    try {
      const envelope = parsed['Envelope']
      if (!envelope) return null

      const body = (envelope as Record<string, unknown>)['Body']
      if (!body) return null

      const response = (body as Record<string, unknown>)['DanePobierzPelnyRaportResponse']
      if (!response) return null

      const resultXml = (response as Record<string, unknown>)['DanePobierzPelnyRaportResult']
      if (typeof resultXml !== 'string' || !resultXml.trim()) return null

      const innerParsed = this.parser.parse(resultXml)
      const root = innerParsed.root ?? innerParsed
      const dane = root.dane ?? root

      if (!dane) return null

      return Array.isArray(dane) ? dane[0] : dane
    } catch {
      return null
    }
  }

  private mergeResults(
    searchResult: { regon: string; type: string; basicData: Record<string, unknown> },
    fullReport: Record<string, unknown> | null
  ): RegonCompanyData {
    const basic = searchResult.basicData
    const full = fullReport ?? {}

    // Field mappings from REGON API response
    const getValue = (keys: string[]): string | null => {
      for (const key of keys) {
        const val = (full[key] ?? basic[key]) as string | undefined
        if (val && String(val).trim()) {
          return String(val).trim()
        }
      }
      return null
    }

    const regon = searchResult.regon
    const nip = getValue(['praw_nip', 'fiz_nip', 'Nip', 'nip']) ?? ''

    // Company name - try various fields
    const name = getValue([
      'praw_nazwa',
      'fiz_nazwa',
      'Nazwa',
      'nazwa',
      'praw_nazwaSkrocona',
      'fiz_nazwaSkrocona',
    ]) ?? ''

    const shortName = getValue(['praw_nazwaSkrocona', 'fiz_nazwaSkrocona', 'NazwaSkrocona', 'nazwaSkrocona'])

    // Address fields
    const street = getValue([
      'praw_adSiedzUlica_Nazwa',
      'fiz_adSiedzUlica_Nazwa',
      'AdsiedZulica_Nazwa',
      'Ulica',
      'ulica',
    ])

    const buildingNumber = getValue([
      'praw_adSiedzNumerNieruchomosci',
      'fiz_adSiedzNumerNieruchomosci',
      'AdsiedZnumerNieruchomosci',
      'NrNieruchomosci',
      'nrNieruchomosci',
    ])

    const apartmentNumber = getValue([
      'praw_adSiedzNumerLokalu',
      'fiz_adSiedzNumerLokalu',
      'AdsiedZnumerLokalu',
      'NrLokalu',
      'nrLokalu',
    ])

    const postalCode = getValue([
      'praw_adSiedzKodPocztowy',
      'fiz_adSiedzKodPocztowy',
      'AdsiedZkodPocztowy',
      'KodPocztowy',
      'kodPocztowy',
    ])

    const city = getValue([
      'praw_adSiedzMiejscowosc_Nazwa',
      'fiz_adSiedzMiejscowosc_Nazwa',
      'AdsiedZmiejscowosc_Nazwa',
      'Miejscowosc',
      'miejscowosc',
    ])

    const voivodeship = getValue([
      'praw_adSiedzWojewodztwo_Nazwa',
      'fiz_adSiedzWojewodztwo_Nazwa',
      'AdsiedZwojewodztwo_Nazwa',
      'Wojewodztwo',
      'wojewodztwo',
    ])

    const krs = getValue(['praw_numerWRejestrzeEwidencji', 'praw_numerKRS'])

    const registrationDate = getValue([
      'praw_dataWpisuDoREGON',
      'fiz_dataWpisuCeidg',
      'DataWpisuDoREGON',
      'dataWpisuDoREGON',
    ])

    const pkdMainCode = getValue([
      'praw_pkdPrzewazajacy_Kod',
      'fiz_pkdPrzewazajacy_Kod',
      'PkdPrzewazajacy_Kod',
      'pkdPrzewazajacy_Kod',
    ])

    const pkdMainDescription = getValue([
      'praw_pkdPrzewazajacy_Nazwa',
      'fiz_pkdPrzewazajacy_Nazwa',
      'PkdPrzewazajacy_Nazwa',
      'pkdPrzewazajacy_Nazwa',
    ])

    return {
      regon,
      nip,
      krs,
      name,
      shortName,
      street,
      buildingNumber,
      apartmentNumber,
      postalCode,
      city,
      voivodeship,
      country: 'Poland',
      registrationDate,
      pkdMainCode,
      pkdMainDescription,
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  /**
   * Logout from the REGON API session
   */
  async logout(): Promise<void> {
    if (!this.session) return

    try {
      const logoutBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${this.apiUrl}</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Wyloguj</wsa:Action>
  </soap:Header>
  <soap:Body>
    <ns:Wyloguj>
      <ns:pIdentyfikatorSesji>${this.escapeXml(this.session.sessionId)}</ns:pIdentyfikatorSesji>
    </ns:Wyloguj>
  </soap:Body>
</soap:Envelope>`

      await this.soapRequest(SOAP_ACTION_LOGOUT, logoutBody, this.session.sessionId)
    } finally {
      this.session = null
    }
  }
}

/**
 * Factory function to create a RegonApiService instance
 * Returns null if the service is not configured
 */
export function createRegonApiService(): RegonApiService | null {
  if (!RegonApiService.isAvailable()) {
    return null
  }
  return new RegonApiService()
}
