import { buildIntegrationDetailWidgetSpotId, type IntegrationBundle, type IntegrationDefinition } from '@open-mercato/shared/modules/integrations/types'

export const ksefDetailWidgetSpotId = buildIntegrationDetailWidgetSpotId('ksef')

export const integration: IntegrationDefinition = {
  id: 'ksef',
  title: 'KSeF',
  description: 'Polish National e-Invoice System (Krajowy System e-Faktur) — submit, track, and receive e-invoices via the government KSeF API.',
  category: 'e_invoicing',
  providerKey: 'ksef',
  icon: 'file-text',
  docsUrl: 'https://www.podatki.gov.pl/ksef/',
  package: '@open-mercato/ksef',
  version: '1.0.0',
  author: 'Open Mercato Team',
  company: 'Open Mercato',
  license: 'MIT',
  tags: ['e-invoicing', 'ksef', 'poland', 'vat', 'fa3'],
  detailPage: {
    widgetSpotId: ksefDetailWidgetSpotId,
  },
  credentials: {
    fields: [
      {
        key: 'nip',
        label: 'NIP (Tax ID)',
        type: 'text',
        required: true,
        placeholder: '1234567890',
        helpText: 'Polish Tax Identification Number (10 digits, no dashes). This is the seller NIP used for KSeF authentication.',
      },
      {
        key: 'authType',
        label: 'Authentication Type',
        type: 'select',
        required: true,
        helpText: 'Token-based auth is simpler; certificate-based auth uses XAdES signatures for higher security.',
      },
      {
        key: 'ksefToken',
        label: 'KSeF Authorization Token',
        type: 'secret',
        required: false,
        helpText: 'Token generated in the KSeF web portal under Credentials management.',
        visibleWhen: { field: 'authType', equals: 'token' },
      },
      {
        key: 'certificatePem',
        label: 'Certificate (PEM)',
        type: 'secret',
        required: false,
        helpText: 'PEM-encoded X.509 certificate registered with KSeF.',
        visibleWhen: { field: 'authType', equals: 'certificate' },
      },
      {
        key: 'privateKeyPem',
        label: 'Private Key (PEM)',
        type: 'secret',
        required: false,
        helpText: 'PEM-encoded private key matching the certificate above.',
        visibleWhen: { field: 'authType', equals: 'certificate' },
      },
      {
        key: 'environment',
        label: 'KSeF Environment',
        type: 'select',
        required: true,
        helpText: 'Use "test" for development, "demo" for pre-production validation, "production" for live invoices.',
      },
    ],
  },
  healthCheck: { service: 'ksefHealthCheck' },
}

export const integrations: IntegrationDefinition[] = [integration]
export const bundles: IntegrationBundle[] = []
export const bundle: IntegrationBundle | undefined = undefined
