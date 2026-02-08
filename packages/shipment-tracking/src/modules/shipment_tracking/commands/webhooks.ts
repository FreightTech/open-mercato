import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/core'
import type { EventBus } from '@open-mercato/events'
import { Webhook } from '../data/entities'
import type { WebhookCreateInput, WebhookUpdateInput } from '../data/validators'

function ensureScope(ctx: CommandRuntimeContext, tenantId: string, organizationId: string) {
  if (ctx.auth?.tenantId && ctx.auth.tenantId !== tenantId) {
    throw new Error('Tenant mismatch')
  }
  if (!ctx.auth?.isSuperAdmin && ctx.auth?.organizationId && ctx.auth.organizationId !== organizationId) {
    throw new Error('Organization mismatch')
  }
}

const createWebhook: CommandHandler<WebhookCreateInput, { id: string }> = {
  id: 'shipment_tracking.webhook.create',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()

    const webhook = em.create(Webhook, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      url: input.url,
      eventsSubscribed: input.eventsSubscribed,
      hmacSecret: input.hmacSecret ?? null,
      isActive: input.isActive ?? true,
    })

    await em.flush()

    return { id: webhook.id }
  },

  async undo({ input, ctx }) {
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const webhooks = await em.find(Webhook, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    }, { orderBy: { createdAt: 'desc' }, limit: 1 })
    const webhook = webhooks[0]
    if (webhook) {
      em.remove(webhook)
      await em.flush()
    }
  },
}

const updateWebhook: CommandHandler<WebhookUpdateInput, { id: string }> = {
  id: 'shipment_tracking.webhook.update',

  async execute(input, ctx) {
    const em = ctx.container.resolve<EntityManager>('em').fork()

    const webhook = await em.findOne(Webhook, { id: input.id })
    if (!webhook) throw new Error('Webhook not found')

    ensureScope(ctx, webhook.tenantId, webhook.organizationId)

    if (input.url !== undefined) webhook.url = input.url
    if (input.eventsSubscribed !== undefined) webhook.eventsSubscribed = input.eventsSubscribed
    if (input.hmacSecret !== undefined) webhook.hmacSecret = input.hmacSecret
    if (input.isActive !== undefined) webhook.isActive = input.isActive

    await em.flush()

    return { id: webhook.id }
  },
}

const deleteWebhook: CommandHandler<{ id: string; tenantId: string; organizationId: string }, { id: string }> = {
  id: 'shipment_tracking.webhook.delete',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()

    const webhook = await em.findOne(Webhook, { id: input.id })
    if (!webhook) throw new Error('Webhook not found')

    em.remove(webhook)
    await em.flush()

    return { id: input.id }
  },
}

const testWebhook: CommandHandler<{ id: string; tenantId: string; organizationId: string }, { success: boolean }> = {
  id: 'shipment_tracking.webhook.test',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()
    const webhookService = ctx.container.resolve<any>('shipmentTrackingWebhookService')

    const webhook = await em.findOne(Webhook, { id: input.id })
    if (!webhook) throw new Error('Webhook not found')

    const dispatched = await webhookService.dispatchEvent({
      eventType: 'test',
      payload: {
        type: 'test',
        message: 'This is a test webhook delivery',
        timestamp: new Date().toISOString(),
      },
      tenantId: webhook.tenantId,
      organizationId: webhook.organizationId,
    })

    return { success: dispatched > 0 }
  },
}

registerCommand(createWebhook)
registerCommand(updateWebhook)
registerCommand(deleteWebhook)
registerCommand(testWebhook)
