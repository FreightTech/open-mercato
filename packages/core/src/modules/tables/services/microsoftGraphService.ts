import { ConfidentialClientApplication } from '@azure/msal-node'
import { Client } from '@microsoft/microsoft-graph-client'

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

export interface GraphConfig {
  tenantId: string
  clientId: string
  clientSecret: string
}

export class MicrosoftGraphService {
  private msalApp: ConfidentialClientApplication | null = null
  private graphClient: Client | null = null

  getConfig(): GraphConfig | null {
    const tenantId = process.env.AZURE_TENANT_ID
    const clientId = process.env.AZURE_CLIENT_ID
    const clientSecret = process.env.AZURE_CLIENT_SECRET

    if (!tenantId || !clientId || !clientSecret) return null
    return { tenantId, clientId, clientSecret }
  }

  isConfigured(): boolean {
    return this.getConfig() !== null
  }

  private getMsalApp(): ConfidentialClientApplication {
    if (this.msalApp) return this.msalApp

    const config = this.getConfig()
    if (!config) {
      throw new Error('Microsoft Graph is not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET environment variables.')
    }

    this.msalApp = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    })

    return this.msalApp
  }

  private async getAccessToken(): Promise<string> {
    const msalApp = this.getMsalApp()
    const result = await msalApp.acquireTokenByClientCredential({
      scopes: [GRAPH_SCOPE],
    })

    if (!result?.accessToken) {
      throw new Error('Failed to acquire access token from Azure AD.')
    }

    return result.accessToken
  }

  async getClient(): Promise<Client> {
    if (this.graphClient) return this.graphClient

    const service = this
    this.graphClient = Client.init({
      authProvider: async (done) => {
        try {
          const token = await service.getAccessToken()
          done(null, token)
        } catch (error) {
          done(error as Error, null)
        }
      },
    })

    return this.graphClient
  }

  async verifyConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const client = await this.getClient()
      await client.api('/sites/root').select('id').get()
      return { connected: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { connected: false, error: message }
    }
  }
}
