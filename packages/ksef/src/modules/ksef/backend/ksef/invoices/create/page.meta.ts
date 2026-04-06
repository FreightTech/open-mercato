export const metadata = {
  title: 'Create Invoice',
  navHidden: true,
  requireAuth: true,
  requireFeatures: ['ksef.submit'],
  breadcrumb: [
    { label: 'Integrations', labelKey: 'integrations.nav.title', href: '/backend/integrations' },
    { label: 'KSeF', href: '/backend/integrations/ksef' },
    { label: 'Invoices', labelKey: 'ksef.nav.invoices', href: '/backend/integrations/ksef?tab=ksef.injection.invoices' },
    { label: 'Create' },
  ],
}
