import { getMeter } from './metrics'

let metricsInterval: NodeJS.Timeout | null = null

/**
 * Start collecting system resource metrics (CPU, memory, event loop).
 * Uses global mode - metrics are collected without tenant context.
 * 
 * This is necessary because:
 * 1. Background workers don't have tenant context
 * 2. System-level metrics are more reliable without per-request scoping
 * 3. Aggregation across all tenants gives true system load
 */
export function startResourceMetrics() {
  if (metricsInterval) return

  const meter = getMeter('system')

  // Global CPU usage gauge
  const globalCpuGauge = meter.createObservableGauge('system.cpu.usage.global', {
    description: 'Global CPU usage in microseconds',
    unit: 'us',
  })

  // Global memory usage gauge
  const globalMemoryGauge = meter.createObservableGauge('system.memory.usage.global', {
    description: 'Global memory usage in bytes',
    unit: 'bytes',
  })

  // Event loop lag gauge
  const eventLoopLagGauge = meter.createObservableGauge('system.eventloop.lag.global', {
    description: 'Event loop lag in milliseconds',
    unit: 'ms',
  })

  let lastCpuUsage = process.cpuUsage()
  let cpuSnapshot = { user: 0, system: 0 }
  let lastLoopCheck = Date.now()

  // CPU usage callback - reads from snapshot updated by interval
  globalCpuGauge.addCallback((observableResult) => {
    const totalUsageMicros = cpuSnapshot.user + cpuSnapshot.system
    const totalUsagePercent = (totalUsageMicros / 1000000) * 100
    observableResult.observe(totalUsagePercent)
  })

  // Memory usage callback
  globalMemoryGauge.addCallback((observableResult) => {
    const memUsage = process.memoryUsage()
    observableResult.observe(memUsage.heapUsed, { type: 'heap' })
    observableResult.observe(memUsage.rss, { type: 'rss' })
    observableResult.observe(memUsage.external, { type: 'external' })
    observableResult.observe(memUsage.arrayBuffers, { type: 'arrayBuffers' })
  })

  // Event loop lag callback - measures delay in setTimeout firing
  eventLoopLagGauge.addCallback((observableResult) => {
    const now = Date.now()
    const expected = 1000 // Expected 1 second between checks
    const actual = now - lastLoopCheck
    const lag = Math.max(0, actual - expected)
    observableResult.observe(lag)
  })

  // Update CPU snapshot and event loop timestamp every second
  function scheduleNextCheck() {
    setTimeout(() => {
      // Update CPU snapshot
      const currentCpuUsage = process.cpuUsage(lastCpuUsage)
      cpuSnapshot = currentCpuUsage
      lastCpuUsage = process.cpuUsage()

      // Update event loop timestamp
      lastLoopCheck = Date.now()

      // Schedule next check
      scheduleNextCheck()
    }, 1000)
  }

  scheduleNextCheck()
  
  // Store timeout reference for cleanup
  metricsInterval = setTimeout(() => {}, 1000) as NodeJS.Timeout
}

export function stopResourceMetrics() {
  if (metricsInterval) {
    clearInterval(metricsInterval)
    metricsInterval = null
  }
}
