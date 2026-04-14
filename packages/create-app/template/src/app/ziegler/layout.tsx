import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { detectLocale, loadDictionary } from '@open-mercato/shared/lib/i18n/server'
import type { Metadata } from 'next'

import en from './i18n/en.json'

const zieglerTranslations: Record<string, Record<string, unknown>> = {
  en,
}

function flattenDict(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      result[fullKey] = value
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenDict(value as Record<string, unknown>, fullKey))
    }
  }
  return result
}

export const metadata: Metadata = {
  title: 'Ziegler Group',
  description: 'Logistics beyond limits — International logistics services and multimodal transport',
  icons: {
    icon: '/fms/ziegler-logo-yellow.svg',
  },
}

export default async function ZieglerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await detectLocale()
  const baseDict = await loadDictionary(locale)

  const zieglerDict = zieglerTranslations[locale] || zieglerTranslations.en || {}
  const flatZieglerDict = flattenDict(zieglerDict)

  const mergedDict = { ...baseDict, ...flatZieglerDict }

  return (
    <I18nProvider locale={locale} dict={mergedDict}>
      {children}
    </I18nProvider>
  )
}
