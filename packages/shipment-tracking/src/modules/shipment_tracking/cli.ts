import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { PoiNatsService } from './services/poiNatsService'

// ─── POI NATS Subscriber Commands ────────────────────────────

/**
 * POI NATS Worker
 *
 * Long-running worker process that consumes POI proximity events from NATS JetStream.
 * Run this as a separate process/service alongside the main app.
 *
 * Usage:
 *   yarn mercato shipment_tracking poi:worker
 *
 * With pm2:
 *   pm2 start "yarn mercato shipment_tracking poi:worker" --name poi-worker
 *
 * With systemd:
 *   ExecStart=/path/to/yarn mercato shipment_tracking poi:worker
 */
const poiWorkerCommand: ModuleCli = {
  command: 'poi:worker',
  async run() {
    const { resolve } = await createRequestContainer()

    try {
      const poiService = resolve<PoiNatsService>('poiNatsService')

      if (!poiService) {
        console.error('[poi-worker] PoiNatsService not available')
        process.exit(1)
      }

      // Check if POI NATS is configured
      if (!poiService.isConfigured()) {
        console.log('[poi-worker] POI_NATS_URL not configured, exiting')
        console.log('[poi-worker] Set POI_NATS_URL environment variable to enable')
        process.exit(0)
      }

      console.log('[poi-worker] Starting POI NATS consumer...')

      // Start the NATS subscriber
      await poiService.start()

      const stats = poiService.getStats()
      console.log(`[poi-worker] Consumer started at ${stats.connectedAt?.toISOString()}`)
      console.log('[poi-worker] Listening for POI proximity events')

      // Keep the process alive and handle graceful shutdown
      let isShuttingDown = false
      const gracefulShutdown = async () => {
        if (isShuttingDown) return
        isShuttingDown = true
        console.log('[poi-worker] Shutting down...')
        try {
          await poiService.stop()
          console.log('[poi-worker] Stopped')
        } catch (error) {
          console.error('[poi-worker] Error during shutdown:', error)
        }
        process.exit(0)
      }

      process.on('SIGINT', gracefulShutdown)
      process.on('SIGTERM', gracefulShutdown)

      // Keep alive
      await new Promise(() => {})
    } catch (error: any) {
      console.error('[poi-worker] Failed to start:', error.message)
      process.exit(1)
    }
  },
}

const poiStatusCommand: ModuleCli = {
  command: 'poi:status',
  async run() {
    const { resolve } = await createRequestContainer()

    try {
      const poiService = resolve<PoiNatsService>('poiNatsService')

      if (!poiService) {
        console.error('PoiNatsService not available.')
        process.exit(1)
      }

      console.log('POI NATS Subscriber Status\n')

      // Check if POI NATS is configured
      if (!poiService.isConfigured()) {
        console.log('  Status:             not configured')
        console.log('')
        console.log('Set POI_NATS_URL environment variable to enable POI event subscription.')
        process.exit(0)
      }

      const stats = poiService.getStats()

      console.log(`  Status:             ${stats.status}`)
      console.log(`  Connected at:       ${stats.connectedAt?.toISOString() ?? 'N/A'}`)
      console.log(`  Messages received:  ${stats.messagesReceived}`)
      console.log(`  Messages processed: ${stats.messagesProcessed}`)
      console.log(`  Events created:     ${stats.eventsCreated}`)
      console.log(`  Errors:             ${stats.errors}`)
      console.log(`  Last message at:    ${stats.lastMessageAt?.toISOString() ?? 'N/A'}`)
      console.log('')
    } catch (error: any) {
      console.error('Failed to get status:', error.message)
      process.exit(1)
    }
  },
}

const poiHelpCommand: ModuleCli = {
  command: 'poi:help',
  async run() {
    console.log('POI NATS Consumer Commands\n')
    console.log('Commands:')
    console.log('  poi:worker  Start the POI NATS consumer worker (long-running)')
    console.log('  poi:status  Show consumer status and statistics')
    console.log('  poi:help    Show this help message')
    console.log('')
    console.log('Environment Variables:')
    console.log('  POI_NATS_URL      NATS server URL (required to enable)')
    console.log('  POI_NATS_STREAM   JetStream stream name (default: AIS_STREAM)')
    console.log('  POI_NATS_SUBJECT  Subject filter (default: ais.ship.proximity.events)')
    console.log('  POI_NATS_CONSUMER Durable consumer name (default: shipment-tracking-poi)')
    console.log('')
    console.log('Prerequisites:')
    console.log('  Create a durable consumer on the NATS server:')
    console.log('    nats consumer add AIS_STREAM shipment-tracking-poi \\')
    console.log('      --filter "ais.ship.proximity.events" \\')
    console.log('      --ack explicit --deliver all --replay instant')
    console.log('')
    console.log('Running as a service:')
    console.log('  # Direct:')
    console.log('  POI_NATS_URL=nats://localhost:4222 yarn mercato shipment_tracking poi:worker')
    console.log('')
    console.log('  # With pm2:')
    console.log('  pm2 start "yarn mercato shipment_tracking poi:worker" --name poi-worker')
    console.log('')
    console.log('  # With Docker (add to docker-compose.yml):')
    console.log('  poi-worker:')
    console.log('    command: yarn mercato shipment_tracking poi:worker')
    console.log('    environment:')
    console.log('      - POI_NATS_URL=nats://nats:4222')
    console.log('')
  },
}

export default [poiWorkerCommand, poiStatusCommand, poiHelpCommand]
