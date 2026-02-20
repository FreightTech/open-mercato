"use client"

import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { OfferTemplateSettings } from '../../../components/OfferTemplateSettings'
import { SugarCrmIntegration } from '../../../components/SugarCrmIntegration'

export default function FrcSettingsPage() {
  const t = useT()

  return (
    <Page>
      <PageHeader title={t('frc_settings.title', '4R Cargo Settings')} />
      <PageBody className="space-y-6">
        <Tabs defaultValue="offer_templates" className="w-full">
          <TabsList>
            <TabsTrigger value="offer_templates">
              {t('frc_settings.tabs.offer_templates', 'Offer Templates')}
            </TabsTrigger>
            <TabsTrigger value="integrations">
              {t('frc_settings.tabs.integrations', 'Integrations')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="offer_templates" className="mt-6">
            <OfferTemplateSettings />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <SugarCrmIntegration />
          </TabsContent>
        </Tabs>
      </PageBody>
    </Page>
  )
}
