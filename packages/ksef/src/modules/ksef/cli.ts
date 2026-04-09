import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'

function parseArgs(rest: string[]) {
  const args: Record<string, string> = {}
  for (let i = 0; i < rest.length; i += 1) {
    const part = rest[i]
    if (!part) continue
    if (part.startsWith('--')) {
      const [rawKey, rawValue] = part.slice(2).split('=')
      if (rawValue !== undefined) args[rawKey!] = rawValue
      else if (rest[i + 1] && !rest[i + 1]!.startsWith('--')) {
        args[rawKey!] = rest[i + 1]!
        i += 1
      } else {
        args[rawKey!] = 'true'
      }
    }
  }
  return args
}

// ── Test invoice templates ──

interface TestInvoiceTemplate {
  suffix: string
  buyerName: string
  buyerTaxId: string
  buyerAddress: string
  buyerCountryCode: string
  lines: Array<{ description: string; quantity: number; unit: string; unitPriceNet: number; vatRate: string; gtuCode?: string }>
}

const OUTGOING_TEMPLATES: TestInvoiceTemplate[] = [
  {
    suffix: 'FV/TEST/001', buyerName: 'TransPol S.A.', buyerTaxId: '5261234567',
    buyerAddress: 'ul. Marszałkowska 1, 00-001 Warszawa', buyerCountryCode: 'PL',
    lines: [
      { description: 'Domestic freight — LTL Kraków–Warszawa', quantity: 3, unit: 'szt.', unitPriceNet: 1200, vatRate: '23', gtuCode: 'GTU_13' },
      { description: 'Pallet handling', quantity: 12, unit: 'szt.', unitPriceNet: 25, vatRate: '23' },
    ],
  },
  {
    suffix: 'FV/TEST/002', buyerName: 'MegaStore Sp. z o.o.', buyerTaxId: '6781234567',
    buyerAddress: 'ul. Dworcowa 5, 80-001 Gdańsk', buyerCountryCode: 'PL',
    lines: [
      { description: 'Warehousing — 50 pallet spots', quantity: 50, unit: 'szt.', unitPriceNet: 45, vatRate: '23' },
      { description: 'Pick & pack services', quantity: 320, unit: 'szt.', unitPriceNet: 3.5, vatRate: '23' },
    ],
  },
  {
    suffix: 'FV/TEST/003', buyerName: 'EcoFarm Sp. z o.o.', buyerTaxId: '8521234567',
    buyerAddress: 'ul. Polna 12, 62-001 Poznań', buyerCountryCode: 'PL',
    lines: [
      { description: 'Refrigerated transport — perishable goods', quantity: 1, unit: 'szt.', unitPriceNet: 3800, vatRate: '23', gtuCode: 'GTU_13' },
      { description: 'Temperature monitoring (IoT)', quantity: 1, unit: 'szt.', unitPriceNet: 150, vatRate: '23' },
      { description: 'ADR surcharge', quantity: 1, unit: 'szt.', unitPriceNet: 500, vatRate: '23' },
    ],
  },
]

interface FakeSellerTemplate {
  nip: string
  pesel: string
  name: string
  address: string
  suffix: string
  lines: Array<{ description: string; quantity: number; unit: string; unitPriceNet: number; vatRate: string }>
}

const INCOMING_TEMPLATES: FakeSellerTemplate[] = [
  {
    nip: '1111111111', pesel: '90011562112', name: 'PetroTank Test Sp. z o.o.',
    address: 'ul. Paliwowa 3, 41-200 Sosnowiec', suffix: 'FUEL/001',
    lines: [{ description: 'Diesel fuel ON — 3000 liters', quantity: 3000, unit: 'l', unitPriceNet: 5.40, vatRate: '23' }],
  },
  {
    nip: '2222222222', pesel: '80021562113', name: 'AutoSerwis Test',
    address: 'ul. Mechaników 7, 30-200 Kraków', suffix: 'SRV/002',
    lines: [
      { description: 'Truck service — brake system', quantity: 1, unit: 'szt.', unitPriceNet: 3200, vatRate: '23' },
      { description: 'Parts — brake pads set', quantity: 2, unit: 'kpl.', unitPriceNet: 450, vatRate: '23' },
    ],
  },
  {
    nip: '3333333333', pesel: '70031562114', name: 'BiuroTest Sp. z o.o.',
    address: 'ul. Biurowa 1, 31-000 Kraków', suffix: 'RENT/003',
    lines: [
      { description: 'Office rent — monthly', quantity: 1, unit: 'mies.', unitPriceNet: 6500, vatRate: '23' },
      { description: 'Parking (3 spots)', quantity: 3, unit: 'szt.', unitPriceNet: 250, vatRate: '23' },
    ],
  },
]

// ── Helpers ──

function buildLines(lines: TestInvoiceTemplate['lines']) {
  let totalNet = 0
  let totalVat = 0
  const xmlLines = lines.map((l, idx) => {
    const net = Math.round(l.quantity * l.unitPriceNet * 100) / 100
    const rate = parseFloat(l.vatRate) || 0
    const vat = Math.round(net * (rate / 100) * 100) / 100
    totalNet += net
    totalVat += vat
    return {
      lineNumber: idx + 1, description: l.description, quantity: String(l.quantity),
      unit: l.unit, unitPriceNet: String(l.unitPriceNet), netAmount: String(net),
      vatAmount: String(vat), vatRate: l.vatRate, gtuCode: (l as { gtuCode?: string }).gtuCode,
    }
  })
  return { xmlLines, totalNet: Math.round(totalNet * 100) / 100, totalVat: Math.round(totalVat * 100) / 100 }
}

async function resolveCompany(em: EntityManager, container: unknown, tenantId: string, organizationId: string) {
  const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
  const credentialsService = createCredentialsService(em)
  const credentials = await credentialsService.resolve('ksef', { tenantId, organizationId })
  if (!credentials) throw new Error('KSeF credentials not configured')

  const nip = credentials.nip as string
  const environment = (credentials.environment as string ?? 'test') as 'test' | 'demo' | 'production'

  const profile = credentials.company_profile as { name?: string; workingAddress?: string; residenceAddress?: string } | undefined

  return {
    nip, environment, credentials,
    name: profile?.name ?? 'Test Company',
    address: profile?.workingAddress ?? profile?.residenceAddress ?? 'Test Address',
  }
}

// ── Command: send-outgoing ──
// Builds FA(3) XML and sends directly to KSeF. No local DB records.

const sendOutgoingCommand: ModuleCli = {
  command: 'send-outgoing',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = args.tenantId ?? args.tenant ?? ''
    const organizationId = args.organizationId ?? args.org ?? args.orgId ?? ''

    if (!tenantId || !organizationId) {
      console.error('Usage: mercato ksef send-outgoing --tenant <id> --org <id>')
      console.error('')
      console.error('Builds test invoices and submits them directly to KSeF test environment.')
      console.error('No local DB records are created — invoices exist only in KSeF.')
      console.error('Use "Sync from KSeF" with type "Outgoing" to fetch them back.')
      return
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    try {
      const company = await resolveCompany(em, container, tenantId, organizationId)
      console.log(`Seller: ${company.name} (NIP: ${company.nip})`)
      console.log(`Environment: ${company.environment}\n`)

      const { buildFa3Xml } = await import('./lib/xml-builder')
      const { prepareInvoiceForSubmission } = await import('./lib/crypto')
      const { getSendInvoiceUrl, getCloseOnlineSessionUrl } = await import('./lib/endpoints')
      const { KsefAuthService } = await import('./services/auth.service')

      console.log('Authenticating with KSeF...')
      const authService = new KsefAuthService({ container })
      const authResult = await authService.authenticate(em, {
        tenantId, organizationId, nip: company.nip, environment: company.environment,
        credentials: {
          authType: company.credentials.authType as string,
          ksefToken: company.credentials.ksefToken as string | undefined,
          certificatePem: company.credentials.certificatePem as string | undefined,
          privateKeyPem: company.credentials.privateKeyPem as string | undefined,
        },
      })

      const accessToken = authResult.accessToken
      const sessionRef = authResult.session.ksefReferenceNumber!
      const session = authResult.session
      const sessionKey = session.encryptionKey ? Buffer.from(session.encryptionKey, 'base64') : undefined
      const sessionIv = session.encryptionIv ? Buffer.from(session.encryptionIv, 'base64') : undefined
      const today = new Date().toISOString().slice(0, 10)
      console.log('Authenticated.\n')

      let submitted = 0
      for (const tmpl of OUTGOING_TEMPLATES) {
        const invoiceNumber = `${tmpl.suffix}/${today.replace(/-/g, '')}`
        const { xmlLines, totalNet, totalVat } = buildLines(tmpl.lines)
        const gross = totalNet + totalVat

        const xml = buildFa3Xml({
          invoiceNumber, invoiceDate: new Date(today),
          sellerName: company.name, sellerTaxId: company.nip, sellerAddress: company.address, sellerCountryCode: 'PL',
          buyerName: tmpl.buyerName, buyerTaxId: tmpl.buyerTaxId, buyerAddress: tmpl.buyerAddress, buyerCountryCode: tmpl.buyerCountryCode,
          grossAmount: String(gross), currencyCode: 'PLN', paymentMethod: '1', invoiceType: 'VAT',
        }, xmlLines)

        const prepared = prepareInvoiceForSubmission(xml, sessionKey, sessionIv)
        console.log(`Submitting ${invoiceNumber} → ${tmpl.buyerName} (${gross.toFixed(2)} PLN)...`)

        const resp = await fetch(getSendInvoiceUrl(company.environment, sessionRef), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify({ invoiceHash: prepared.invoiceHash, invoiceSize: prepared.invoiceSize, encryptedInvoiceHash: prepared.encryptedInvoiceHash, encryptedInvoiceSize: prepared.encryptedInvoiceSize, encryptedInvoiceContent: prepared.encryptedInvoiceContent, offlineMode: false }),
        })

        if (!resp.ok) {
          const err = await resp.text()
          console.error(`  FAILED (${resp.status}): ${err.substring(0, 200)}`)
        } else {
          const result = (await resp.json()) as { referenceNumber: string }
          console.log(`  ✓ Ref: ${result.referenceNumber}`)
          submitted++
        }
      }

      try { await fetch(getCloseOnlineSessionUrl(company.environment, sessionRef), { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } }) } catch {}

      console.log(`\n${submitted}/${OUTGOING_TEMPLATES.length} outgoing invoices sent to KSeF.`)
      if (submitted > 0) console.log('Sync them back with "Sync from KSeF" type "Outgoing".')
    } finally {
      const d = container as unknown as { dispose?: () => Promise<void> }
      if (typeof d.dispose === 'function') await d.dispose()
    }
  },
}

// ── Command: send-incoming ──
// Uses Python ksef2 SDK to create fake sellers, generate tokens, authenticate,
// and submit invoices with our NIP as buyer — directly to KSeF, no local DB.

async function generateTestToken(nip: string, pesel: string, name: string): Promise<string> {
  const { execSync } = await import('child_process')
  const escapedName = name.replace(/"/g, '\\"')
  const script = [
    'from ksef2 import Client, Environment',
    'client = Client(environment=Environment.TEST)',
    'try:',
    `    client.testdata.create_person(nip="${nip}", pesel="${pesel}", description="Admin ${escapedName}")`,
    'except: pass',
    `auth = client.authentication.with_test_certificate(nip="${nip}")`,
    `token = auth.tokens.generate(description="Incoming test", permissions=["invoice_read","invoice_write","credentials_read","credentials_manage"])`,
    'print(token.token)',
  ].join('\n')
  const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, { timeout: 60000 }).toString().trim()
  return result.split('\n').pop()!
}

const sendIncomingCommand: ModuleCli = {
  command: 'send-incoming',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = args.tenantId ?? args.tenant ?? ''
    const organizationId = args.organizationId ?? args.org ?? args.orgId ?? ''

    if (!tenantId || !organizationId) {
      console.error('Usage: mercato ksef send-incoming --tenant <id> --org <id>')
      console.error('')
      console.error('Creates fake sellers on KSeF test env (via Python ksef2), authenticates as')
      console.error('each seller, and submits invoices with your NIP as buyer — directly to KSeF.')
      console.error('No local DB records. Fetch them with "Sync from KSeF" type "Incoming".')
      console.error('')
      console.error('Requires: Python 3 with ksef2 package installed.')
      return
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    try {
      const company = await resolveCompany(em, container, tenantId, organizationId)
      if (company.environment !== 'test') {
        console.error(`ERROR: Only works on test environment. Current: ${company.environment}`)
        return
      }

      console.log(`Buyer: ${company.name} (NIP: ${company.nip})`)
      console.log(`Environment: ${company.environment}\n`)

      const { buildFa3Xml } = await import('./lib/xml-builder')
      const { prepareInvoiceForSubmission } = await import('./lib/crypto')
      const { getSendInvoiceUrl, getCloseOnlineSessionUrl } = await import('./lib/endpoints')
      const { KsefAuthService } = await import('./services/auth.service')
      const today = new Date().toISOString().slice(0, 10)
      let submitted = 0

      for (const seller of INCOMING_TEMPLATES) {
        console.log(`\n── ${seller.name} (NIP: ${seller.nip}) ──`)

        console.log('  Generating KSeF token via ksef2...')
        let token: string
        try {
          token = await generateTestToken(seller.nip, seller.pesel, seller.name)
          console.log(`  Token: ${token.substring(0, 30)}...`)
        } catch (err) {
          console.error(`  Token generation failed: ${err instanceof Error ? err.message : err}`)
          continue
        }

        console.log('  Authenticating...')
        try {
          const authService = new KsefAuthService({ container })
          const authResult = await authService.authenticate(em, {
            tenantId, organizationId, nip: seller.nip, environment: company.environment,
            credentials: { authType: 'token', ksefToken: token },
          })

          const accessToken = authResult.accessToken
          const sessionRef = authResult.session.ksefReferenceNumber!
          const session = authResult.session
          const sessionKey = session.encryptionKey ? Buffer.from(session.encryptionKey, 'base64') : undefined
          const sessionIv = session.encryptionIv ? Buffer.from(session.encryptionIv, 'base64') : undefined

          const invoiceNumber = `${seller.suffix}/${today.replace(/-/g, '')}`
          const { xmlLines, totalNet, totalVat } = buildLines(seller.lines)
          const gross = totalNet + totalVat

          const xml = buildFa3Xml({
            invoiceNumber, invoiceDate: new Date(today),
            sellerName: seller.name, sellerTaxId: seller.nip, sellerAddress: seller.address, sellerCountryCode: 'PL',
            buyerName: company.name, buyerTaxId: company.nip, buyerAddress: company.address, buyerCountryCode: 'PL',
            grossAmount: String(gross), currencyCode: 'PLN', paymentMethod: '1', invoiceType: 'VAT',
          }, xmlLines)

          const prepared = prepareInvoiceForSubmission(xml, sessionKey, sessionIv)
          console.log(`  Submitting ${invoiceNumber} (${gross.toFixed(2)} PLN)...`)

          const resp = await fetch(getSendInvoiceUrl(company.environment, sessionRef), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ invoiceHash: prepared.invoiceHash, invoiceSize: prepared.invoiceSize, encryptedInvoiceHash: prepared.encryptedInvoiceHash, encryptedInvoiceSize: prepared.encryptedInvoiceSize, encryptedInvoiceContent: prepared.encryptedInvoiceContent, offlineMode: false }),
          })

          if (!resp.ok) {
            const err = await resp.text()
            console.error(`  FAILED (${resp.status}): ${err.substring(0, 200)}`)
          } else {
            const result = (await resp.json()) as { referenceNumber: string }
            console.log(`  ✓ Submitted! Ref: ${result.referenceNumber}`)
            submitted++
          }

          try { await fetch(getCloseOnlineSessionUrl(company.environment, sessionRef), { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } }) } catch {}
        } catch (err) {
          console.error(`  Failed: ${err instanceof Error ? err.message : err}`)
        }
      }

      console.log(`\n${submitted}/${INCOMING_TEMPLATES.length} incoming invoices sent to KSeF.`)
      if (submitted > 0) console.log('Fetch them with "Sync from KSeF" type "Incoming".')
    } finally {
      const d = container as unknown as { dispose?: () => Promise<void> }
      if (typeof d.dispose === 'function') await d.dispose()
    }
  },
}

export default [sendOutgoingCommand, sendIncomingCommand]
