#!/usr/bin/env npx tsx

/**
 * Shipment Tracking Test CLI
 *
 * Helper script to register webhooks and create shipments for testing.
 *
 * Usage:
 *   npx tsx packages/shipment-tracking/scripts/test-tracking-cli.ts <command> [options]
 *
 * Commands:
 *   register-webhook  Register a webhook endpoint
 *   create-shipment   Create a shipment for tracking
 *   list-shipments    List existing shipments
 *   list-webhooks     List registered webhooks
 *   poll-now          Trigger immediate poll for a tracking job
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const API_KEY = process.env.API_KEY || ''

interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  total?: number
  items?: T[]
}

async function apiCall<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (API_KEY) {
    headers['x-api-key'] = API_KEY
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()

    if (!response.ok) {
      return { ok: false, error: data.error || data.message || `HTTP ${response.status}` }
    }

    return { ok: true, data, total: data.total, items: data.items }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function colorize(text: string, color: string): string {
  const colors: Record<string, string> = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
  }
  return `${colors[color] ?? ''}${text}${colors.reset}`
}

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {}
  const argv = process.argv.slice(2)

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg) continue

    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const nextArg = argv[i + 1]

      if (key.includes('=')) {
        const [k, v] = key.split('=')
        args[k] = v
      } else if (nextArg && !nextArg.startsWith('--')) {
        args[key] = nextArg
        i++
      } else {
        args[key] = true
      }
    } else if (!args._command) {
      args._command = arg
    }
  }

  return args
}

async function registerWebhook(args: Record<string, string | boolean>): Promise<void> {
  const url = (args.url as string) || 'http://localhost:3456/webhook'
  const events = (args.events as string)?.split(',') || ['*']
  const secret = (args.secret as string) || 'test-secret-for-debugging'

  console.log('')
  console.log(colorize('Registering webhook...', 'cyan'))
  console.log(`  URL:    ${url}`)
  console.log(`  Events: ${events.join(', ')}`)
  console.log(`  Secret: ${secret}`)
  console.log('')

  const result = await apiCall('POST', '/api/shipment-tracking/webhooks', {
    url,
    eventsSubscribed: events,
    hmacSecret: secret,
    isActive: true,
  })

  if (!result.ok) {
    console.log(colorize(`Error: ${result.error}`, 'red'))
    process.exit(1)
  }

  console.log(colorize('Webhook registered successfully!', 'green'))
  console.log(JSON.stringify(result.data, null, 2))
}

async function createShipment(args: Record<string, string | boolean>): Promise<void> {
  const containerNumber = args.container as string
  const bookingNumber = args.booking as string
  const bolNumber = args.bol as string
  const carrierCode = (args.carrier as string) || undefined

  if (!containerNumber && !bookingNumber && !bolNumber) {
    console.log(colorize('Error: At least one of --container, --booking, or --bol is required', 'red'))
    process.exit(1)
  }

  console.log('')
  console.log(colorize('Creating shipment...', 'cyan'))
  if (containerNumber) console.log(`  Container: ${containerNumber}`)
  if (bookingNumber) console.log(`  Booking:   ${bookingNumber}`)
  if (bolNumber) console.log(`  BOL:       ${bolNumber}`)
  if (carrierCode) console.log(`  Carrier:   ${carrierCode}`)
  console.log('')

  const result = await apiCall('POST', '/api/shipment-tracking/shipments', {
    containerNumber,
    bookingNumber,
    bolNumber,
    carrierCode,
  })

  if (!result.ok) {
    console.log(colorize(`Error: ${result.error}`, 'red'))
    process.exit(1)
  }

  console.log(colorize('Shipment created successfully!', 'green'))
  console.log(JSON.stringify(result.data, null, 2))
}

async function listShipments(): Promise<void> {
  console.log('')
  console.log(colorize('Fetching shipments...', 'cyan'))

  const result = await apiCall('GET', '/api/shipment-tracking/shipments?pageSize=50')

  if (!result.ok) {
    console.log(colorize(`Error: ${result.error}`, 'red'))
    process.exit(1)
  }

  const data = result.data as { items?: unknown[]; total?: number }

  console.log(`Total: ${data.total ?? 0}`)
  console.log('')

  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items) {
      const s = item as Record<string, unknown>
      console.log(
        colorize(s.id as string, 'gray'),
        colorize(s.status as string, 'cyan'),
        s.containerNumber || s.bookingNumber || s.bolNumber || '-',
        s.carrierCode || '-',
      )
    }
  }
}

async function listWebhooks(): Promise<void> {
  console.log('')
  console.log(colorize('Fetching webhooks...', 'cyan'))

  const result = await apiCall('GET', '/api/shipment-tracking/webhooks?pageSize=50')

  if (!result.ok) {
    console.log(colorize(`Error: ${result.error}`, 'red'))
    process.exit(1)
  }

  const data = result.data as { items?: unknown[]; total?: number }

  console.log(`Total: ${data.total ?? 0}`)
  console.log('')

  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items) {
      const w = item as Record<string, unknown>
      console.log(
        colorize(w.id as string, 'gray'),
        w.isActive ? colorize('active', 'green') : colorize('inactive', 'yellow'),
        w.url,
        (w.eventsSubscribed as string[])?.join(', ') || '*',
      )
    }
  }
}

async function pollNow(args: Record<string, string | boolean>): Promise<void> {
  const jobId = args.job as string

  if (!jobId) {
    console.log(colorize('Error: --job <jobId> is required', 'red'))
    process.exit(1)
  }

  console.log('')
  console.log(colorize(`Triggering poll for job ${jobId}...`, 'cyan'))

  const result = await apiCall('POST', `/api/shipment-tracking/tracking-jobs/${jobId}/poll`)

  if (!result.ok) {
    console.log(colorize(`Error: ${result.error}`, 'red'))
    process.exit(1)
  }

  console.log(colorize('Poll triggered!', 'green'))
  console.log(JSON.stringify(result.data, null, 2))
}

function showHelp(): void {
  console.log(`
${colorize('Shipment Tracking Test CLI', 'bold')}

${colorize('Usage:', 'cyan')}
  npx tsx packages/shipment-tracking/scripts/test-tracking-cli.ts <command> [options]

${colorize('Commands:', 'cyan')}
  register-webhook   Register a webhook endpoint
  create-shipment    Create a shipment for tracking
  list-shipments     List existing shipments
  list-webhooks      List registered webhooks
  poll-now           Trigger immediate poll for a tracking job

${colorize('Options:', 'cyan')}
  --url <url>        Webhook URL (default: http://localhost:3456/webhook)
  --events <list>    Comma-separated event types (default: *)
  --secret <secret>  HMAC secret for signature (default: test-secret-for-debugging)
  --container <num>  Container number
  --booking <num>    Booking number
  --bol <num>        Bill of lading number
  --carrier <code>   Carrier code (e.g., MAEU, MSCU)
  --job <id>         Tracking job ID

${colorize('Environment variables:', 'cyan')}
  API_BASE_URL       Base URL for API calls (default: http://localhost:3000)
  API_KEY            API key for authentication

${colorize('Examples:', 'cyan')}
  # Register a webhook to receive all events
  npx tsx packages/shipment-tracking/scripts/test-tracking-cli.ts register-webhook

  # Create a shipment for a container
  npx tsx packages/shipment-tracking/scripts/test-tracking-cli.ts create-shipment --container MSKU1234567 --carrier MAEU

  # List shipments
  npx tsx packages/shipment-tracking/scripts/test-tracking-cli.ts list-shipments
`)
}

async function main(): Promise<void> {
  const args = parseArgs()
  const command = args._command as string

  switch (command) {
    case 'register-webhook':
      await registerWebhook(args)
      break
    case 'create-shipment':
      await createShipment(args)
      break
    case 'list-shipments':
      await listShipments()
      break
    case 'list-webhooks':
      await listWebhooks()
      break
    case 'poll-now':
      await pollNow(args)
      break
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp()
      break
    default:
      console.log(colorize(`Unknown command: ${command}`, 'red'))
      showHelp()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(colorize(`Fatal error: ${err.message}`, 'red'))
  process.exit(1)
})
