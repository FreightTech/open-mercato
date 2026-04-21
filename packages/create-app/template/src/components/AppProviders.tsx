"use client"

import type { ReactNode } from 'react'
import type { Locale } from '@open-mercato/shared/lib/i18n/config'
import type { Dict } from '@open-mercato/shared/lib/i18n/context'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { ThemeProvider, FrontendLayout, QueryProvider, AuthFooter } from '@open-mercato/ui'
import { BrandThemeProvider } from '@open-mercato/ui/theme'
import type { ThemeColors } from '@open-mercato/ui/theme/BrandThemeProvider'
import { ClientBootstrapProvider } from '@/components/ClientBootstrap'
import { GlobalNoticeBars } from '@/components/GlobalNoticeBars'
import { ComponentOverridesBootstrap } from '@/components/ComponentOverridesBootstrap'

type AppProvidersProps = {
  children: ReactNode
  locale: Locale
  dict: Dict
  demoModeEnabled: boolean
  noticeBarsEnabled: boolean
  brandTheme?: {
    colors?: ThemeColors
    light?: ThemeColors
    dark?: ThemeColors
  }
}

export function AppProviders({ children, locale, dict, demoModeEnabled, noticeBarsEnabled, brandTheme }: AppProvidersProps) {
  return (
    <I18nProvider locale={locale} dict={dict}>
      <ClientBootstrapProvider>
        <ComponentOverridesBootstrap>
        <ThemeProvider>
          <BrandThemeProvider
            colors={brandTheme?.colors}
            light={brandTheme?.light}
            dark={brandTheme?.dark}
          >
            <QueryProvider>
              <FrontendLayout footer={<AuthFooter />}>{children}</FrontendLayout>
              {noticeBarsEnabled ? <GlobalNoticeBars demoModeEnabled={demoModeEnabled} /> : null}
            </QueryProvider>
          </BrandThemeProvider>
        </ThemeProvider>
      </ComponentOverridesBootstrap>
      </ClientBootstrapProvider>
    </I18nProvider>
  )
}
