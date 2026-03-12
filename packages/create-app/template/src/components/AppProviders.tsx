"use client"

import type { ReactNode } from 'react'
import type { Locale } from '@open-mercato/shared/lib/i18n/config'
import type { Dict } from '@open-mercato/shared/lib/i18n/context'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { ThemeProvider, FrontendLayout, QueryProvider, AuthFooter, BrandThemeProvider } from '@open-mercato/ui'
import type { ThemeColors } from '@open-mercato/ui/theme/ThemeProvider'
import { ClientBootstrapProvider } from '@/components/ClientBootstrap'
import { GlobalNoticeBars } from '@/components/GlobalNoticeBars'

type AppProvidersProps = {
  children: ReactNode
  locale: Locale
  dict: Dict
  demoModeEnabled: boolean
  brandTheme?: {
    colors?: ThemeColors
    light?: ThemeColors
    dark?: ThemeColors
  }
}

export function AppProviders({ children, locale, dict, demoModeEnabled, brandTheme }: AppProvidersProps) {
  return (
    <I18nProvider locale={locale} dict={dict}>
      <ClientBootstrapProvider>
        <ThemeProvider>
          <BrandThemeProvider
            colors={brandTheme?.colors}
            light={brandTheme?.light}
            dark={brandTheme?.dark}
          >
            <QueryProvider>
              <FrontendLayout footer={<AuthFooter />}>{children}</FrontendLayout>
              <GlobalNoticeBars demoModeEnabled={demoModeEnabled} />
            </QueryProvider>
          </BrandThemeProvider>
        </ThemeProvider>
      </ClientBootstrapProvider>
    </I18nProvider>
  )
}
