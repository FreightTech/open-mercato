import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { EmailSettings } from '../data/entities'
import {
  emailSettingsUpsertSchema,
  type EmailSettingsUpsertInput,
} from '../data/validators'

export async function loadEmailSettings(
  em: EntityManager,
  params: { tenantId: string; organizationId: string }
): Promise<EmailSettings | null> {
  return findOneWithDecryption(
    em,
    EmailSettings,
    {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
    },
    undefined,
    {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
    }
  )
}

type SaveEmailSettingsResult = {
  id: string
  companyName?: string | null
  companyLogoUrl?: string | null
  primaryColor: string
  accentColor: string
  contactEmail?: string | null
  contactPhone?: string | null
  websiteUrl?: string | null
  footerText?: string | null
  footerDisclaimer?: string | null
  fromName?: string | null
  fromEmail?: string | null
  replyToEmail?: string | null
}

const saveEmailSettingsCommand: CommandHandler<
  EmailSettingsUpsertInput,
  SaveEmailSettingsResult
> = {
  id: 'email_settings.save',
  async execute(rawInput, ctx) {
    const input = emailSettingsUpsertSchema.parse(rawInput)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let settings = await loadEmailSettings(em, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })

    if (!settings) {
      settings = em.create(EmailSettings, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        companyName: input.companyName || null,
        companyLogoUrl: input.companyLogoUrl || null,
        primaryColor: input.primaryColor || '#1a365d',
        accentColor: input.accentColor || '#f7fafc',
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
        websiteUrl: input.websiteUrl || null,
        footerText: input.footerText || null,
        footerDisclaimer: input.footerDisclaimer || null,
        fromName: input.fromName || null,
        fromEmail: input.fromEmail || null,
        replyToEmail: input.replyToEmail || null,
      })
      em.persist(settings)
    } else {
      if (input.companyName !== undefined) settings.companyName = input.companyName || null
      if (input.companyLogoUrl !== undefined) settings.companyLogoUrl = input.companyLogoUrl || null
      if (input.primaryColor !== undefined) settings.primaryColor = input.primaryColor
      if (input.accentColor !== undefined) settings.accentColor = input.accentColor
      if (input.contactEmail !== undefined) settings.contactEmail = input.contactEmail || null
      if (input.contactPhone !== undefined) settings.contactPhone = input.contactPhone || null
      if (input.websiteUrl !== undefined) settings.websiteUrl = input.websiteUrl || null
      if (input.footerText !== undefined) settings.footerText = input.footerText || null
      if (input.footerDisclaimer !== undefined) settings.footerDisclaimer = input.footerDisclaimer || null
      if (input.fromName !== undefined) settings.fromName = input.fromName || null
      if (input.fromEmail !== undefined) settings.fromEmail = input.fromEmail || null
      if (input.replyToEmail !== undefined) settings.replyToEmail = input.replyToEmail || null
      settings.updatedAt = new Date()
    }

    await em.flush()

    return {
      id: settings.id,
      companyName: settings.companyName,
      companyLogoUrl: settings.companyLogoUrl,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      websiteUrl: settings.websiteUrl,
      footerText: settings.footerText,
      footerDisclaimer: settings.footerDisclaimer,
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyToEmail: settings.replyToEmail,
    }
  },
}

registerCommand(saveEmailSettingsCommand)
