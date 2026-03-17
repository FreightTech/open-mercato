/**
 * KSeF API v2.0 request/response payload types.
 *
 * Based on: https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json
 * Build: 2.2.1-te
 *
 * Key difference from KSeF 1.0:
 * - Auth flow is async: challenge → submit auth → poll status → redeem tokens
 * - Dual token system: accessToken (short-lived) + refreshToken (long-lived)
 * - Token encryption uses RSA-OAEP with SHA-256 (no AES wrapping for auth)
 * - Bearer auth header instead of SessionToken header
 */

// ========================================
// Context Identifiers
// ========================================

export interface KsefContextIdentifier {
  value: string
  type: 'nip' | 'internalId' | 'vatEu'
}

// ========================================
// Authentication — Challenge
// ========================================

export interface KsefAuthChallengeResponse {
  challenge: string
  timestamp: string
}

// ========================================
// Authentication — KSeF Token Method
// ========================================

export interface KsefTokenAuthRequest {
  challenge: string
  contextIdentifier: KsefContextIdentifier
  encryptedToken: string
  authorizationPolicy?: KsefAuthorizationPolicy
}

export interface KsefAuthorizationPolicy {
  allowedIpAddresses?: string[]
  allowedIpRanges?: Array<{ from: string; to: string }>
  allowedIpMasks?: Array<{ ip: string; mask: string }>
}

// ========================================
// Authentication — XAdES Signature Method
// ========================================

export interface KsefXadesAuthResponse {
  authenticationToken: KsefAuthToken
  referenceNumber: string
}

export interface KsefAuthToken {
  token: string
}

// ========================================
// Authentication — Status & Tokens
// ========================================

export interface KsefAuthStatusResponse {
  status: 'pending' | 'completed' | 'failed'
  referenceNumber: string
  errorDescription?: string
}

export interface KsefTokenRedeemResponse {
  accessToken: KsefJwtToken
  refreshToken: KsefJwtToken
}

export interface KsefJwtToken {
  token: string
  expiresAt?: string
}

export interface KsefTokenRefreshResponse {
  accessToken: KsefJwtToken
}

// ========================================
// Invoices — Send
// ========================================

export interface KsefSendInvoiceRequest {
  invoiceHash: KsefInvoiceHash
  invoicePayload: {
    type: string
    invoiceBody: string
  }
}

export interface KsefInvoiceHash {
  hashSHA: {
    algorithm: string
    encoding: string
    value: string
  }
  fileSize: number
}

export interface KsefSendInvoiceResponse {
  elementReferenceNumber: string
  referenceNumber: string
  processingCode: number
  processingDescription: string
  timestamp: string
}

// ========================================
// Invoices — Status
// ========================================

export interface KsefInvoiceStatusResponse {
  processingCode: number
  processingDescription: string
  elementReferenceNumber: string
  referenceNumber?: string
  ksefReferenceNumber?: string
  acquisitionTimestamp?: string
  invoiceNumber?: string
}

// ========================================
// Invoices — UPO
// ========================================

export interface KsefUpoResponse {
  processingCode: number
  processingDescription: string
  referenceNumber: string
  upo: string
}

// ========================================
// Invoices — Query
// ========================================

export interface KsefQueryCriteria {
  subjectType: 'subject1' | 'subject2' | 'subject3'
  type: 'incremental' | 'range'
  acquisitionTimestampThresholdFrom?: string
  acquisitionTimestampThresholdTo?: string
  invoicingDateFrom?: string
  invoicingDateTo?: string
}

export interface KsefQueryInvoicesRequest {
  queryCriteria: KsefQueryCriteria
}

export interface KsefInvoiceSubject {
  issuedByIdentifier: { type: string; identifier: string }
  issuedByName: { tradeName?: string; fullName?: string }
}

export interface KsefInvoiceSubjectTo {
  issuedToIdentifier?: { type: string; identifier: string }
  issuedToName?: { tradeName?: string; fullName?: string }
}

export interface KsefInvoiceHeader {
  invoiceReferenceNumber: string
  ksefReferenceNumber: string
  invoiceNumber: string
  invoicingDate: string
  acquisitionTimestamp: string
  subjectBy: KsefInvoiceSubject
  subjectTo?: KsefInvoiceSubjectTo
  net?: string
  vat?: string
  gross?: string
}

export interface KsefQueryInvoicesResponse {
  invoiceHeaderList: KsefInvoiceHeader[]
  numberOfElements: number
  pageSize: number
  pageOffset: number
  referenceNumber: string
}

// ========================================
// Invoices — Download
// ========================================

export interface KsefDownloadInvoiceResponse {
  invoiceReferenceNumber: string
  ksefReferenceNumber: string
  invoiceBody: string
}

// ========================================
// Batch
// ========================================

export interface KsefBatchJobResponse {
  jobId: string
  referenceNumber: string
  status: string
}

export interface KsefBatchJobStatusResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processedCount?: number
  totalCount?: number
  errorCount?: number
}

// ========================================
// Sessions
// ========================================

export interface KsefActiveSession {
  referenceNumber: string
  contextIdentifier: KsefContextIdentifier
  createdAt: string
}

// ========================================
// Test Data (test environment only)
// ========================================

export interface KsefTestDataSubjectRequest {
  subjectNip: string
  subjectType?: 'Standard' | 'VatGroup'
  description?: string
  subunits?: Array<{
    subjectNip: string
    description?: string
  }>
}

export interface KsefTestDataPersonRequest {
  nip: string
  pesel: string
  description?: string
  isBailiff?: boolean
}

export interface KsefTestDataPermissionsRequest {
  contextIdentifier: KsefContextIdentifier
  authorizedIdentifier: {
    value: string
    type: 'pesel' | 'nip'
  }
  permissions: Array<{
    permissionType: KsefPermissionType
    description?: string
  }>
}

export type KsefPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'Introspection'
  | 'CredentialsRead'
  | 'CredentialsManage'
  | 'SubunitManage'
  | 'EnforcementOperations'

// ========================================
// Errors
// ========================================

export interface KsefErrorResponse {
  exception: {
    serviceCtx: string
    serviceCode: string
    serviceName: string
    timestamp: string
    referenceNumber?: string
    exceptionDetailList: Array<{
      exceptionCode: number
      exceptionDescription: string
    }>
  }
}
