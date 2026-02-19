import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { detectLocale, loadDictionary } from '@open-mercato/shared/lib/i18n/server'
import type { Metadata } from 'next'

// Import 4R Cargo translations
import en from './i18n/en.json'

const frcTranslations: Record<string, Record<string, unknown>> = {
  en,
}

// Flatten nested object to dot-notation keys
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
  title: '4R Cargo',
  description: 'Air freight solutions - Connecting Airlines & Freight Forwarders',
  icons: {
    icon: '/fms/4rcargo-logo-black.png',
  },
}

export default async function FRCargoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await detectLocale()
  const baseDict = await loadDictionary(locale)

  // Load 4R Cargo translations for current locale (fallback to en)
  const frcDict = frcTranslations[locale] || frcTranslations.en || {}
  const flatFrcDict = flattenDict(frcDict)

  // Merge: 4R Cargo translations override base translations
  const mergedDict = { ...baseDict, ...flatFrcDict }

  return (
    <I18nProvider locale={locale} dict={mergedDict}>
      {children}
    </I18nProvider>
  )
}
