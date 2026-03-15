import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  createContractorFixture,
  createAddressFixture,
  createContactFixture,
  deleteContractorIfExists,
} from './helpers'

/**
 * TC-CONTRACTOR-004: Activity Feed Shows Sub-Entity Changes
 *
 * Verifies that adding locations, contacts, bank accounts, and SOP notes
 * creates entries in the activity feed under the "Changes" filter.
 *
 * The activity feed renders ActionLog entries as field_change items showing
 * the actor name + "updated" + field diffs (e.g., "Name: Warsaw HQ").
 */
test.describe('TC-CONTRACTOR-004: Activity Feed Tracks Changes', () => {
  let authToken: string
  const createdContractorIds: string[] = []
  const testPrefix = `ctr4-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    for (const id of createdContractorIds) {
      await deleteContractorIfExists(request, authToken, id)
    }
  })

  async function createTestContractor(
    request: import('@playwright/test').APIRequestContext,
    nameSuffix: string
  ) {
    const contractor = await createContractorFixture(request, authToken, {
      name: `${testPrefix}-${nameSuffix}`,
    })
    if (contractor?.id) createdContractorIds.push(contractor.id)
    return contractor
  }

  async function gotoContractor(page: import('@playwright/test').Page, contractorId: string) {
    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractorId}`)
    await page.locator('.w-\\[400px\\]').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  test('should show location addition in activity feed under Changes filter', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'LocActivity')
    expect(contractor).not.toBeNull()

    // Create a location via API
    await createAddressFixture(request, authToken, {
      contractorId: contractor!.id,
      type: 'contractor_office',
      name: 'Warsaw HQ',
      city: 'Warsaw',
      country: 'PL',
      isPrimary: true,
    })

    await gotoContractor(page, contractor!.id)

    // Switch to "Changes" filter
    await page.getByRole('button', { name: 'Changes' }).click()
    await page.waitForTimeout(500)

    // Should show a field_change entry with the location data
    // The entry renders as "User updated" with field diffs like "Name: Warsaw HQ"
    await expect(page.getByText('updated').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Warsaw HQ').first()).toBeVisible()
  })

  test('should show contact addition in activity feed under Changes filter', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'ContactActivity')
    expect(contractor).not.toBeNull()

    // Create a contact via API
    await createContactFixture(request, authToken, {
      contractorId: contractor!.id,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      phone: '+48-111-222-333',
    })

    await gotoContractor(page, contractor!.id)

    // Switch to "Changes" filter
    await page.getByRole('button', { name: 'Changes' }).click()
    await page.waitForTimeout(500)

    // Should show a field_change entry with the contact data
    await expect(page.getByText('updated').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Jane').first()).toBeVisible()
  })

  test('should show bank account addition in activity feed under Changes filter', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'BankActivity')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    // Add bank account via UI
    await page.getByRole('button', { name: 'Add Account' }).click()
    const bankNameInput = page.getByPlaceholder('Bank name')
    await expect(bankNameInput).toBeVisible({ timeout: 5_000 })
    await bankNameInput.fill('Activity Test Bank')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Activity Test Bank')).toBeVisible({ timeout: 10_000 })

    // Reload to refresh activity feed
    await page.reload()
    await page.locator('.w-\\[400px\\]').first().waitFor({ state: 'visible', timeout: 15_000 })

    // Switch to "Changes" filter
    await page.getByRole('button', { name: 'Changes' }).click()
    await page.waitForTimeout(500)

    // Should show a field_change entry for the bank account
    await expect(page.getByText('updated').first()).toBeVisible({ timeout: 10_000 })
  })

  test('should show SOP note addition in activity feed under Changes filter', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'SopActivity')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    // Add SOP note via UI
    await page.getByText('Add Note').click()
    const textarea = page.getByPlaceholder('Leave a comment')
    await expect(textarea).toBeVisible({ timeout: 5_000 })
    await textarea.fill('Important compliance requirement for this contractor')
    await page.getByRole('button', { name: 'Finance' }).click()
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('Important compliance requirement')).toBeVisible({ timeout: 10_000 })

    // Reload to refresh activity feed
    await page.reload()
    await page.locator('.w-\\[400px\\]').first().waitFor({ state: 'visible', timeout: 15_000 })

    // Switch to "Changes" filter
    await page.getByRole('button', { name: 'Changes' }).click()
    await page.waitForTimeout(500)

    // Should show a field_change entry
    await expect(page.getByText('updated').first()).toBeVisible({ timeout: 10_000 })
  })

  test('should show both comments and changes under All filter', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'AllFilter')
    expect(contractor).not.toBeNull()

    // Create a contact via API
    await createContactFixture(request, authToken, {
      contractorId: contractor!.id,
      firstName: 'AllFilter',
      lastName: 'User',
      email: 'allfilter@example.com',
    })

    await gotoContractor(page, contractor!.id)

    // Post a comment
    const commentText = `All filter comment ${Date.now()}`
    await page.getByPlaceholder('Write a comment').fill(commentText)
    await page.getByRole('button', { name: 'Post' }).click()
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 })

    // Under "All" filter, both the comment and the contact change should be visible
    await expect(page.getByText(commentText)).toBeVisible()
    await expect(page.getByText('updated').first()).toBeVisible({ timeout: 5_000 })
  })
})
