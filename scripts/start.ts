import { spawn, ChildProcess } from 'child_process'

const processes: ChildProcess[] = []

function cleanup() {
  console.log('[start] Shutting down...')
  for (const proc of processes) {
    if (!proc.killed) {
      proc.kill('SIGTERM')
    }
  }
}

process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

async function main() {
  const mode = process.argv[2] || 'dev'
  const autoSpawnWorkers = process.env.AUTO_SPAWN_WORKERS !== 'false'
  const autoSpawnMcp = process.env.AUTO_SPAWN_MCP !== 'false'
  const autoSpawnPoiNats = !!process.env.POI_NATS_URL

  console.log(`[start] Starting Open Mercato in ${mode} mode...`)

  // Start Next.js app
  const nextCommand = mode === 'dev' ? ['next', 'dev'] : ['next', 'start']
  const nextProcess = spawn('npx', nextCommand, {
    stdio: 'inherit',
    env: process.env,
  })
  processes.push(nextProcess)

  // Start workers (enabled by default, disable with AUTO_SPAWN_WORKERS=false)
  if (autoSpawnWorkers) {
    console.log('[start] Starting workers for all queues...')
    const workerProcess = spawn(
      'npx',
      ['tsx', '--tsconfig', 'tsconfig.cli.json', 'mercato-cli.ts', 'queue', 'worker', '--all'],
      {
        stdio: 'inherit',
        env: process.env,
      }
    )
    processes.push(workerProcess)
  }

  // Start MCP server (enabled by default, disable with AUTO_SPAWN_MCP=false)
  if (autoSpawnMcp) {
    const mcpCommand = mode === 'dev' ? 'mcp:dev' : 'mcp:serve'
    console.log(`[start] Starting MCP server (${mcpCommand})...`)
    const mcpProcess = spawn('yarn', [mcpCommand], {
      stdio: 'inherit',
      env: process.env,
    })
    processes.push(mcpProcess)
  }

  // Start POI NATS consumer (enabled when POI_NATS_URL is set)
  if (autoSpawnPoiNats) {
    console.log('[start] Starting POI NATS consumer...')
    const poiProcess = spawn(
      'npx',
      ['tsx', '--tsconfig', 'tsconfig.cli.json', 'mercato-cli.ts', 'shipment_tracking', 'poi:worker'],
      {
        stdio: 'inherit',
        env: process.env,
      }
    )
    processes.push(poiProcess)
  }

  // Wait for any process to exit
  await Promise.race(
    processes.map(
      (proc) =>
        new Promise<void>((resolve) => {
          proc.on('exit', () => resolve())
        })
    )
  )

  cleanup()
  process.exit(0)
}

main().catch((err) => {
  console.error('[start] Error:', err)
  cleanup()
  process.exit(1)
})
