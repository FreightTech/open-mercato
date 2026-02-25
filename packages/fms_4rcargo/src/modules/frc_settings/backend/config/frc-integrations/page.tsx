"use client"

import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { SugarCrmIntegration } from '../../../components/SugarCrmIntegration'

export default function FrcIntegrationsPage() {
  const t = useT()

  return (
    <Page>
      <PageHeader title={t('frc_settings.integrations.title', 'Integrations')} />
      <PageBody className="space-y-6">
        <SugarCrmIntegration />
      </PageBody>
    </Page>
  )
}
