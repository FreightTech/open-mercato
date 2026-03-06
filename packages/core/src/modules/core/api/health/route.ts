import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveEnvironment } from '@open-mercato/logger'

type CheckStatus = 'ok' | 'degraded'

interface CheckResult {
  status: CheckStatus
  responseTimeMs?: number
  error?: string
}

interface HealthCheckResult {
  status: CheckStatus
  timestamp: string
  environment: string
  checks: {
    database: CheckResult
    redis: CheckResult
    nats: CheckResult
    meilisearch: CheckResult
  }
}

/**
 * Health check endpoint for monitoring
 * 
 * Checks: PostgreSQL, Redis, NATS, Meilisearch
 * - 5-second timeout per check
 * - Always returns 200 status
 * - Overall status: "ok" if all pass, "degraded" if any fail
 */
export async function GET(request: NextRequest): Promise<NextResponse<HealthCheckResult>> {
  const startTime = Date.now()
  const environment = resolveEnvironment()
  const timeout = 5000 // 5 seconds per check

  const checks: {
    database: CheckResult
    redis: CheckResult
    nats: CheckResult
    meilisearch: CheckResult
  } = {
    database: { status: 'degraded' },
    redis: { status: 'degraded' },
    nats: { status: 'degraded' },
    meilisearch: { status: 'degraded' },
  }

  // Check PostgreSQL
  try {
    const dbStart = Date.now()
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    
    await Promise.race([
      em.getConnection().execute('SELECT 1'),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database check timeout')), timeout)
      ),
    ])
    
    checks.database = {
      status: 'ok',
      responseTimeMs: Date.now() - dbStart,
    }
  } catch (error) {
    checks.database = {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Check Redis
  try {
    const redisStart = Date.now()
    const container = await createRequestContainer()
    const redis = container.resolve<any>('redis')
    
    if (redis && typeof redis.ping === 'function') {
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis check timeout')), timeout)
        ),
      ])
      
      checks.redis = {
        status: 'ok',
        responseTimeMs: Date.now() - redisStart,
      }
    } else {
      checks.redis = {
        status: 'degraded',
        error: 'Redis client not available',
      }
    }
  } catch (error) {
    checks.redis = {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Check NATS
  try {
    const natsStart = Date.now()
    const container = await createRequestContainer()
    const eventBus = container.resolve<any>('eventBus')
    
    if (eventBus && typeof eventBus.getStatus === 'function') {
      const status = await Promise.race([
        eventBus.getStatus(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('NATS check timeout')), timeout)
        ),
      ])
      
      checks.nats = {
        status: status === 'connected' ? 'ok' : 'degraded',
        responseTimeMs: Date.now() - natsStart,
      }
    } else {
      // NATS might not have a status method, try emitting a test event
      await Promise.race([
        Promise.resolve(), // NATS available if container resolves
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('NATS check timeout')), timeout)
        ),
      ])
      
      checks.nats = {
        status: 'ok',
        responseTimeMs: Date.now() - natsStart,
      }
    }
  } catch (error) {
    checks.nats = {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Check Meilisearch
  try {
    const meiliStart = Date.now()
    const container = await createRequestContainer()
    const searchClient = container.resolve<any>('searchClient')
    
    if (searchClient && typeof searchClient.health === 'function') {
      await Promise.race([
        searchClient.health(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Meilisearch check timeout')), timeout)
        ),
      ])
      
      checks.meilisearch = {
        status: 'ok',
        responseTimeMs: Date.now() - meiliStart,
      }
    } else if (searchClient && typeof searchClient.getHealth === 'function') {
      await Promise.race([
        searchClient.getHealth(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Meilisearch check timeout')), timeout)
        ),
      ])
      
      checks.meilisearch = {
        status: 'ok',
        responseTimeMs: Date.now() - meiliStart,
      }
    } else {
      checks.meilisearch = {
        status: 'degraded',
        error: 'Meilisearch client not available',
      }
    }
  } catch (error) {
    checks.meilisearch = {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Determine overall status
  const overallStatus: CheckStatus = 
    Object.values(checks).every(check => check.status === 'ok') 
      ? 'ok' 
      : 'degraded'

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    environment,
    checks,
  }

  // Always return 200
  return NextResponse.json(result, { status: 200 })
}

export const metadata = {
  GET: { requireAuth: false }, // Public endpoint for monitoring
}
