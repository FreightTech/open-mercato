#!/usr/bin/env npx tsx

/**
 * Test Webhook Endpoint Server
 *
 * A simple HTTP server that receives and logs webhook deliveries from the
 * shipment tracking module. Useful for testing and debugging webhook integrations.
 *
 * Usage:
 *   npx tsx packages/shipment-tracking/scripts/test-webhook-server.ts [--port 3456]
 *
 * The server will:
 * - Listen for POST requests on /webhook
 * - Log all incoming payloads with timestamps
 * - Save payloads to a JSON log file for later analysis
 * - Respond with 200 OK to acknowledge receipt
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const PORT = parseInt(process.argv.find((_, i, arr) => arr[i - 1] === '--port') ?? '3456', 10)
const LOG_DIR = path.join(process.cwd(), 'packages/shipment-tracking/scripts/webhook-logs')
const LOG_FILE = path.join(LOG_DIR, `webhook-log-${new Date().toISOString().slice(0, 10)}.jsonl`)

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

interface WebhookPayload {
  eventType: string
  payload: Record<string, unknown>
  timestamp: string
  signature?: string
}

interface LogEntry {
  receivedAt: string
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: unknown
  signature: string | null
  signatureValid: boolean | null
}

const HMAC_SECRET = process.env.WEBHOOK_HMAC_SECRET || 'test-secret-for-debugging'

function verifySignature(
  payload: string,
  signature: string | undefined,
  timestamp: string | undefined,
): boolean | null {
  if (!signature) return null

  try {
    // The webhook dispatcher signs: `{timestamp}.{body}`
    // See: packages/shipment-tracking/src/modules/shipment_tracking/lib/webhook-dispatcher.ts
    const signaturePayload = timestamp ? `${timestamp}.${payload}` : payload
    const expected = crypto.createHmac('sha256', HMAC_SECRET).update(signaturePayload).digest('hex')
    const sigValue = signature.startsWith('sha256=') ? signature.slice(7) : signature
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigValue))
  } catch {
    return false
  }
}

function colorize(text: string, color: string): string {
  const colors: Record<string, string> = {
    reset: '\x1b[0m',
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

function formatEventType(eventType: string): string {
  const parts = eventType.split('.')
  if (parts.length >= 3) {
    return `${colorize(parts[0], 'gray')}.${colorize(parts[1], 'cyan')}.${colorize(parts.slice(2).join('.'), 'bold')}`
  }
  return colorize(eventType, 'cyan')
}

function logWebhook(entry: LogEntry): void {
  const body = entry.body as WebhookPayload | null

  console.log('')
  console.log(colorize('=' .repeat(80), 'gray'))
  console.log(
    colorize(`[${entry.receivedAt}]`, 'gray'),
    colorize('WEBHOOK RECEIVED', 'green'),
  )
  console.log(colorize('-'.repeat(80), 'gray'))

  if (body?.eventType) {
    console.log(`  Event Type: ${formatEventType(body.eventType)}`)
  }

  if (entry.signature) {
    const validIcon = entry.signatureValid ? colorize('[VALID]', 'green') : colorize('[INVALID]', 'yellow')
    console.log(`  Signature:  ${entry.signature.slice(0, 20)}... ${validIcon}`)
  }

  console.log('')
  console.log(colorize('  Payload:', 'blue'))
  console.log(colorize('  ' + '-'.repeat(40), 'gray'))

  const payloadStr = JSON.stringify(body?.payload ?? body, null, 2)
  payloadStr.split('\n').forEach((line) => {
    console.log(`  ${colorize(line, 'cyan')}`)
  })

  console.log(colorize('=' .repeat(80), 'gray'))
  console.log('')
}

function appendToLog(entry: LogEntry): void {
  const line = JSON.stringify(entry) + '\n'
  fs.appendFileSync(LOG_FILE, line)
}

const server = http.createServer(async (req, res) => {
  const timestamp = new Date().toISOString()

  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp }))
    return
  }

  // Webhook endpoint
  if (req.method === 'POST' && (req.url === '/webhook' || req.url === '/')) {
    let body = ''

    req.on('data', (chunk) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(body)
      } catch {
        parsed = { raw: body }
      }

      const signature = req.headers['x-webhook-signature'] as string | undefined
      const webhookTimestamp = req.headers['x-webhook-timestamp'] as string | undefined
      const signatureValid = verifySignature(body, signature, webhookTimestamp)

      const entry: LogEntry = {
        receivedAt: timestamp,
        method: req.method ?? 'POST',
        url: req.url ?? '/',
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: parsed,
        signature: signature ?? null,
        signatureValid,
      }

      logWebhook(entry)
      appendToLog(entry)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ received: true, timestamp }))
    })

    return
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log('')
  console.log(colorize('=' .repeat(60), 'gray'))
  console.log(colorize('  SHIPMENT TRACKING - Webhook Test Server', 'bold'))
  console.log(colorize('=' .repeat(60), 'gray'))
  console.log('')
  console.log(`  ${colorize('Listening on:', 'cyan')} http://localhost:${PORT}/webhook`)
  console.log(`  ${colorize('Log file:', 'cyan')}     ${LOG_FILE}`)
  console.log(`  ${colorize('HMAC Secret:', 'cyan')}  ${HMAC_SECRET}`)
  console.log('')
  console.log(colorize('  Waiting for webhook events...', 'gray'))
  console.log('')
})

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('')
  console.log(colorize('Shutting down...', 'yellow'))
  server.close(() => {
    console.log(colorize('Server closed.', 'gray'))
    process.exit(0)
  })
})
