import { APIRequestContext } from '@playwright/test'

/**
 * API Client for E2E Test Data Seeding
 *
 * Use this client within fixtures to create test data via API
 * before running tests. This approach is faster than UI-based
 * data creation and ensures tests start with a known state.
 *
 * Usage:
 *   const api = new ApiClient(request, 'http://localhost:3001')
 *   const company = await api.createCompany({ name: 'Test Co' })
 */
export class ApiClient {
  constructor(
    private request: APIRequestContext,
    private baseUrl: string,
    private authToken?: string
  ) {}

  /**
   * Set authentication token for subsequent requests.
   * Call this after logging in via the API.
   */
  setAuthToken(token: string): void {
    this.authToken = token
  }

  /**
   * Get default headers including auth token if available.
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    return headers
  }

  /**
   * Login and store auth token for subsequent requests.
   */
  async login(email: string, password: string): Promise<{ success: boolean }> {
    const response = await this.request.post(`${this.baseUrl}/api/auth/login`, {
      data: { email, password },
      headers: { 'Content-Type': 'application/json' },
    })

    if (response.ok()) {
      // Extract token from response or cookies
      const cookies = response.headers()['set-cookie']
      if (cookies) {
        const authCookie = cookies.match(/auth_token=([^;]+)/)
        if (authCookie) {
          this.authToken = authCookie[1]
        }
      }
      return { success: true }
    }

    return { success: false }
  }

  /**
   * Create a company via API.
   */
  async createCompany(data: {
    name: string
    email?: string
    phone?: string
  }): Promise<{ id: string; name: string }> {
    const response = await this.request.post(`${this.baseUrl}/api/customers/companies`, {
      data,
      headers: this.getHeaders(),
    })

    if (!response.ok()) {
      throw new Error(`Failed to create company: ${response.status()}`)
    }

    return response.json()
  }

  /**
   * Create a person via API.
   */
  async createPerson(data: {
    firstName: string
    lastName: string
    email?: string
    companyId?: string
  }): Promise<{ id: string; firstName: string; lastName: string }> {
    const response = await this.request.post(`${this.baseUrl}/api/customers/people`, {
      data,
      headers: this.getHeaders(),
    })

    if (!response.ok()) {
      throw new Error(`Failed to create person: ${response.status()}`)
    }

    return response.json()
  }

  /**
   * Create a deal via API.
   */
  async createDeal(data: {
    name: string
    value?: number
    companyId?: string
    personId?: string
  }): Promise<{ id: string; name: string }> {
    const response = await this.request.post(`${this.baseUrl}/api/customers/deals`, {
      data,
      headers: this.getHeaders(),
    })

    if (!response.ok()) {
      throw new Error(`Failed to create deal: ${response.status()}`)
    }

    return response.json()
  }

  /**
   * Generic GET request.
   */
  async get<T>(path: string): Promise<T> {
    const response = await this.request.get(`${this.baseUrl}${path}`, {
      headers: this.getHeaders(),
    })

    if (!response.ok()) {
      throw new Error(`GET ${path} failed: ${response.status()}`)
    }

    return response.json()
  }

  /**
   * Generic POST request.
   */
  async post<T>(path: string, data: unknown): Promise<T> {
    const response = await this.request.post(`${this.baseUrl}${path}`, {
      data,
      headers: this.getHeaders(),
    })

    if (!response.ok()) {
      throw new Error(`POST ${path} failed: ${response.status()}`)
    }

    return response.json()
  }

  /**
   * Generic DELETE request.
   */
  async delete(path: string): Promise<void> {
    const response = await this.request.delete(`${this.baseUrl}${path}`, {
      headers: this.getHeaders(),
    })

    if (!response.ok()) {
      throw new Error(`DELETE ${path} failed: ${response.status()}`)
    }
  }
}
