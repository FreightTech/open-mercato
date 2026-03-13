import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createEmailTemplateFixture,
  getEmailTemplateFixture,
  deleteEmailTemplateIfExists,
  listEmailTemplatesFixture,
} from './helpers'

/**
 * TC-ET-003: Create/Update Email Template
 *
 * Verifies that email templates can be created, updated, and retrieved via the API.
 */
test.describe('TC-ET-003: Create/Update Email Template', () => {
  let authToken: string
  const testTemplateType = 'offer' as const

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
  })

  test.afterAll(async ({ request }) => {
    // Clean up test template
    await deleteEmailTemplateIfExists(request, authToken, testTemplateType)
  })

  test('should create a new email template via PUT', async ({ request }) => {
    // Clean up any existing template first
    await deleteEmailTemplateIfExists(request, authToken, testTemplateType)

    const result = await createEmailTemplateFixture(request, authToken, {
      templateType: testTemplateType,
      subjectTemplate: 'Test Offer {{offerNumber}}',
      htmlTemplate: '<p>Dear {{clientName}}, your offer is ready.</p>',
      isActive: true,
    })

    expect(result.templateType).toBe(testTemplateType)
    expect(result.subjectTemplate).toBe('Test Offer {{offerNumber}}')
    expect(result.htmlTemplate).toContain('{{clientName}}')
  })

  test('should update an existing email template', async ({ request }) => {
    // First create a template
    await createEmailTemplateFixture(request, authToken, {
      templateType: testTemplateType,
      subjectTemplate: 'Original Subject',
      htmlTemplate: '<p>Original content</p>',
    })

    // Then update it
    const updated = await createEmailTemplateFixture(request, authToken, {
      templateType: testTemplateType,
      subjectTemplate: 'Updated Subject {{offerNumber}}',
      htmlTemplate: '<p>Updated content with {{variable}}</p>',
    })

    expect(updated.subjectTemplate).toBe('Updated Subject {{offerNumber}}')
    expect(updated.htmlTemplate).toContain('Updated content')
  })

  test('should retrieve created template by type', async ({ request }) => {
    await createEmailTemplateFixture(request, authToken, {
      templateType: testTemplateType,
      subjectTemplate: 'Retrievable Subject',
      htmlTemplate: '<p>Retrievable content</p>',
    })

    const retrieved = await getEmailTemplateFixture(request, authToken, testTemplateType)

    expect(retrieved).not.toBeNull()
    expect(retrieved?.templateType).toBe(testTemplateType)
    expect(retrieved?.subjectTemplate).toBe('Retrievable Subject')
    expect(retrieved?.htmlTemplate).toContain('Retrievable content')
  })

  test('should return empty template when type does not exist', async ({ request }) => {
    // Delete the template first
    await deleteEmailTemplateIfExists(request, authToken, testTemplateType)

    const result = await getEmailTemplateFixture(request, authToken, testTemplateType)

    // API returns empty strings for non-existent templates
    expect(result).not.toBeNull()
    expect(result?.subjectTemplate).toBe('')
    expect(result?.htmlTemplate).toBe('')
  })

  test('should list all templates', async ({ request }) => {
    // Create a template first
    await createEmailTemplateFixture(request, authToken, {
      templateType: testTemplateType,
      subjectTemplate: 'List Test Subject',
      htmlTemplate: '<p>List test content</p>',
    })

    const result = await listEmailTemplatesFixture(request, authToken)

    expect(result).toHaveProperty('templates')
    expect(result).toHaveProperty('availableTypes')
    expect(result.availableTypes).toContain('offer')
    expect(result.availableTypes).toContain('invoice')
    
    // Should have our created template
    expect(result.templates[testTemplateType]).toBeDefined()
    expect(result.templates[testTemplateType].subjectTemplate).toBe('List Test Subject')
  })

  test('should preserve template variables in subject and body', async ({ request }) => {
    const complexSubject = 'Offer {{offerNumber}} - {{originPorts}} to {{destPorts}}'
    const complexBody = `
      <p>Dear {{contactName}},</p>
      <p>Your offer is {{#if validUntil}}valid until {{validUntil}}{{/if}}</p>
      <ul>
        {{#each items}}<li>{{name}}: {{price}}</li>{{/each}}
      </ul>
    `

    const result = await createEmailTemplateFixture(request, authToken, {
      templateType: testTemplateType,
      subjectTemplate: complexSubject,
      htmlTemplate: complexBody,
    })

    expect(result.subjectTemplate).toBe(complexSubject)
    expect(result.htmlTemplate).toContain('{{contactName}}')
    expect(result.htmlTemplate).toContain('{{#if validUntil}}')
    expect(result.htmlTemplate).toContain('{{#each items}}')
  })
})
