import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { KsefSession } from '../data/entities'
import type { KsefSessionEventPayload } from '../events'

export const metadata = {
  event: 'ksef.session.closed',
  persistent: true,
  id: 'ksef.session_closed',
}

export default async function handle(
  payload: KsefSessionEventPayload,
  context?: SubscriberContext
): Promise<void> {
  const sessionId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!sessionId || !tenantId || !organizationId) {
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
    const session = await em.findOne(KsefSession, {
      id: sessionId,
      tenantId,
      organizationId,
    })

    if (!session) {
      return
    }

    if (session.upoXml) {
      return
    }

    const referenceNumber = session.ksefReferenceNumber
    if (!referenceNumber) {
      return
    }

    const { createQueue } = await import('@open-mercato/queue')
    const upoQueue = createQueue<{
      sessionId: string
      referenceNumber: string
      tenantId: string
      organizationId: string
    }>('ksef-upo-download', 'local')

    await upoQueue.enqueue({
      sessionId,
      referenceNumber,
      tenantId,
      organizationId,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint')

    if (isNonRetryable) {
      return
    }

    throw error
  }
}
