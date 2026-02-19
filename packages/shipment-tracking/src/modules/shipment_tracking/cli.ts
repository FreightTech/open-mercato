import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'

function parseArgs(rest: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg) continue
    if (arg.startsWith('--')) {
      if (arg.includes('=')) {
        const [key, value] = arg.slice(2).split('=')
        args[key] = value
      } else {
        const nextArg = rest[i + 1]
        if (nextArg && !nextArg.startsWith('--')) {
          args[arg.slice(2)] = nextArg
          i++
        } else {
          args[arg.slice(2)] = true
        }
      }
    }
  }
  return args
}

const seedCarriersCommand: ModuleCli = {
  command: 'seed-carriers',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.org ?? '')
    const dryRun = args['dry-run'] === true || args.dryRun === true

    if (!tenantId || !organizationId) {
      console.error('Usage: mercato shipment_tracking seed-carriers --tenant <tenantId> --org <organizationId> [--dry-run]')
      return
    }

    const container = await createRequestContainer()

    try {
      const em = container.resolve<EntityManager>('em')
      console.log(`Seeding carrier configs for tenant=${tenantId}, org=${organizationId}${dryRun ? ' (dry run)' : ''}`)

      // Dynamic import since seed-carrier-configs is gitignored (contains credentials)
      let seedCarrierConfigs: typeof import('./lib/seed-carrier-configs').seedCarrierConfigs
      try {
        const mod = await import('./lib/seed-carrier-configs')
        seedCarrierConfigs = mod.seedCarrierConfigs
      } catch {
        console.error('Error: seed-carrier-configs.ts not found.')
        console.error('This file is gitignored as it contains carrier credentials.')
        console.error('Create packages/shipment-tracking/src/modules/shipment_tracking/lib/seed-carrier-configs.ts with your carrier configs.')
        process.exit(1)
      }

      await em.transactional(async (tem) => {
        const result = await seedCarrierConfigs(tem, { tenantId, organizationId }, { dryRun })
        console.log(`Done: ${result.created} created, ${result.skipped} skipped`)
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Error seeding carrier configs: ${message}`)
      process.exit(1)
    } finally {
      await (container as unknown as { dispose?: () => Promise<void> }).dispose?.()
    }
  },
}

export default [seedCarriersCommand]
