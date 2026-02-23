"use client"

import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { OfferTemplateSettings } from '../../../components/OfferTemplateSettings'

export default function FrcEmailTemplatesPage() {
  const t = useT()

  return (
    <Page>
      <PageHeader title={t('frc_settings.email_templates.title', 'Email Templates')} />
      <PageBody className="space-y-6">
        <OfferTemplateSettings />
      </PageBody>
    </Page>
  )
}
