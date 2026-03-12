"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import Link from 'next/link'

/**
 * This page has been deprecated in favor of the unified FMS email templates.
 * It now displays a migration notice and redirects to the new location.
 */
export default function FrcEmailTemplatesPage() {
  const t = useT()
  const router = useRouter()

  // Auto-redirect after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/backend/config/templates')
    }, 5000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <Page>
      <PageHeader title={t('frc_settings.email_templates.title', 'Email Templates')} />
      <PageBody>
        <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-100 p-4">
              <AlertTriangle className="h-12 w-12 text-amber-600" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              {t('frc_settings.email_templates.migrated_title', 'Email Templates Have Moved')}
            </h2>
            <p className="text-muted-foreground">
              {t(
                'frc_settings.email_templates.migrated_description',
                'Email templates are now managed through the unified Email Templates settings. This provides better branding options, configurable sender settings, and support for multiple template types.'
              )}
            </p>
          </div>

          <div className="flex justify-center gap-4">
            <Button asChild>
              <Link href="/backend/config/templates">
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('frc_settings.email_templates.go_to_templates', 'Go to Email Templates')}
              </Link>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('frc_settings.email_templates.auto_redirect', 'You will be automatically redirected in 5 seconds...')}
          </p>
        </div>
      </PageBody>
    </Page>
  )
}
