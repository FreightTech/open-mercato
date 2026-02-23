/**
 * SugarCRM REST API Client
 *
 * Implements OAuth2 authentication and provides methods for interacting
 * with SugarCRM modules (Accounts, Contacts, Opportunities, custom modules).
 *
 * Based on SugarCRM REST API v10-v11.24 documentation.
 */

export interface SugarCrmClientConfig {
  instanceUrl: string
  username: string
  password: string
  platform?: string
  clientId?: string
  clientSecret?: string
}

export interface SugarCrmTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope: string | null
  refresh_token: string
  refresh_expires_in: number
  download_token: string
}

export interface SugarCrmRecord {
  id: string
  date_modified: string
  _module?: string
  _acl?: {
    fields: Record<string, unknown>
  }
  [key: string]: unknown
}

export interface SugarCrmListResponse {
  next_offset: number
  records: SugarCrmRecord[]
}

export interface SugarCrmModule {
  name: string
  label: string
  label_plural?: string
  enabled?: boolean
}

export interface SugarCrmField {
  name: string
  type: string
  label: string
  required?: boolean
  readonly?: boolean
  options?: string
  related_module?: string
}

export interface SugarCrmFilterExpression {
  [field: string]:
    | string
    | number
    | boolean
    | null
    | {
        $equals?: string | number | boolean
        $not_equals?: string | number | boolean
        $starts?: string
        $ends?: string
        $contains?: string
        $in?: (string | number)[]
        $not_in?: (string | number)[]
        $is_null?: boolean
        $not_null?: boolean
        $lt?: string | number
        $lte?: string | number
        $gt?: string | number
        $gte?: string | number
        $dateBetween?: [string, string]
        $dateRange?: string
      }
    | SugarCrmFilterExpression[]
}

export class SugarCrmApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'SugarCrmApiError'
  }
}

export class SugarCrmAuthError extends SugarCrmApiError {
  constructor(message: string, details?: unknown) {
    super(message, 401, 'AUTH_ERROR', details)
    this.name = 'SugarCrmAuthError'
  }
}

export class SugarCrmApiClient {
  private baseUrl: string
  private username: string
  private password: string
  private platform: string
  private clientId: string
  private clientSecret: string

  private accessToken: string | null = null
  private refreshToken: string | null = null
  private tokenExpiresAt: Date | null = null
  private refreshTokenExpiresAt: Date | null = null

  // Rate limiting
  private requestCount = 0
  private requestWindowStart = Date.now()
  private readonly maxRequestsPerMinute = 60

  constructor(config: SugarCrmClientConfig) {
    // Normalize instance URL: remove trailing slash, ensure /rest/v11 endpoint
    const normalizedUrl = config.instanceUrl.replace(/\/+$/, '')
    this.baseUrl = normalizedUrl.includes('/rest/')
      ? normalizedUrl
      : `${normalizedUrl}/rest/v11`

    this.username = config.username
    this.password = config.password
    this.platform = config.platform || '4rcargo'
    this.clientId = config.clientId || 'sugar'
    this.clientSecret = config.clientSecret || ''
  }

  /**
   * Authenticate with SugarCRM using password grant
   */
  async authenticate(): Promise<void> {
    const response = await this.oauthTokenRequest<SugarCrmTokenResponse>({
      grant_type: 'password',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      username: this.username,
      password: this.password,
      platform: this.platform,
    })

    this.setTokens(response)
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new SugarCrmAuthError('No refresh token available')
    }

    // Check if refresh token itself has expired
    if (this.refreshTokenExpiresAt && new Date() >= this.refreshTokenExpiresAt) {
      // Need to re-authenticate with username/password
      await this.authenticate()
      return
    }

    const response = await this.oauthTokenRequest<SugarCrmTokenResponse>({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      platform: this.platform,
    })

    this.setTokens(response)
  }

  /**
   * Store token data from authentication response
   */
  private setTokens(response: SugarCrmTokenResponse): void {
    this.accessToken = response.access_token
    this.refreshToken = response.refresh_token

    // Calculate expiration times with a small buffer (60 seconds)
    const now = new Date()
    this.tokenExpiresAt = new Date(now.getTime() + (response.expires_in - 60) * 1000)
    this.refreshTokenExpiresAt = new Date(now.getTime() + (response.refresh_expires_in - 60) * 1000)
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<string> {
    // If no token, authenticate
    if (!this.accessToken) {
      await this.authenticate()
      return this.accessToken!
    }

    // If token expired or about to expire, refresh
    if (this.tokenExpiresAt && new Date() >= this.tokenExpiresAt) {
      await this.refreshAccessToken()
    }

    return this.accessToken!
  }

  /**
   * Rate limiting check
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now()
    const windowDuration = 60 * 1000 // 1 minute

    // Reset window if needed
    if (now - this.requestWindowStart > windowDuration) {
      this.requestCount = 0
      this.requestWindowStart = now
    }

    // If we've hit the limit, wait for the window to reset
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = windowDuration - (now - this.requestWindowStart)
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        this.requestCount = 0
        this.requestWindowStart = Date.now()
      }
    }

    this.requestCount++
  }

  /**
   * OAuth2 token request - uses application/x-www-form-urlencoded as required by RFC 6749
   */
  private async oauthTokenRequest<T>(body: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}/oauth2/token`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: new URLSearchParams(body).toString(),
    })

    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        errorBody = await response.text()
      }

      if (response.status === 401) {
        throw new SugarCrmAuthError('Authentication failed', errorBody)
      }

      throw new SugarCrmApiError(
        `SugarCRM API error: ${response.status} ${response.statusText}`,
        response.status,
        undefined,
        errorBody
      )
    }

    return response.json()
  }

  /**
   * Raw HTTP request without authentication (for non-OAuth endpoints)
   */
  private async rawRequest<T>(method: string, path: string, body?: object): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        errorBody = await response.text()
      }

      if (response.status === 401) {
        throw new SugarCrmAuthError('Authentication failed', errorBody)
      }

      throw new SugarCrmApiError(
        `SugarCRM API error: ${response.status} ${response.statusText}`,
        response.status,
        undefined,
        errorBody
      )
    }

    return response.json()
  }

  /**
   * Authenticated HTTP request with rate limiting and retry
   */
  private async request<T>(
    method: string,
    path: string,
    body?: object,
    queryParams?: Record<string, string | number | boolean | undefined>,
    retryCount = 0
  ): Promise<T> {
    await this.checkRateLimit()
    const token = await this.ensureAuthenticated()

    // Build URL with query parameters
    let url = `${this.baseUrl}${path}`
    if (queryParams) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined) {
          params.append(key, String(value))
        }
      }
      const queryString = params.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'OAuth-Token': token,
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    try {
      const response = await fetch(url, options)

      if (!response.ok) {
        let errorBody: unknown
        try {
          errorBody = await response.json()
        } catch {
          errorBody = await response.text()
        }

        // Handle token expiration
        if (response.status === 401 && retryCount < 1) {
          this.accessToken = null
          return this.request<T>(method, path, body, queryParams, retryCount + 1)
        }

        throw new SugarCrmApiError(
          `SugarCRM API error: ${response.status} ${response.statusText}`,
          response.status,
          undefined,
          errorBody
        )
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        return {} as T
      }

      return response.json()
    } catch (error) {
      // Retry on network errors
      if (retryCount < 2 && error instanceof TypeError) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)))
        return this.request<T>(method, path, body, queryParams, retryCount + 1)
      }
      throw error
    }
  }

  /**
   * Test the connection to SugarCRM
   */
  async testConnection(): Promise<{ success: boolean; message: string; userInfo?: SugarCrmRecord }> {
    try {
      await this.ensureAuthenticated()

      // Fetch current user to verify connection
      const user = await this.request<SugarCrmRecord>('GET', '/me')

      return {
        success: true,
        message: `Connected as ${user.full_name || user.user_name || 'Unknown User'}`,
        userInfo: user,
      }
    } catch (error) {
      if (error instanceof SugarCrmAuthError) {
        return {
          success: false,
          message: 'Authentication failed. Please check your credentials.',
        }
      }
      if (error instanceof SugarCrmApiError) {
        return {
          success: false,
          message: `API error: ${error.message}`,
        }
      }
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  /**
   * Get list of available modules
   */
  async getModules(): Promise<SugarCrmModule[]> {
    const response = await this.request<{ modules: Record<string, SugarCrmModule> }>('GET', '/metadata', undefined, {
      type_filter: 'modules',
    })

    // Module name is the key in the response, not a property inside the object
    return Object.entries(response.modules || {})
      .filter(([, m]) => m.enabled !== false)
      .map(([name, m]) => ({ ...m, name }))
  }

  /**
   * Get fields for a specific module
   */
  async getModuleFields(moduleName: string): Promise<SugarCrmField[]> {
    const response = await this.request<{ fields: Record<string, SugarCrmField> }>(
      'GET',
      `/${moduleName}/enum/fields`
    ).catch(async () => {
      // Fallback: try metadata endpoint
      const metadata = await this.request<{
        modules: Record<string, { fields: Record<string, SugarCrmField> }>
      }>('GET', '/metadata', undefined, {
        type_filter: 'modules',
        module_filter: moduleName,
      })
      return { fields: metadata.modules[moduleName]?.fields || {} }
    })

    return Object.values(response.fields || {})
  }

  /**
   * Get records from a module with filtering
   */
  async getRecords(
    moduleName: string,
    options?: {
      filter?: SugarCrmFilterExpression[]
      fields?: string[]
      maxNum?: number
      offset?: number
      orderBy?: string
      deleted?: boolean
    }
  ): Promise<SugarCrmListResponse> {
    const queryParams: Record<string, string | number | boolean | undefined> = {}

    if (options?.fields) {
      queryParams.fields = options.fields.join(',')
    }
    if (options?.maxNum !== undefined) {
      queryParams.max_num = options.maxNum
    }
    if (options?.offset !== undefined) {
      queryParams.offset = options.offset
    }
    if (options?.orderBy) {
      queryParams.order_by = options.orderBy
    }
    if (options?.deleted !== undefined) {
      queryParams.deleted = options.deleted
    }

    // For complex filters, use POST to /filter endpoint
    if (options?.filter && options.filter.length > 0) {
      return this.request<SugarCrmListResponse>('POST', `/${moduleName}/filter`, { filter: options.filter }, queryParams)
    }

    return this.request<SugarCrmListResponse>('GET', `/${moduleName}`, undefined, queryParams)
  }

  /**
   * Get all records with automatic pagination
   */
  async getAllRecords(
    moduleName: string,
    options?: {
      filter?: SugarCrmFilterExpression[]
      fields?: string[]
      orderBy?: string
      maxRecords?: number
    }
  ): Promise<SugarCrmRecord[]> {
    const allRecords: SugarCrmRecord[] = []
    const pageSize = 100
    const maxRecords = options?.maxRecords || 10000
    let offset = 0

    while (allRecords.length < maxRecords) {
      const response = await this.getRecords(moduleName, {
        ...options,
        maxNum: Math.min(pageSize, maxRecords - allRecords.length),
        offset,
      })

      allRecords.push(...response.records)

      // Check if there are more records
      if (response.next_offset === -1 || response.records.length < pageSize) {
        break
      }

      offset = response.next_offset
    }

    return allRecords
  }

  /**
   * Get a single record by ID
   */
  async getRecord(moduleName: string, id: string, fields?: string[]): Promise<SugarCrmRecord> {
    const queryParams: Record<string, string | undefined> = {}
    if (fields) {
      queryParams.fields = fields.join(',')
    }

    return this.request<SugarCrmRecord>('GET', `/${moduleName}/${id}`, undefined, queryParams)
  }

  /**
   * Get related records for a specific record
   */
  async getRelatedRecords(
    moduleName: string,
    recordId: string,
    linkName: string,
    options?: {
      fields?: string[]
      maxNum?: number
      offset?: number
    }
  ): Promise<SugarCrmListResponse> {
    const queryParams: Record<string, string | number | undefined> = {}

    if (options?.fields) {
      queryParams.fields = options.fields.join(',')
    }
    if (options?.maxNum !== undefined) {
      queryParams.max_num = options.maxNum
    }
    if (options?.offset !== undefined) {
      queryParams.offset = options.offset
    }

    return this.request<SugarCrmListResponse>(
      'GET',
      `/${moduleName}/${recordId}/link/${linkName}`,
      undefined,
      queryParams
    )
  }

  /**
   * Get records modified since a specific date
   */
  async getModifiedRecords(
    moduleName: string,
    since: Date,
    options?: {
      fields?: string[]
      maxNum?: number
    }
  ): Promise<SugarCrmRecord[]> {
    const filter: SugarCrmFilterExpression[] = [
      {
        date_modified: {
          $gte: since.toISOString(),
        },
      },
    ]

    return this.getAllRecords(moduleName, {
      ...options,
      filter,
      orderBy: 'date_modified:ASC',
    })
  }

  /**
   * Search records using global search
   */
  async searchRecords(
    query: string,
    modules?: string[],
    maxNum = 20
  ): Promise<{ records: SugarCrmRecord[]; total: number }> {
    const body: Record<string, unknown> = {
      q: query,
      max_num: maxNum,
    }

    if (modules && modules.length > 0) {
      body.module_list = modules.join(',')
    }

    const response = await this.request<{
      records: SugarCrmRecord[]
      total: number
    }>('POST', '/globalsearch', body)

    return response
  }

  /**
   * Logout and invalidate tokens
   */
  async logout(): Promise<void> {
    if (this.accessToken) {
      try {
        await this.request('POST', '/oauth2/logout')
      } catch {
        // Ignore logout errors
      }
    }

    this.accessToken = null
    this.refreshToken = null
    this.tokenExpiresAt = null
    this.refreshTokenExpiresAt = null
  }
}
