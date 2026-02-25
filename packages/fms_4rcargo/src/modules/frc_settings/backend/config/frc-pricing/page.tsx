"use client"

import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PricingSettings } from '../../../components/PricingSettings'
import { CarrierPricingOverrides } from '../../../components/CarrierPricingOverrides'

export default function FrcPricingPage() {
  const t = useT()

  return (
    <Page>
      <PageHeader title={t('frc_settings.pricing.title', 'Pricing Settings')} />
      <PageBody className="space-y-6">
        <PricingSettings />
        <CarrierPricingOverrides />
      </PageBody>
    </Page>
  )
}
