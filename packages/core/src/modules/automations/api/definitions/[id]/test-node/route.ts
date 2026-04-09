import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { AutomationDefinition } from '../../../../data/entities'
import { testNodeSchema } from '../../../../data/validators'
import { getAutomationNodeType } from '../../../../lib/node-type-registry'
import { interpolateConfig, createInterpolationContext } from '../../../../lib/variable-interpolation'
import type { EntityManager } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.execute'],
}

export const openApi = {
  post: { summary: 'Test a single node in isolation', tags: ['Automations'], responses: { 200: { description: 'Node execution result' } } },
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const tenantId = auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId

    const definition = await em.findOne(AutomationDefinition, {
      id,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!definition) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json()
    const { nodeId, inputData } = testNodeSchema.parse(body)

    const node = definition.definition.nodes.find(n => n.id === nodeId)
    if (!node) return NextResponse.json({ error: `Node "${nodeId}" not found` }, { status: 404 })

    const nodeDef = getAutomationNodeType(node.type)
    if (!nodeDef) return NextResponse.json({ error: `Unknown node type: ${node.type}` }, { status: 400 })

    const testInput = inputData ?? {}
    const interpolationCtx = createInterpolationContext(testInput, new Map(), {})
    const interpolatedConfig = interpolateConfig(node.config, interpolationCtx)

    const startTime = Date.now()

    const result = await nodeDef.execute({
      config: interpolatedConfig,
      inputData: testInput,
      runContext: {},
      nodeId: node.id,
      runId: 'test',
      em,
      container: container as unknown as AwilixContainer,
      logger: (msg, data) => console.log(`[test:${nodeId}] ${msg}`, data ?? ''),
    })

    return NextResponse.json({
      nodeId,
      nodeType: node.type,
      input: testInput,
      output: result.output,
      outputRoute: result.outputRoute ?? 'main',
      executionTimeMs: Date.now() - startTime,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      nodeId: 'unknown',
    }, { status: 500 })
  }
}
