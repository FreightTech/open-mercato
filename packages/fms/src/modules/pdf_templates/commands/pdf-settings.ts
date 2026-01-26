import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { PdfSettings } from '../data/entities'
import { pdfSettingsUpsertSchema, type PdfSettingsUpsertInput } from '../data/validators'

export async function loadPdfSettings(
  em: EntityManager,
  params: { tenantId: string; organizationId: string }
): Promise<PdfSettings | null> {
  return em.findOne(PdfSettings, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
  })
}

type SavePdfSettingsResult = {
  id: string
  companyName?: string | null
  companyLogoUrl?: string | null
  primaryColor: string
  accentColor: string
  headerHtml?: string | null
  footerHtml?: string | null
  showPageNumbers: boolean
  defaultPageSize: string
  defaultPageOrientation: string
}

const savePdfSettingsCommand: CommandHandler<PdfSettingsUpsertInput, SavePdfSettingsResult> = {
  id: 'pdf_settings.save',
  async execute(rawInput, ctx) {
    const input = pdfSettingsUpsertSchema.parse(rawInput)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let settings = await loadPdfSettings(em, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })

    if (!settings) {
      settings = em.create(PdfSettings, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        companyName: input.companyName || null,
        companyLogoUrl: input.companyLogoUrl || null,
        primaryColor: input.primaryColor || '#1a365d',
        accentColor: input.accentColor || '#f7fafc',
        headerHtml: input.headerHtml || null,
        footerHtml: input.footerHtml || null,
        showPageNumbers: input.showPageNumbers ?? true,
        defaultPageSize: input.defaultPageSize || 'A4',
        defaultPageOrientation: input.defaultPageOrientation || 'portrait',
      })
      em.persist(settings)
    } else {
      if (input.companyName !== undefined) settings.companyName = input.companyName || null
      if (input.companyLogoUrl !== undefined) settings.companyLogoUrl = input.companyLogoUrl || null
      if (input.primaryColor !== undefined) settings.primaryColor = input.primaryColor
      if (input.accentColor !== undefined) settings.accentColor = input.accentColor
      if (input.headerHtml !== undefined) settings.headerHtml = input.headerHtml || null
      if (input.footerHtml !== undefined) settings.footerHtml = input.footerHtml || null
      if (input.showPageNumbers !== undefined) settings.showPageNumbers = input.showPageNumbers
      if (input.defaultPageSize !== undefined) settings.defaultPageSize = input.defaultPageSize
      if (input.defaultPageOrientation !== undefined)
        settings.defaultPageOrientation = input.defaultPageOrientation
      settings.updatedAt = new Date()
    }

    await em.flush()

    return {
      id: settings.id,
      companyName: settings.companyName,
      companyLogoUrl: settings.companyLogoUrl,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
      headerHtml: settings.headerHtml,
      footerHtml: settings.footerHtml,
      showPageNumbers: settings.showPageNumbers,
      defaultPageSize: settings.defaultPageSize,
      defaultPageOrientation: settings.defaultPageOrientation,
    }
  },
}

registerCommand(savePdfSettingsCommand)
