import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { EmailTemplate } from '../data/entities'
import {
  emailTemplateUpsertSchema,
  type EmailTemplateUpsertInput,
} from '../data/validators'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'

export async function loadEmailTemplate(
  em: EntityManager,
  params: { tenantId: string; organizationId: string; templateType: string }
): Promise<EmailTemplate | null> {
  return findOneWithDecryption(
    em,
    EmailTemplate,
    {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      templateType: params.templateType as any,
    },
    undefined,
    {
      tenantId: params.tenantId,
      organizationId: params.organizationId,
    }
  )
}

type SaveEmailTemplateResult = {
  id: string
  templateType: string
  subjectTemplate: string
  htmlTemplate: string
  isActive: boolean
}

const saveEmailTemplateCommand: CommandHandler<
  EmailTemplateUpsertInput,
  SaveEmailTemplateResult
> = {
  id: 'email_templates.save',
  async execute(rawInput, ctx) {
    const input = emailTemplateUpsertSchema.parse(rawInput)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let template = await loadEmailTemplate(em, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      templateType: input.templateType,
    })

    if (!template) {
      template = em.create(EmailTemplate, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        templateType: input.templateType,
        subjectTemplate: input.subjectTemplate,
        htmlTemplate: input.htmlTemplate,
        isActive: input.isActive ?? true,
      })
      em.persist(template)
    } else {
      template.subjectTemplate = input.subjectTemplate
      template.htmlTemplate = input.htmlTemplate
      if (input.isActive !== undefined) {
        template.isActive = input.isActive
      }
      template.updatedAt = new Date()
    }

    await em.flush()

    return {
      id: template.id,
      templateType: template.templateType,
      subjectTemplate: template.subjectTemplate,
      htmlTemplate: template.htmlTemplate,
      isActive: template.isActive,
    }
  },
}

type DeleteEmailTemplateInput = {
  tenantId: string
  organizationId: string
  templateType: string
}

const deleteEmailTemplateCommand: CommandHandler<DeleteEmailTemplateInput, { ok: boolean }> = {
  id: 'email_templates.delete',
  async execute(input, ctx) {
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    
    const template = await loadEmailTemplate(em, {
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

registerCommand(saveEmailTemplateCommand)
registerCommand(deleteEmailTemplateCommand)
