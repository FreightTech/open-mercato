import type { EntityManager } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import {
  AutomationDefinition,
  AutomationRun,
  NodeExecution,
  type AutomationDefinitionData,
  type AutomationNode,
  type AutomationConnection,
} from '../data/entities'
import { getAutomationNodeType, type NodeExecutionContext, type NodeExecutionResult } from './node-type-registry'
import { interpolateConfig, createInterpolationContext } from './variable-interpolation'

// ============================================================================
// Types
// ============================================================================

export interface StartRunOptions {
  definitionId: string
  triggerData?: Record<string, unknown>
  triggerNodeId?: string
  tenantId: string
  organizationId: string
}

export interface ExecutionResult {
  runId: string
  status: 'COMPLETED' | 'FAILED'
  nodeExecutions: number
  executionTimeMs: number
  error?: string
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_NODE_TIMEOUT_MS = 30_000
const DEFAULT_RUN_TIMEOUT_MS = 5 * 60_000
const MAX_NODE_TIMEOUT_MS = 120_000

// ============================================================================
// Graph Helpers
// ============================================================================

type AdjacencyMap = Map<string, Map<string, string[]>>

function buildAdjacencyMap(connections: AutomationConnection[]): AdjacencyMap {
  const map: AdjacencyMap = new Map()

  for (const conn of connections) {
    if (!map.has(conn.sourceNodeId)) {
      map.set(conn.sourceNodeId, new Map())
    }
    const outputs = map.get(conn.sourceNodeId)!
    if (!outputs.has(conn.sourceOutput)) {
      outputs.set(conn.sourceOutput, [])
    }
    outputs.get(conn.sourceOutput)!.push(conn.targetNodeId)
  }

  return map
}

function findTriggerNode(definition: AutomationDefinitionData): AutomationNode | undefined {
  const incomingTargets = new Set(definition.connections.map(c => c.targetNodeId))
  return definition.nodes.find(
    node => node.type.startsWith('trigger.') && !incomingTargets.has(node.id)
  )
}

function getNextNodes(
  adjacency: AdjacencyMap,
  nodeId: string,
  outputRoute: string = 'main'
): string[] {
  const outputs = adjacency.get(nodeId)
  if (!outputs) return []
  return outputs.get(outputRoute) ?? []
}

// ============================================================================
// Timeout Helper
// ============================================================================

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)

    promise.then(
      (result) => { clearTimeout(timer); resolve(result) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

// ============================================================================
// Retry Helper
// ============================================================================

async function executeWithRetry(
  fn: () => Promise<NodeExecutionResult>,
  retryPolicy: AutomationNode['retryPolicy'],
): Promise<NodeExecutionResult> {
  const maxAttempts = retryPolicy?.maxAttempts ?? 1
  const intervalMs = retryPolicy?.intervalMs ?? 1000
  const backoffMultiplier = retryPolicy?.backoffMultiplier ?? 2

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxAttempts) {
        const delay = intervalMs * Math.pow(backoffMultiplier, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, Math.min(delay, 30_000)))
      }
    }
  }

  throw lastError
}

// ============================================================================
// Execution Engine
// ============================================================================

export async function executeAutomation(
  em: EntityManager,
  container: AwilixContainer,
  run: AutomationRun,
  definition: AutomationDefinitionData,
  triggerData: Record<string, unknown>
): Promise<ExecutionResult> {
  const startTime = Date.now()
  const runTimeoutMs = DEFAULT_RUN_TIMEOUT_MS
  const nodeOutputs = new Map<string, Record<string, unknown>>()
  const runContext: Record<string, unknown> = {}
  const adjacency = buildAdjacencyMap(definition.connections)
  const nodesById = new Map(definition.nodes.map(n => [n.id, n]))
  let nodeExecutionCount = 0

  const triggerNode = findTriggerNode(definition)
  if (!triggerNode) {
    run.status = 'FAILED'
    run.errorMessage = 'No trigger node found in definition'
    run.executionTimeMs = Date.now() - startTime
    await em.flush()
    return { runId: run.id, status: 'FAILED', nodeExecutions: 0, executionTimeMs: run.executionTimeMs, error: run.errorMessage }
  }

  // Set trigger output
  nodeOutputs.set(triggerNode.id, triggerData)

  // BFS execution queue
  const queue: string[] = getNextNodes(adjacency, triggerNode.id, 'main')

  // Record trigger node execution
  const triggerExec = em.create(NodeExecution, {
    runId: run.id,
    nodeId: triggerNode.id,
    nodeType: triggerNode.type,
    status: 'COMPLETED',
    inputData: triggerData,
    outputData: triggerData,
    startedAt: new Date(),
    completedAt: new Date(),
    executionTimeMs: 0,
    tenantId: run.tenantId,
    organizationId: run.organizationId,
  })
  em.persist(triggerExec)
  nodeExecutionCount++

  const visited = new Set<string>([triggerNode.id])

  while (queue.length > 0) {
    // Check run-level timeout
    if (Date.now() - startTime > runTimeoutMs) {
      run.status = 'FAILED'
      run.errorMessage = `Automation run timed out after ${runTimeoutMs}ms`
      run.executionTimeMs = Date.now() - startTime
      await em.flush()
      return { runId: run.id, status: 'FAILED', nodeExecutions: nodeExecutionCount, executionTimeMs: run.executionTimeMs, error: run.errorMessage }
    }

    const currentNodeId = queue.shift()!

    if (visited.has(currentNodeId)) continue
    visited.add(currentNodeId)

    const node = nodesById.get(currentNodeId)
    if (!node) continue

    // Skip disabled nodes
    if (node.disabled) {
      const skipExec = em.create(NodeExecution, {
        runId: run.id,
        nodeId: node.id,
        nodeType: node.type,
        status: 'SKIPPED',
        startedAt: new Date(),
        completedAt: new Date(),
        executionTimeMs: 0,
        tenantId: run.tenantId,
        organizationId: run.organizationId,
      })
      em.persist(skipExec)
      nodeExecutionCount++

      // Follow main output even if skipped
      const nextNodes = getNextNodes(adjacency, node.id, 'main')
      for (const nextId of nextNodes) {
        if (!visited.has(nextId)) queue.push(nextId)
      }
      continue
    }

    // Resolve input data from connected source nodes
    const inputData = resolveInputData(definition.connections, nodeOutputs, currentNodeId)

    const nodeDef = getAutomationNodeType(node.type)
    if (!nodeDef) {
      const errorMsg = `Unknown node type: ${node.type}`
      const errorExec = em.create(NodeExecution, {
        runId: run.id,
        nodeId: node.id,
        nodeType: node.type,
        status: 'FAILED',
        inputData,
        errorData: { message: errorMsg },
        startedAt: new Date(),
        completedAt: new Date(),
        executionTimeMs: 0,
        tenantId: run.tenantId,
        organizationId: run.organizationId,
      })
      em.persist(errorExec)
      nodeExecutionCount++

      if (node.onError !== 'continue') {
        run.status = 'FAILED'
        run.errorMessage = errorMsg
        run.errorNodeId = node.id
        run.executionTimeMs = Date.now() - startTime
        await em.flush()
        return { runId: run.id, status: 'FAILED', nodeExecutions: nodeExecutionCount, executionTimeMs: run.executionTimeMs, error: errorMsg }
      }
      continue
    }

    // Interpolate config
    const interpolationCtx = createInterpolationContext(triggerData, nodeOutputs, runContext)
    const interpolatedConfig = interpolateConfig(node.config, interpolationCtx)

    // Execute node
    const nodeStart = Date.now()
    const nodeTimeoutMs = Math.min(
      (interpolatedConfig._timeout as number) ?? DEFAULT_NODE_TIMEOUT_MS,
      MAX_NODE_TIMEOUT_MS,
    )
    const nodeExec = em.create(NodeExecution, {
      runId: run.id,
      nodeId: node.id,
      nodeType: node.type,
      status: 'RUNNING' as const,
      inputData,
      startedAt: new Date(),
      tenantId: run.tenantId,
      organizationId: run.organizationId,
    })
    em.persist(nodeExec)

    try {
      const execCtx: NodeExecutionContext = {
        config: interpolatedConfig,
        inputData,
        runContext,
        nodeId: node.id,
        runId: run.id,
        em,
        container,
        logger: (message, data) => {
          console.log(`[automations:${run.id}:${node.id}] ${message}`, data ?? '')
        },
      }

      const executeFn = () => withTimeout(
        nodeDef.execute(execCtx),
        nodeTimeoutMs,
        `Node "${node.name}" (${node.type})`,
      )

      const hasRetry = node.retryPolicy && node.retryPolicy.maxAttempts > 1
      const result: NodeExecutionResult = hasRetry
        ? await executeWithRetry(executeFn, node.retryPolicy)
        : await executeFn()

      nodeExec.status = 'COMPLETED'
      nodeExec.outputData = result.output
      nodeExec.completedAt = new Date()
      nodeExec.executionTimeMs = Date.now() - nodeStart

      nodeOutputs.set(node.id, result.output)

      // If the node sets context variables, merge them
      if (result.output._context && typeof result.output._context === 'object') {
        Object.assign(runContext, result.output._context)
      }

      nodeExecutionCount++

      // Follow the appropriate output route
      const outputRoute = result.outputRoute ?? 'main'
      const nextNodes = getNextNodes(adjacency, node.id, outputRoute)
      for (const nextId of nextNodes) {
        if (!visited.has(nextId)) queue.push(nextId)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      nodeExec.status = 'FAILED'
      nodeExec.errorData = { message: errorMsg, stack: error instanceof Error ? error.stack : undefined }
      nodeExec.completedAt = new Date()
      nodeExec.executionTimeMs = Date.now() - nodeStart
      nodeExecutionCount++

      const errorStrategy = node.onError ?? 'stop'

      if (errorStrategy === 'stop') {
        run.status = 'FAILED'
        run.errorMessage = errorMsg
        run.errorNodeId = node.id
        run.executionTimeMs = Date.now() - startTime
        await em.flush()
        return { runId: run.id, status: 'FAILED', nodeExecutions: nodeExecutionCount, executionTimeMs: run.executionTimeMs, error: errorMsg }
      }

      if (errorStrategy === 'output') {
        const errorNextNodes = getNextNodes(adjacency, node.id, 'error')
        for (const nextId of errorNextNodes) {
          if (!visited.has(nextId)) queue.push(nextId)
        }
        nodeOutputs.set(node.id, { _error: errorMsg, _inputData: inputData })
      }

      if (errorStrategy === 'continue') {
        const nextNodes = getNextNodes(adjacency, node.id, 'main')
        for (const nextId of nextNodes) {
          if (!visited.has(nextId)) queue.push(nextId)
        }
      }
    }
  }

  // Done
  run.status = 'COMPLETED'
  run.completedAt = new Date()
  run.context = runContext
  run.executionTimeMs = Date.now() - startTime
  await em.flush()

  return { runId: run.id, status: 'COMPLETED', nodeExecutions: nodeExecutionCount, executionTimeMs: run.executionTimeMs }
}

// ============================================================================
// Input Resolution
// ============================================================================

function resolveInputData(
  connections: AutomationConnection[],
  nodeOutputs: Map<string, Record<string, unknown>>,
  targetNodeId: string
): Record<string, unknown> {
  const incomingConnections = connections.filter(c => c.targetNodeId === targetNodeId)

  if (incomingConnections.length === 0) return {}
  if (incomingConnections.length === 1) {
    return nodeOutputs.get(incomingConnections[0].sourceNodeId) ?? {}
  }

  // Multiple inputs: namespace by source node ID to prevent silent overwrites
  const merged: Record<string, unknown> = {}
  for (const conn of incomingConnections) {
    const sourceOutput = nodeOutputs.get(conn.sourceNodeId)
    if (sourceOutput) {
      merged[conn.sourceNodeId] = sourceOutput
    }
  }

  // Also provide a flat merge for backward compatibility under _merged
  const flat: Record<string, unknown> = {}
  for (const conn of incomingConnections) {
    const sourceOutput = nodeOutputs.get(conn.sourceNodeId)
    if (sourceOutput) {
      Object.assign(flat, sourceOutput)
    }
  }
  merged._merged = flat

  return merged
}
