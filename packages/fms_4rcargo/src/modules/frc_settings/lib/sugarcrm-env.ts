/**
 * SugarCRM Environment Configuration
 *
 * Reads SugarCRM credentials from environment variables.
 * This keeps credentials out of the database for security and simplicity.
 *
 * Required environment variables:
 * - SUGARCRM_INSTANCE_URL: The SugarCRM instance URL (e.g., https://your-instance.sugarcrm.com)
 * - SUGARCRM_USERNAME: SugarCRM username for OAuth2 authentication
 * - SUGARCRM_PASSWORD: SugarCRM password for OAuth2 authentication
 *
 * Optional:
 * - SUGARCRM_PLATFORM: API platform identifier (defaults to '4rcargo')
 */

export interface SugarCrmEnvConfig {
  instanceUrl: string
  username: string
  password: string
  platform: string
}

/**
 * Get SugarCRM configuration from environment variables
 * @returns Configuration object if all required vars are set, null otherwise
 */
export function getSugarCrmConfig(): SugarCrmEnvConfig | null {
  const instanceUrl = process.env.SUGARCRM_INSTANCE_URL
  const username = process.env.SUGARCRM_USERNAME
  const password = process.env.SUGARCRM_PASSWORD
  const platform = process.env.SUGARCRM_PLATFORM || '4rcargo'

  if (!instanceUrl || !username || !password) {
    return null
  }

  return { instanceUrl, username, password, platform }
}

/**
 * Check if SugarCRM environment variables are configured
 */
export function isSugarCrmConfigured(): boolean {
  return getSugarCrmConfig() !== null
}

/**
 * Get configuration status for display in UI
 */
export function getSugarCrmConfigStatus(): {
  configured: boolean
  instanceUrl: string | null
  missingVars: string[]
} {
  const missingVars: string[] = []

  if (!process.env.SUGARCRM_INSTANCE_URL) {
    missingVars.push('SUGARCRM_INSTANCE_URL')
  }
  if (!process.env.SUGARCRM_USERNAME) {
    missingVars.push('SUGARCRM_USERNAME')
  }
  if (!process.env.SUGARCRM_PASSWORD) {
    missingVars.push('SUGARCRM_PASSWORD')
  }

  return {
    configured: missingVars.length === 0,
    instanceUrl: process.env.SUGARCRM_INSTANCE_URL || null,
    missingVars,
  }
}
