/**
 * Unit tests for auto-link-to-project subscriber
 *
 * Tests the logic that automatically links documents to matching FMS projects
 * based on shipping identifiers (bookingNumber, blNumber, mblNumber).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import handle from '../subscribers/auto-link-to-project'
import type { DocumentProcessedPayload } from '../events'
import type { SubscriberContext } from '@open-mercato/events'
import { DocumentCategory } from '../data/entities'

// Mock the project matcher service
vi.mock('../services/project-matcher.service', () => ({
  findMatchingProjects: vi.fn(),
}))

// Mock the logger
vi.mock('../../../lib/logger', () => ({
  createFmsLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { findMatchingProjects } from '../services/project-matcher.service'

describe('auto-link-to-project subscriber', () => {
  let mockEm: {
    fork: Mock
    findOne: Mock
    flush: Mock
  }
  let mockContext: SubscriberContext
  let mockFindMatchingProjects: Mock

  beforeEach(() => {
    vi.clearAllMocks()

    mockEm = {
      fork: vi.fn().mockReturnThis(),
      findOne: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    }

    mockContext = {
      resolve: vi.fn((name: string) => {
        if (name === 'em') return mockEm
        throw new Error(`Unknown dependency: ${name}`)
      }) as <T = unknown>(name: string) => T,
    }

    mockFindMatchingProjects = findMatchingProjects as Mock
  })

  const createPayload = (overrides: Partial<DocumentProcessedPayload> = {}): DocumentProcessedPayload => ({
    id: 'doc-123',
    tenantId: 'tenant-abc',
    organizationId: 'org-xyz',
    category: 'bill_of_lading',
    bookingNumber: 'BK12345678',
    blNumber: 'MAEU123456789',
    ...overrides,
  })

  const createDocument = (overrides: Record<string, unknown> = {}) => ({
    id: 'doc-123',
    tenantId: 'tenant-abc',
    organizationId: 'org-xyz',
    category: 'bill_of_lading',
    bookingNumber: 'BK12345678',
    blNumber: 'MAEU123456789',
    mblNumber: null,
    containerNumbers: null,
    relatedEntityId: null,
    relatedEntityType: null,
    deletedAt: null,
    ...overrides,
  })

  describe('successful linking', () => {
    it('should link document when exactly one project matches by bookingNumber', async () => {
      const document = createDocument()
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockResolvedValue([
        {
          projectId: 'project-001',
          projectNumber: 'PRJ/001/2024',
          matchedBy: ['bookingNumber'],
        },
      ])

      await handle(createPayload(), mockContext)

      expect(document.relatedEntityId).toBe('project-001')
      expect(document.relatedEntityType).toBe('fms_projects:fms_project')
      expect(mockEm.flush).toHaveBeenCalled()
    })

    it('should link document when exactly one project matches by blNumber', async () => {
      const document = createDocument({ bookingNumber: null })
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockResolvedValue([
        {
          projectId: 'project-002',
          projectNumber: 'PRJ/002/2024',
          matchedBy: ['blNumber'],
        },
      ])

      await handle(createPayload({ bookingNumber: undefined }), mockContext)

      expect(document.relatedEntityId).toBe('project-002')
      expect(document.relatedEntityType).toBe('fms_projects:fms_project')
      expect(mockEm.flush).toHaveBeenCalled()
    })

    it('should link document when exactly one project matches by mblNumber', async () => {
      const document = createDocument({ bookingNumber: null, blNumber: null, mblNumber: 'MBL999' })
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockResolvedValue([
        {
          projectId: 'project-003',
          projectNumber: 'PRJ/003/2024',
          matchedBy: ['blNumber'],
        },
      ])

      await handle(createPayload({ bookingNumber: undefined, blNumber: undefined, mblNumber: 'MBL999' }), mockContext)

      expect(document.relatedEntityId).toBe('project-003')
      expect(document.relatedEntityType).toBe('fms_projects:fms_project')
      expect(mockEm.flush).toHaveBeenCalled()
    })
  })

  describe('skip conditions', () => {
    it('should skip when category is booking_confirmation', async () => {
      await handle(createPayload({ category: 'booking_confirmation' }), mockContext)

      expect(mockEm.findOne).not.toHaveBeenCalled()
      expect(mockFindMatchingProjects).not.toHaveBeenCalled()
    })

    it('should skip when category is DocumentCategory.BOOKING_CONFIRMATION enum', async () => {
      await handle(createPayload({ category: DocumentCategory.BOOKING_CONFIRMATION }), mockContext)

      expect(mockEm.findOne).not.toHaveBeenCalled()
      expect(mockFindMatchingProjects).not.toHaveBeenCalled()
    })

    it('should skip when document is already linked', async () => {
      const document = createDocument({
        relatedEntityId: 'existing-project',
        relatedEntityType: 'fms_projects:fms_project',
      })
      mockEm.findOne.mockResolvedValue(document)

      await handle(createPayload(), mockContext)

      expect(mockFindMatchingProjects).not.toHaveBeenCalled()
      expect(mockEm.flush).not.toHaveBeenCalled()
    })

    it('should skip when document not found', async () => {
      mockEm.findOne.mockResolvedValue(null)

      await handle(createPayload(), mockContext)

      expect(mockFindMatchingProjects).not.toHaveBeenCalled()
    })

    it('should skip when no identifiers to match', async () => {
      const document = createDocument({
        bookingNumber: null,
        blNumber: null,
        mblNumber: null,
        containerNumbers: null,
      })
      mockEm.findOne.mockResolvedValue(document)

      await handle(
        createPayload({
          bookingNumber: undefined,
          blNumber: undefined,
          mblNumber: undefined,
          containerNumbers: undefined,
        }),
        mockContext
      )

      expect(mockFindMatchingProjects).not.toHaveBeenCalled()
    })

    it('should skip when missing required payload fields', async () => {
      await handle({ id: 'doc-123' } as DocumentProcessedPayload, mockContext)

      expect(mockEm.findOne).not.toHaveBeenCalled()
    })

    it('should skip when no resolve function in context', async () => {
      await handle(createPayload(), {} as SubscriberContext)

      expect(mockEm.findOne).not.toHaveBeenCalled()
    })
  })

  describe('no match scenarios', () => {
    it('should not link when no projects match', async () => {
      const document = createDocument()
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockResolvedValue([])

      await handle(createPayload(), mockContext)

      expect(document.relatedEntityId).toBeNull()
      expect(mockEm.flush).not.toHaveBeenCalled()
    })

    it('should not link when multiple projects match (ambiguous)', async () => {
      const document = createDocument()
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockResolvedValue([
        { projectId: 'project-001', projectNumber: 'PRJ/001/2024', matchedBy: ['bookingNumber'] },
        { projectId: 'project-002', projectNumber: 'PRJ/002/2024', matchedBy: ['bookingNumber'] },
      ])

      await handle(createPayload(), mockContext)

      expect(document.relatedEntityId).toBeNull()
      expect(mockEm.flush).not.toHaveBeenCalled()
    })
  })

  describe('containerNumbers behavior', () => {
    it('should still check for match when only containerNumbers provided (passes to matcher)', async () => {
      // The subscriber passes containerNumbers to the matcher, but the matcher ignores them
      // This test verifies the subscriber still calls the matcher
      const document = createDocument({
        bookingNumber: null,
        blNumber: null,
        mblNumber: null,
        containerNumbers: ['MSKU1234567'],
      })
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockResolvedValue([])

      await handle(
        createPayload({
          bookingNumber: undefined,
          blNumber: undefined,
          mblNumber: undefined,
          containerNumbers: ['MSKU1234567'],
        }),
        mockContext
      )

      // The subscriber will call findMatchingProjects because containerNumbers is provided
      // But the matcher will return empty because it ignores containerNumbers
      expect(mockFindMatchingProjects).toHaveBeenCalled()
      expect(document.relatedEntityId).toBeNull()
    })
  })

  describe('error handling', () => {
    it('should re-throw retryable errors', async () => {
      const document = createDocument()
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockRejectedValue(new Error('Database connection lost'))

      await expect(handle(createPayload(), mockContext)).rejects.toThrow('Database connection lost')
    })

    it('should not re-throw TypeError (non-retryable)', async () => {
      const document = createDocument()
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockRejectedValue(new TypeError('Cannot read property x'))

      // Should not throw
      await handle(createPayload(), mockContext)
    })

    it('should not re-throw validation errors (non-retryable)', async () => {
      const document = createDocument()
      mockEm.findOne.mockResolvedValue(document)
      mockFindMatchingProjects.mockRejectedValue(new Error('validation failed'))

      // Should not throw
      await handle(createPayload(), mockContext)
    })
  })
})
