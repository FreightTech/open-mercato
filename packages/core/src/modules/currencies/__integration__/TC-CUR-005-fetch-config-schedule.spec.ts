import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'

type FetchConfig = {
  id: string
  provider: string
  isEnabled: boolean
  syncTime: string | null
  timezone: string
  organizationId: string
  tenantId: string
}

type ScheduledJobItem = {
  id: string
  scheduleType: 'cron' | 'interval'
  scheduleValue: string
  timezone: string
  targetQueue: string | null
  targetPayload: { configId?: string; provider?: string } | null
  isEnabled: boolean
  sourceModule: string | null
}

const FETCH_CONFIG_PATH = '/api/currencies/fetch-configs'
const SCHEDULER_JOBS_PATH = '/api/scheduler/jobs'

async function listScheduledJobsForCurrencies(
  request: import('@playwright/test').APIRequestContext,
  token: string,
): Promise<ScheduledJobItem[]> {
  const response = await apiRequest(
    request,
    'GET',
    `${SCHEDULER_JOBS_PATH}?sourceModule=currencies&pageSize=100`,
    { token },
  )
  expect(response.ok(), `Failed to list scheduler jobs: ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { items?: ScheduledJobItem[] }
  return Array.isArray(body.items) ? body.items : []
}

async function findScheduleForConfig(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  configId: string,
): Promise<ScheduledJobItem | null> {
  const items = await listScheduledJobsForCurrencies(request, token)
  return items.find((item) => item.targetPayload?.configId === configId) ?? null
}

/**
 * TC-CUR-005: Enabling a CurrencyFetchConfig registers a daily ScheduledJob
 *
 * Regression coverage for the bug where toggling Currency Rate Fetching
 * persisted CurrencyFetchConfig.isEnabled but never registered a row in
 * scheduled_jobs, causing daily fetches to never run.
 */
test.describe('TC-CUR-005: Currency fetch config registers scheduled job', () => {
  test('toggling enabled with syncTime+timezone upserts a scheduled_jobs row; toggling disabled disables it; deleting removes it', async ({ request }) => {
    const token = await getAuthToken(request, 'admin')

    // Pick a provider that won't collide with concurrent test runs
    const provider = 'NBP'

    let configId: string | null = null

    try {
      // Create (or fetch) a config for this provider, enabled with syncTime + timezone
      const createResponse = await apiRequest(request, 'POST', FETCH_CONFIG_PATH, {
        token,
        data: {
          provider,
          isEnabled: true,
          syncTime: '09:00',
          timezone: 'Europe/Warsaw',
        },
      })

      if (createResponse.status() === 400) {
        // Provider already configured — fetch the existing one and update it
        const listResponse = await apiRequest(request, 'GET', FETCH_CONFIG_PATH, { token })
        const listBody = (await listResponse.json()) as { configs?: FetchConfig[] }
        const existing = (listBody.configs ?? []).find((c) => c.provider === provider)
        expect(existing, 'expected existing fetch config to fetch when create returns 400').toBeTruthy()
        configId = existing!.id
        const updateResponse = await apiRequest(request, 'PUT', FETCH_CONFIG_PATH, {
          token,
          data: {
            id: configId,
            isEnabled: true,
            syncTime: '09:00',
            timezone: 'Europe/Warsaw',
          },
        })
        expect(updateResponse.ok()).toBeTruthy()
      } else {
        expect(createResponse.status()).toBe(201)
        const created = (await createResponse.json()) as { config: FetchConfig }
        configId = created.config.id
      }

      // Assert: scheduled_jobs row registered with the expected cron/timezone/queue
      const enabledJob = await findScheduleForConfig(request, token, configId!)
      expect(enabledJob, 'expected scheduled_jobs row to exist after enabling fetch config').toBeTruthy()
      expect(enabledJob!.scheduleType).toBe('cron')
      expect(enabledJob!.scheduleValue).toBe('0 9 * * *')
      expect(enabledJob!.timezone).toBe('Europe/Warsaw')
      expect(enabledJob!.targetQueue).toBe('currencies-fetch-rates')
      expect(enabledJob!.isEnabled).toBe(true)
      expect(enabledJob!.sourceModule).toBe('currencies')
      expect(enabledJob!.targetPayload?.provider).toBe(provider)

      // Toggle disabled — schedule row should remain but is_enabled=false
      const disableResponse = await apiRequest(request, 'PUT', FETCH_CONFIG_PATH, {
        token,
        data: { id: configId, isEnabled: false },
      })
      expect(disableResponse.ok()).toBeTruthy()

      const disabledJob = await findScheduleForConfig(request, token, configId!)
      // Either the row is gone, or it is present but disabled — both satisfy the contract
      if (disabledJob) {
        expect(disabledJob.isEnabled).toBe(false)
      }

      // Delete the config — schedule row must be gone
      const deletedConfigId = configId!
      const deleteResponse = await apiRequest(
        request,
        'DELETE',
        `${FETCH_CONFIG_PATH}?id=${encodeURIComponent(deletedConfigId)}`,
        { token },
      )
      expect(deleteResponse.ok()).toBeTruthy()
      configId = null

      const deletedJob = await findScheduleForConfig(request, token, deletedConfigId)
      expect(
        deletedJob,
        'expected scheduled_jobs row to be removed after deleting fetch config',
      ).toBeNull()
    } finally {
      if (configId) {
        await apiRequest(
          request,
          'DELETE',
          `${FETCH_CONFIG_PATH}?id=${encodeURIComponent(configId)}`,
          { token },
        ).catch(() => null)
      }
    }
  })
})
