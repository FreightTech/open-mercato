import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { PdfTemplate, type PdfTemplateType } from '../data/entities'
import { pdfTemplateUpsertSchema, type PdfTemplateUpsertInput } from '../data/validators'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'

export async function loadPdfTemplate(
  em: EntityManager,
  params: { tenantId: string; organizationId: string; templateType: string }
): Promise<PdfTemplate | null> {
  return em.findOne(PdfTemplate, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    templateType: params.templateType as PdfTemplateType,
  })
}

type SavePdfTemplateResult = {
  id: string
  templateType: string
  htmlTemplate: string
  cssStyles?: string | null
  pageSize: string
  pageOrientation: string
  isActive: boolean
}

const savePdfTemplateCommand: CommandHandler<PdfTemplateUpsertInput, SavePdfTemplateResult> = {
  id: 'pdf_templates.save',
  async execute(rawInput, ctx) {
    const input = pdfTemplateUpsertSchema.parse(rawInput)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let template = await loadPdfTemplate(em, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      templateType: input.templateType,
    })

    if (!template) {
      template = em.create(PdfTemplate, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        templateType: input.templateType,
        htmlTemplate: input.htmlTemplate,
        cssStyles: input.cssStyles || null,
        pageSize: input.pageSize || 'A4',
        pageOrientation: input.pageOrientation || 'portrait',
        isActive: input.isActive ?? true,
      })
      em.persist(template)
    } else {
      template.htmlTemplate = input.htmlTemplate
      template.cssStyles = input.cssStyles || null
      if (input.pageSize !== undefined) template.pageSize = input.pageSize
      if (input.pageOrientation !== undefined) template.pageOrientation = input.pageOrientation
      if (input.isActive !== undefined) template.isActive = input.isActive
      template.updatedAt = new Date()
    }

    await em.flush()

    return {
      id: template.id,
      templateType: template.templateType,
      htmlTemplate: template.htmlTemplate,
      cssStyles: template.cssStyles,
      pageSize: template.pageSize,
      pageOrientation: template.pageOrientation,
      isActive: template.isActive,
    }
  },
}

type DeletePdfTemplateInput = {
  tenantId: string
  organizationId: string
  templateType: string
}

const deletePdfTemplateCommand: CommandHandler<DeletePdfTemplateInput, { ok: boolean }> = {
  id: 'pdf_templates.delete',
  async execute(input, ctx) {
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const template = await loadPdfTemplate(em, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      templateType: input.templateType,
    })

    if (!template) {
      throw new CrudHttpError(404, { error: 'Template not found' })
    }

    em.remove(template)
    await em.flush()

    return { ok: true }
  },
}

registerCommand(savePdfTemplateCommand)
registerCommand(deletePdfTemplateCommand)
