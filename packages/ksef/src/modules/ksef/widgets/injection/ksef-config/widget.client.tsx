"use client"

import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export default function KsefConfigWidget(_props: InjectionWidgetComponentProps) {
  const t = useT()
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        {t('ksef.config.help', 'Configure KSeF credentials in Integration details. Auto-submit and session settings can be managed from the KSeF settings page.')}
      </p>
    </div>
  )
}
