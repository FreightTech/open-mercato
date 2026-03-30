import type { KsefEnvironment } from '../../data/types'

/**
 * KSeF API 2.0 endpoint URL builders.
 *
 * Environment base URLs (v2 API):
 *   test:       https://api-test.ksef.mf.gov.pl
 *   demo:       https://api-demo.ksef.mf.gov.pl
 *   production: https://api.ksef.mf.gov.pl
 *
 * API docs: https://api-test.ksef.mf.gov.pl/docs/v2
 * OpenAPI:  https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json
 */

const BASE_URLS: Record<KsefEnvironment, string> = {
  test: 'https://api-test.ksef.mf.gov.pl',
  demo: 'https://api-demo.ksef.mf.gov.pl',
  production: 'https://api.ksef.mf.gov.pl',
}

export function getBaseUrl(environment: KsefEnvironment): string {
  return BASE_URLS[environment]
}

function v2(environment: KsefEnvironment): string {
  return `${getBaseUrl(environment)}/v2`
}

// ========================================
// Authentication (KSeF 2.0 flow)
// ========================================

/** POST - Get auth challenge (timestamp + challenge value, valid 10 min) */
export function getAuthChallengeUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/auth/challenge`
}

/** POST - Submit XAdES-signed auth request */
export function getAuthXadesSignatureUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/auth/xades-signature`
}

/** POST - Submit encrypted KSeF token auth request */
export function getAuthKsefTokenUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/auth/ksef-token`
}

/** GET - Check auth operation status (async auth result) */
export function getAuthStatusUrl(environment: KsefEnvironment, referenceNumber: string): string {
  return `${v2(environment)}/auth/${referenceNumber}`
}

/** POST - Redeem auth token for access + refresh tokens (one-time) */
export function getAuthTokenRedeemUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/auth/token/redeem`
}

/** POST - Refresh access token using refresh token */
export function getAuthTokenRefreshUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/auth/token/refresh`
}

// ========================================
// Active Sessions
// ========================================

/** GET - List active auth sessions */
export function getActiveSessionsUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/auth/sessions`
}

/** DELETE - Invalidate current session */
export function getInvalidateCurrentSessionUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/auth/sessions/current`
}

/** DELETE - Invalidate specific session */
export function getInvalidateSessionUrl(environment: KsefEnvironment, referenceNumber: string): string {
  return `${v2(environment)}/auth/sessions/${referenceNumber}`
}

// ========================================
// Invoices
// ========================================

/** POST - Send invoice */
export function getSendInvoiceUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/invoices/send`
}

/** GET - Retrieve invoice by hash */
export function getInvoiceUrl(environment: KsefEnvironment, invoiceHash: string): string {
  return `${v2(environment)}/invoices/${invoiceHash}`
}

/** GET - Check invoice processing status */
export function getInvoiceStatusUrl(environment: KsefEnvironment, invoiceHash: string): string {
  return `${v2(environment)}/invoices/${invoiceHash}/status`
}

/** POST - Query/search invoices */
export function getQueryInvoicesUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/invoices/query`
}

/** GET - Download UPO */
export function getUpoUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/invoices/upo`
}

// ========================================
// Batch Operations
// ========================================

/** POST - Create batch job */
export function getBatchJobsUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/batch/jobs`
}

/** GET - Monitor batch job status */
export function getBatchJobStatusUrl(environment: KsefEnvironment, jobId: string): string {
  return `${v2(environment)}/batch/jobs/${jobId}`
}

/** GET - Retrieve batch job results */
export function getBatchJobResultsUrl(environment: KsefEnvironment, jobId: string): string {
  return `${v2(environment)}/batch/jobs/${jobId}/results`
}

// ========================================
// Security / Public Keys
// ========================================

/** GET - Download public key certificates for token encryption */
export function getPublicKeyCertificatesUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/security/public-key-certificates`
}

// ========================================
// Certificates (KSeF-issued)
// ========================================

/** GET - Certificate limits */
export function getCertificateLimitsUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/certificates/limits`
}

/** POST - Request new KSeF certificate */
export function getCertificateEnrollmentUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/certificates/enrollments`
}

/** GET - Check certificate enrollment status */
export function getCertificateEnrollmentStatusUrl(environment: KsefEnvironment, referenceNumber: string): string {
  return `${v2(environment)}/certificates/enrollments/${referenceNumber}`
}

/** POST - Download certificates by serial number */
export function getCertificateRetrieveUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/certificates/retrieve`
}

// ========================================
// Permissions
// ========================================

/** POST - Grant permissions to persons */
export function getPermissionsPersonsGrantsUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/permissions/persons/grants`
}

/** POST - Grant permissions to entities */
export function getPermissionsEntitiesGrantsUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/permissions/entities/grants`
}

// ========================================
// Limits
// ========================================

/** GET - Context limits */
export function getContextLimitsUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/limits/context`
}

/** GET - Rate limits */
export function getRateLimitsUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/rate-limits`
}

// ========================================
// Test Data (test environment only)
// ========================================

/** POST - Create test subject (company/VAT group) */
export function getTestDataSubjectUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/testdata/subject`
}

/** POST - Remove test subject */
export function getTestDataSubjectRemoveUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/testdata/subject/remove`
}

/** POST - Create test person */
export function getTestDataPersonUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/testdata/person`
}

/** POST - Remove test person */
export function getTestDataPersonRemoveUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/testdata/person/remove`
}

/** POST - Grant test permissions */
export function getTestDataPermissionsUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/testdata/permissions`
}

/** POST - Revoke test permissions */
export function getTestDataPermissionsRevokeUrl(environment: KsefEnvironment): string {
  return `${v2(environment)}/testdata/permissions/revoke`
}

// ========================================
// Docs / OpenAPI
// ========================================

export function getDocsUrl(environment: KsefEnvironment): string {
  return `${getBaseUrl(environment)}/docs/v2`
}

export function getOpenApiJsonUrl(environment: KsefEnvironment): string {
  return `${getBaseUrl(environment)}/docs/v2/openapi.json`
}
