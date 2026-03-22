import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  InvoicingInvoice,
  InvoicingKsefCredential,
  InvoicingKsefSession,
  InvoicingSettings,
} from './data/entities'
import {
  getTestDataSubjectUrl,
  getTestDataPersonUrl,
  getTestDataPermissionsUrl,
  getTestDataSubjectRemoveUrl,
  getTestDataPersonRemoveUrl,
  getTestDataPermissionsRevokeUrl,
  getAuthChallengeUrl,
  getPublicKeyCertificatesUrl,
  getDocsUrl,
  getOpenApiJsonUrl,
} from './lib/ksef/endpoints'
import type { KsefEnvironment } from './data/types'

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg?.startsWith('--')) {
      if (arg.includes('=')) {
        const [k, v] = arg.slice(2).split('=')
        result[k] = v ?? ''
      } else {
        const key = arg.slice(2)
        const nextArg = args[i + 1]
        if (nextArg && !nextArg.startsWith('--')) {
          result[key] = nextArg
          i++
        } else {
          result[key] = true
        }
      }
    }
  }
  return result
}

function resolveEnv(args: Record<string, string | boolean>): KsefEnvironment {
  const env = String(args.env ?? args.environment ?? 'test')
  if (env === 'test' || env === 'demo' || env === 'production') return env
  console.error(`Invalid environment "${env}". Use: test, demo, production`)
  process.exit(1)
}

// ========================================
// ksef:setup-test — Create test data on KSeF test env
// ========================================

const setupTestCommand: ModuleCli = {
  command: 'ksef:setup-test',
  async run(rest) {
    const args = parseArgs(rest)
    const nip = String(args.nip ?? '')
    const pesel = String(args.pesel ?? '')
    const description = String(args.description ?? args.desc ?? 'Test Company')
    const env = resolveEnv(args)

    if (!nip) {
      console.log(`
Usage: yarn mercato invoicing ksef:setup-test --nip <NIP> [options]

Creates test subject + person + permissions on KSeF test environment.

Options:
  --nip <NIP>           Polish Tax ID (10 digits, required)
  --pesel <PESEL>       PESEL of the person (11 digits, optional for subject-only)
  --description <text>  Description (default: "Test Company")
  --env <environment>   test|demo|production (default: test)

Examples:
  yarn mercato invoicing ksef:setup-test --nip 7980332920 --pesel 30112206276
  yarn mercato invoicing ksef:setup-test --nip 7980332920 --desc "My Test Corp"
`)
      return
    }

    console.log(`\nSetting up KSeF test data on ${env} environment...`)
    console.log(`  NIP: ${nip}`)

    // Step 1: Create test subject
    console.log('\n1. Creating test subject...')
    const subjectUrl = getTestDataSubjectUrl(env)
    const subjectResponse = await fetch(subjectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectNip: nip,
        subjectType: 'Standard',
        description,
      }),
    })

    if (subjectResponse.ok) {
      console.log('   Subject created successfully')
    } else {
      const err = await subjectResponse.text()
      console.log(`   Subject creation: ${subjectResponse.status} — ${err.slice(0, 200)}`)
      console.log('   (This may be OK if subject already exists)')
    }

    // Step 2: Create test person (if PESEL provided)
    if (pesel) {
      console.log('\n2. Creating test person...')
      const personUrl = getTestDataPersonUrl(env)
      const personResponse = await fetch(personUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nip,
          pesel,
          description: `Person for ${description}`,
          isBailiff: false,
        }),
      })

      if (personResponse.ok) {
        console.log('   Person created successfully')
      } else {
        const err = await personResponse.text()
        console.log(`   Person creation: ${personResponse.status} — ${err.slice(0, 200)}`)
      }

      // Step 3: Grant permissions
      console.log('\n3. Granting permissions...')
      const permUrl = getTestDataPermissionsUrl(env)
      const permResponse = await fetch(permUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextIdentifier: { value: nip, type: 'nip' },
          authorizedIdentifier: { value: pesel, type: 'pesel' },
          permissions: [
            { permissionType: 'InvoiceRead', description: `Read invoices for NIP ${nip}` },
            { permissionType: 'InvoiceWrite', description: `Write invoices for NIP ${nip}` },
            { permissionType: 'CredentialsManage', description: `Manage credentials for NIP ${nip}` },
            { permissionType: 'CredentialsRead', description: `Read credentials for NIP ${nip}` },
            { permissionType: 'Introspection', description: `Introspection for NIP ${nip}` },
          ],
        }),
      })

      if (permResponse.ok) {
        console.log('   Permissions granted successfully')
      } else {
        const err = await permResponse.text()
        console.log(`   Permissions: ${permResponse.status} — ${err.slice(0, 200)}`)
      }
    } else {
      console.log('\n2. Skipping person creation (no --pesel provided)')
      console.log('3. Skipping permissions (no --pesel provided)')
    }

    console.log('\nTest data setup complete.')
    console.log(`\nNext steps:`)
    console.log(`  1. Generate a self-signed certificate:`)
    console.log(`     openssl genrsa -out ksef-test-key.pem 2048`)
    console.log(`     openssl req -new -x509 -key ksef-test-key.pem -out ksef-test-cert.pem -days 365 \\`)
    console.log(`       -subj "/CN=Test/O=${description}/C=PL${pesel ? `/serialNumber=PNOPL-${pesel}` : ''}"`)
    console.log(`  2. Create a credential in the app:`)
    console.log(`     yarn mercato invoicing ksef:add-credential --nip ${nip} --cert ksef-test-cert.pem --key ksef-test-key.pem --tenant <id> --org <id>`)
  },
}

// ========================================
// ksef:cleanup-test — Remove test data
// ========================================

const cleanupTestCommand: ModuleCli = {
  command: 'ksef:cleanup-test',
  async run(rest) {
    const args = parseArgs(rest)
    const nip = String(args.nip ?? '')
    const pesel = String(args.pesel ?? '')
    const env = resolveEnv(args)

    if (!nip) {
      console.error('Usage: yarn mercato invoicing ksef:cleanup-test --nip <NIP> [--pesel <PESEL>] [--env test]')
      return
    }

    console.log(`\nCleaning up KSeF test data on ${env} environment...`)

    if (pesel) {
      const revokeUrl = getTestDataPermissionsRevokeUrl(env)
      await fetch(revokeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextIdentifier: { value: nip, type: 'nip' },
          authorizedIdentifier: { value: pesel, type: 'pesel' },
          permissions: [
            { permissionType: 'InvoiceRead' },
            { permissionType: 'InvoiceWrite' },
            { permissionType: 'CredentialsManage' },
            { permissionType: 'CredentialsRead' },
            { permissionType: 'Introspection' },
          ],
        }),
      })
      console.log('  Permissions revoked')

      const removePersonUrl = getTestDataPersonRemoveUrl(env)
      await fetch(removePersonUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip, pesel }),
      })
      console.log('  Person removed')
    }

    const removeSubjectUrl = getTestDataSubjectRemoveUrl(env)
    await fetch(removeSubjectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectNip: nip }),
    })
    console.log('  Subject removed')

    console.log('\nCleanup complete.')
  },
}

// ========================================
// ksef:test-connection — Test KSeF API connectivity
// ========================================

const testConnectionCommand: ModuleCli = {
  command: 'ksef:test-connection',
  async run(rest) {
    const args = parseArgs(rest)
    const env = resolveEnv(args)

    console.log(`\nTesting KSeF API connectivity (${env} environment)...`)
    console.log(`  API docs: ${getDocsUrl(env)}`)
    console.log(`  OpenAPI:  ${getOpenApiJsonUrl(env)}`)

    // Test 1: Auth challenge endpoint
    console.log('\n1. Testing auth challenge endpoint...')
    const challengeUrl = getAuthChallengeUrl(env)
    try {
      const response = await fetch(challengeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      console.log(`   POST ${challengeUrl}`)
      console.log(`   Status: ${response.status}`)
      if (response.ok) {
        const body = await response.json()
        console.log(`   Challenge received: ${JSON.stringify(body).slice(0, 100)}...`)
      } else {
        const text = await response.text()
        console.log(`   Response: ${text.slice(0, 200)}`)
      }
    } catch (err) {
      console.error(`   Failed: ${err instanceof Error ? err.message : err}`)
    }

    // Test 2: Public key certificates endpoint
    console.log('\n2. Testing public key certificates endpoint...')
    const pkUrl = getPublicKeyCertificatesUrl(env)
    try {
      const response = await fetch(pkUrl)
      console.log(`   GET ${pkUrl}`)
      console.log(`   Status: ${response.status}`)
      if (response.ok) {
        const text = await response.text()
        console.log(`   Response length: ${text.length} bytes`)
      }
    } catch (err) {
      console.error(`   Failed: ${err instanceof Error ? err.message : err}`)
    }

    console.log('\nConnection test complete.')
  },
}

// ========================================
// ksef:add-credential — Add KSeF credential to DB
// ========================================

const addCredentialCommand: ModuleCli = {
  command: 'ksef:add-credential',
  async run(rest) {
    const args = parseArgs(rest)
    const nip = String(args.nip ?? '')
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.org ?? args.orgId ?? '')
    const env = resolveEnv(args)
    const label = String(args.label ?? `KSeF ${env} credential`)
    const certPath = String(args.cert ?? args.certificate ?? '')
    const keyPath = String(args.key ?? args.privateKey ?? '')
    const token = String(args.token ?? '')

    if (!nip || !tenantId || !organizationId) {
      console.log(`
Usage: yarn mercato invoicing ksef:add-credential --nip <NIP> --tenant <id> --org <id> [options]

Options:
  --nip <NIP>           Polish Tax ID (required)
  --tenant <id>         Tenant ID (required)
  --org <id>            Organization ID (required)
  --env <environment>   test|demo|production (default: test)
  --label <text>        Label (default: "KSeF <env> credential")

  Certificate auth:
  --cert <path>         Path to certificate PEM file
  --key <path>          Path to private key PEM file

  Token auth:
  --token <token>       KSeF authorization token
`)
      return
    }

    if (!certPath && !token) {
      console.error('Either --cert/--key (certificate) or --token (token auth) is required')
      return
    }

    const { resolve } = await createRequestContainer()
    const em = resolve('em') as EntityManager

    try {
      let authType: 'certificate' | 'token'
      let certificatePem: string | null = null
      let privateKeyPem: string | null = null
      let ksefToken: string | null = null

      if (certPath) {
        authType = 'certificate'
        const fs = await import('fs')
        certificatePem = fs.readFileSync(certPath, 'utf-8')
        if (keyPath) {
          privateKeyPem = fs.readFileSync(keyPath, 'utf-8')
        }
        console.log(`  Auth type: certificate`)
        console.log(`  Certificate: ${certPath}`)
        console.log(`  Private key: ${keyPath || '(not provided)'}`)
      } else {
        authType = 'token'
        ksefToken = token
        console.log(`  Auth type: token`)
      }

      const existing = await em.findOne(InvoicingKsefCredential, {
        organizationId,
        tenantId,
        nip,
        environment: env,
      })

      if (existing) {
        existing.authType = authType
        existing.ksefToken = ksefToken
        existing.certificatePem = certificatePem
        existing.privateKeyPem = privateKeyPem
        existing.label = label
        existing.isActive = true
        console.log(`\nUpdated existing credential: ${existing.id}`)
      } else {
        const credential = em.create(InvoicingKsefCredential, {
          organizationId,
          tenantId,
          nip,
          authType,
          ksefToken,
          certificatePem,
          privateKeyPem,
          environment: env,
          label,
          isActive: true,
        })
        em.persist(credential)
        console.log(`\nCreated new credential`)
      }

      await em.flush()
      console.log(`  NIP: ${nip}`)
      console.log(`  Environment: ${env}`)
      console.log(`  Tenant: ${tenantId}`)
      console.log(`  Organization: ${organizationId}`)
      console.log('\nCredential saved.')
    } finally {
      const disposable = resolve as unknown as { dispose?: () => Promise<void> }
      if (typeof disposable.dispose === 'function') await disposable.dispose()
    }
  },
}

// ========================================
// ksef:list-credentials — List stored credentials
// ========================================

const listCredentialsCommand: ModuleCli = {
  command: 'ksef:list-credentials',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.org ?? args.orgId ?? '')

    if (!tenantId || !organizationId) {
      console.error('Usage: yarn mercato invoicing ksef:list-credentials --tenant <id> --org <id>')
      return
    }

    const { resolve } = await createRequestContainer()
    const em = resolve('em') as EntityManager

    try {
      const credentials = await em.find(InvoicingKsefCredential, {
        tenantId,
        organizationId,
      })

      if (credentials.length === 0) {
        console.log('\nNo KSeF credentials found.')
        return
      }

      console.log(`\nKSeF Credentials (${credentials.length}):`)
      console.log('─'.repeat(80))
      for (const cred of credentials) {
        console.log(`  ID:          ${cred.id}`)
        console.log(`  NIP:         ${cred.nip}`)
        console.log(`  Auth type:   ${cred.authType}`)
        console.log(`  Environment: ${cred.environment}`)
        console.log(`  Active:      ${cred.isActive}`)
        console.log(`  Label:       ${cred.label ?? '(none)'}`)
        console.log(`  Last used:   ${cred.lastUsedAt ?? 'never'}`)
        console.log('─'.repeat(80))
      }
    } finally {
      const disposable = resolve as unknown as { dispose?: () => Promise<void> }
      if (typeof disposable.dispose === 'function') await disposable.dispose()
    }
  },
}

// ========================================
// ksef:status — Show settings and status
// ========================================

const statusCommand: ModuleCli = {
  command: 'ksef:status',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.org ?? args.orgId ?? '')

    if (!tenantId || !organizationId) {
      console.error('Usage: yarn mercato invoicing ksef:status --tenant <id> --org <id>')
      return
    }

    const { resolve } = await createRequestContainer()
    const em = resolve('em') as EntityManager

    try {
      const settings = await em.findOne(InvoicingSettings, { tenantId, organizationId })
      const credentialCount = await em.count(InvoicingKsefCredential, { tenantId, organizationId })
      const activeSessionCount = await em.count(InvoicingKsefSession, {
        tenantId,
        organizationId,
        sessionStatus: 'active',
      })

      const invoiceCounts = {
        total: await em.count(InvoicingInvoice, { tenantId, organizationId, deletedAt: null }),
        draft: await em.count(InvoicingInvoice, { tenantId, organizationId, status: 'draft', deletedAt: null }),
        approved: await em.count(InvoicingInvoice, { tenantId, organizationId, status: 'approved', deletedAt: null }),
        ksefQueued: await em.count(InvoicingInvoice, { tenantId, organizationId, ksefStatus: 'queued', deletedAt: null }),
        ksefSubmitted: await em.count(InvoicingInvoice, { tenantId, organizationId, ksefStatus: 'submitted', deletedAt: null }),
        ksefAccepted: await em.count(InvoicingInvoice, { tenantId, organizationId, ksefStatus: 'accepted', deletedAt: null }),
        ksefRejected: await em.count(InvoicingInvoice, { tenantId, organizationId, ksefStatus: 'rejected', deletedAt: null }),
        ksefError: await em.count(InvoicingInvoice, { tenantId, organizationId, ksefStatus: 'error', deletedAt: null }),
      }

      console.log('\nInvoicing Status')
      console.log('═'.repeat(50))

      console.log('\nSettings:')
      if (settings) {
        console.log(`  KSeF environment:     ${settings.ksefEnvironment}`)
        console.log(`  KSeF auto-submit:     ${settings.ksefAutoSubmit}`)
        console.log(`  KSeF session mode:    ${settings.ksefSessionMode}`)
        console.log(`  Default seller NIP:   ${settings.defaultSellerNip ?? '(not set)'}`)
        console.log(`  Auto-import docs:     ${settings.autoImportFromDocuments}`)
        console.log(`  Auto-import sales:    ${settings.autoImportFromSales}`)
        console.log(`  Offline mode:         ${settings.offlineMode}`)
      } else {
        console.log('  (not configured — using defaults)')
      }

      console.log(`\nCredentials:        ${credentialCount}`)
      console.log(`Active sessions:    ${activeSessionCount}`)

      console.log('\nInvoices:')
      console.log(`  Total:            ${invoiceCounts.total}`)
      console.log(`  Draft:            ${invoiceCounts.draft}`)
      console.log(`  Approved:         ${invoiceCounts.approved}`)
      console.log(`  KSeF queued:      ${invoiceCounts.ksefQueued}`)
      console.log(`  KSeF submitted:   ${invoiceCounts.ksefSubmitted}`)
      console.log(`  KSeF accepted:    ${invoiceCounts.ksefAccepted}`)
      console.log(`  KSeF rejected:    ${invoiceCounts.ksefRejected}`)
      console.log(`  KSeF errors:      ${invoiceCounts.ksefError}`)
    } finally {
      const disposable = resolve as unknown as { dispose?: () => Promise<void> }
      if (typeof disposable.dispose === 'function') await disposable.dispose()
    }
  },
}

// ========================================
// ksef:backfill — Import existing invoices
// ========================================

const backfillCommand: ModuleCli = {
  command: 'ksef:backfill',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.org ?? args.orgId ?? '')
    const statusFilter = String(args.status ?? 'approved')

    if (!tenantId || !organizationId) {
      console.error('Usage: yarn mercato invoicing ksef:backfill --tenant <id> --org <id> [--status approved]')
      return
    }

    const { resolve } = await createRequestContainer()
    const em = resolve('em') as EntityManager

    try {
      const { InvoicingService } = await import('./services/invoicing.service')
      const service = new InvoicingService({ container: { resolve } as any })

      const knex = em.getKnex()
      const existingIds = await knex.raw<{ rows: Array<{ source_document_invoice_id: string }> }>(
        `SELECT source_document_invoice_id FROM invoicing_invoices
         WHERE organization_id = ? AND tenant_id = ? AND source_document_invoice_id IS NOT NULL AND deleted_at IS NULL`,
        [organizationId, tenantId]
      )
      const importedIds = new Set(existingIds.rows.map((r) => r.source_document_invoice_id))

      const sourceRows = await knex.raw<{ rows: Array<{ id: string }> }>(
        `SELECT id FROM fms_invoices
         WHERE organization_id = ? AND tenant_id = ? AND status = ? AND deleted_at IS NULL`,
        [organizationId, tenantId, statusFilter]
      )

      let imported = 0
      let skipped = 0

      for (const row of sourceRows.rows) {
        if (importedIds.has(row.id)) {
          skipped++
          continue
        }

        try {
          await service.importFromDocumentInvoice(em, {
            sourceInvoiceId: row.id,
            tenantId,
            organizationId,
          })
          imported++
        } catch (err) {
          console.error(`  Failed to import ${row.id}: ${err instanceof Error ? err.message : err}`)
        }
      }

      console.log(`\nBackfill complete:`)
      console.log(`  Source invoices: ${sourceRows.rows.length}`)
      console.log(`  Imported:        ${imported}`)
      console.log(`  Skipped:         ${skipped}`)
    } finally {
      const disposable = resolve as unknown as { dispose?: () => Promise<void> }
      if (typeof disposable.dispose === 'function') await disposable.dispose()
    }
  },
}

// ========================================
// ksef:sync-received — Trigger receive sync
// ========================================

const syncReceivedCommand: ModuleCli = {
  command: 'ksef:sync-received',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.org ?? args.orgId ?? '')
    const dateFrom = args.dateFrom ? String(args.dateFrom) : undefined
    const dateTo = args.dateTo ? String(args.dateTo) : undefined

    if (!tenantId || !organizationId) {
      console.log(`
Usage: yarn mercato invoicing ksef:sync-received --tenant <id> --org <id> [options]

Enqueues a job to download received invoices from KSeF.

Options:
  --tenant <id>      Tenant ID (required)
  --org <id>         Organization ID (required)
  --date-from <date> Start date (YYYY-MM-DD, optional)
  --date-to <date>   End date (YYYY-MM-DD, optional)

Examples:
  yarn mercato invoicing ksef:sync-received --tenant abc --org def
  yarn mercato invoicing ksef:sync-received --tenant abc --org def --date-from 2026-01-01 --date-to 2026-03-22
`)
      return
    }

    const { resolve } = await createRequestContainer()
    const em = resolve('em') as EntityManager

    try {
      const settings = await em.findOne(InvoicingSettings, { tenantId, organizationId })
      const nip = settings?.defaultSellerNip

      if (!nip) {
        console.error('Error: Default seller NIP is not configured in invoicing settings.')
        console.error('Configure it via: POST /api/invoicing/settings')
        return
      }

      const { createQueue } = await import('@open-mercato/queue')
      const receiveQueue = createQueue<{
        tenantId: string
        organizationId: string
        nip: string
        dateFrom?: string
        dateTo?: string
      }>('invoicing-ksef-receive-sync', 'local')

      await receiveQueue.enqueue({
        tenantId,
        organizationId,
        nip,
        dateFrom,
        dateTo,
      })

      console.log('\nReceive sync job enqueued.')
      console.log(`  NIP:       ${nip}`)
      console.log(`  Tenant:    ${tenantId}`)
      console.log(`  Org:       ${organizationId}`)
      console.log(`  Date from: ${dateFrom ?? '(default)'}`)
      console.log(`  Date to:   ${dateTo ?? '(default)'}`)
    } finally {
      const disposable = resolve as unknown as { dispose?: () => Promise<void> }
      if (typeof disposable.dispose === 'function') await disposable.dispose()
    }
  },
}

// ========================================
// help
// ========================================

const helpCommand: ModuleCli = {
  command: 'help',
  async run() {
    console.log(`
Usage: yarn mercato invoicing <command> [options]

KSeF Test Environment Commands:
  ksef:setup-test         Create test subject + person + permissions on KSeF test env
  ksef:cleanup-test       Remove test data from KSeF test env
  ksef:test-connection    Test KSeF API connectivity

Credential Management:
  ksef:add-credential     Add or update KSeF credential in database
  ksef:list-credentials   List stored KSeF credentials

Status & Operations:
  ksef:status             Show invoicing settings and invoice counts
  ksef:backfill           Import existing invoices from fms_documents
  ksef:sync-received      Trigger KSeF received invoice sync

  help                    Show this help message

Common Options:
  --tenant <id>           Tenant ID
  --org <id>              Organization ID
  --env <environment>     KSeF environment: test (default), demo, production
  --nip <NIP>             Polish Tax ID (10 digits)

Examples:
  yarn mercato invoicing ksef:setup-test --nip 7980332920 --pesel 30112206276
  yarn mercato invoicing ksef:test-connection --env test
  yarn mercato invoicing ksef:add-credential --nip 7980332920 --cert cert.pem --key key.pem --tenant <id> --org <id>
  yarn mercato invoicing ksef:status --tenant <id> --org <id>
  yarn mercato invoicing ksef:backfill --tenant <id> --org <id>
  yarn mercato invoicing ksef:sync-received --tenant <id> --org <id> --date-from 2026-01-01
`)
  },
}

export default [
  setupTestCommand,
  cleanupTestCommand,
  testConnectionCommand,
  addCredentialCommand,
  listCredentialsCommand,
  statusCommand,
  backfillCommand,
  syncReceivedCommand,
  helpCommand,
]
