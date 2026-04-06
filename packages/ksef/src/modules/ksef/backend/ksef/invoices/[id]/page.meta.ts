export const metadata = {
  title: 'Invoice Detail',
  navHidden: true,
  requireAuth: true,
  requireFeatures: ['ksef.view'],
  breadcrumb: [
    { label: 'Integrations', labelKey: 'integrations.nav.title', href: '/backend/integrations' },
    { label: 'KSeF', href: '/backend/integrations/ksef' },
    { label: 'Invoices', labelKey: 'ksef.nav.invoices', href: '/backend/integrations/ksef?tab=ksef.injection.invoices' },
    { label: 'Detail' },
  ],
}
