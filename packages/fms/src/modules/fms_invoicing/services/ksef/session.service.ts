import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsInvoicingKsefSession } from '../../data/entities'
import type { KsefSessionStatus } from '../../data/types'

interface GetActiveSessionParams {
  tenantId: string
  organizationId: string
  nip: string
}

interface SessionSummary {
  id: string
  sessionStatus: KsefSessionStatus
  nip: string
  ksefReferenceNumber: string | null
  invoiceCount: number
  startedAt: Date | null
  closedAt: Date | null
}

export class KsefSessionService {
  private container: AppContainer

  constructor(opts: { container: AppContainer }) {
    this.container = opts.container
  }

  async getActiveSession(
    em: EntityManager,
    params: GetActiveSessionParams
  ): Promise<FmsInvoicingKsefSession | null> {
    return em.findOne(FmsInvoicingKsefSession, {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      nip: params.nip,
      sessionStatus: 'active',
    })
  }

  async getSessionById(em: EntityManager, sessionId: string): Promise<FmsInvoicingKsefSession | null> {
    return em.findOne(FmsInvoicingKsefSession, { id: sessionId })
  }

  async requireActiveSession(
    em: EntityManager,
    params: GetActiveSessionParams
  ): Promise<FmsInvoicingKsefSession> {
    const session = await this.getActiveSession(em, params)
    if (!session) {
      throw new CrudHttpError(400, {
        error: `No active KSeF session found for NIP ${params.nip}. Authenticate first.`,
      })
    }
    return session
  }

  async closeSession(em: EntityManager, sessionId: string): Promise<void> {
    const session = await em.findOne(FmsInvoicingKsefSession, { id: sessionId })
    if (!session) {
      throw new CrudHttpError(404, { error: 'KSeF session not found' })
    }

    if (session.sessionStatus === 'closed') {
      return
    }

    session.sessionStatus = 'closed'
    session.closedAt = new Date()
    await em.flush()
  }

  async markSessionError(em: EntityManager, sessionId: string, errorMessage: string): Promise<void> {
    const session = await em.findOne(FmsInvoicingKsefSession, { id: sessionId })
    if (!session) return

    session.sessionStatus = 'error'
    session.errorMessage = errorMessage
    await em.flush()
  }

  async incrementInvoiceCount(em: EntityManager, sessionId: string): Promise<void> {
    const session = await em.findOne(FmsInvoicingKsefSession, { id: sessionId })
    if (!session) return

    session.invoiceCount += 1
    await em.flush()
  }

  async storeUpo(em: EntityManager, sessionId: string, upoXml: string): Promise<void> {
    const session = await em.findOne(FmsInvoicingKsefSession, { id: sessionId })
    if (!session) {
      throw new CrudHttpError(404, { error: 'KSeF session not found' })
    }

    session.upoXml = upoXml
    session.upoDownloadedAt = new Date()
    await em.flush()
  }

  async listSessions(
    em: EntityManager,
    params: {
      tenantId: string
      organizationId: string
      nip?: string
      status?: KsefSessionStatus
      limit?: number
      offset?: number
    }
  ): Promise<{ items: SessionSummary[]; total: number }> {
    const filters: Record<string, unknown> = {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
    }

    if (params.nip) {
      filters.nip = params.nip
    }
    if (params.status) {
      filters.sessionStatus = params.status
    }

    const limit = params.limit ?? 20
    const offset = params.offset ?? 0

    const [sessions, total] = await em.findAndCount(
      FmsInvoicingKsefSession,
      filters,
      {
        orderBy: { createdAt: 'desc' },
        limit,
        offset,
      }
    )

    const items: SessionSummary[] = sessions.map((session) => ({
      id: session.id,
      sessionStatus: session.sessionStatus,
      nip: session.nip,
      ksefReferenceNumber: session.ksefReferenceNumber ?? null,
      invoiceCount: session.invoiceCount,
      startedAt: session.startedAt ?? null,
      closedAt: session.closedAt ?? null,
    }))

    return { items, total }
  }

  async closeStaleActiveSessions(
    em: EntityManager,
    params: {
      tenantId: string
      organizationId: string
      maxAgeMs?: number
    }
  ): Promise<number> {
    const maxAgeMs = params.maxAgeMs ?? 24 * 60 * 60 * 1000 // 24 hours default
    const cutoff = new Date(Date.now() - maxAgeMs)

    const staleSessions = await em.find(FmsInvoicingKsefSession, {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      sessionStatus: 'active',
      startedAt: { $lt: cutoff },
    })

    for (const session of staleSessions) {
      session.sessionStatus = 'error'
      session.errorMessage = 'Session closed due to inactivity (stale session cleanup)'
      session.closedAt = new Date()
    }

    if (staleSessions.length > 0) {
      await em.flush()
    }

    return staleSessions.length
  }
}
