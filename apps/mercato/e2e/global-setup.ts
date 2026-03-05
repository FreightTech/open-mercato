import { FullConfig } from '@playwright/test'

/**
 * Global Setup for E2E Tests
 *
 * This runs once before all tests. Use it to:
 * - Verify the test server is ready
 * - Seed required test data (admin user, etc.)
 * - Set up any global state
 *
 * Note: Playwright's webServer config handles waiting for the server.
 * This setup just does a quick verification and can be extended for data seeding.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000'

  console.log('[E2E] Global setup starting...')

  // Quick health check - just verify login page is accessible
  // Playwright's webServer config already waits for the server to be ready,
  // so we only need a few retries here for edge cases
  const maxRetries = 5
  const retryDelay = 500

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${baseURL}/login`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })

      if (response.ok) {
        console.log('[E2E] Server is ready')
        break
      }
    } catch {
      if (i === maxRetries - 1) {
        console.warn(`[E2E] Warning: Could not reach server at ${baseURL}`)
      } else {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }
  }

  // To seed test users programmatically in CI:
  // await seedTestUsers(baseURL)

  console.log('[E2E] Global setup complete')
}

export default globalSetup
