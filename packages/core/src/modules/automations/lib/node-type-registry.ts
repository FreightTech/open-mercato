import type { z } from 'zod'
import type { EntityManager } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'

// ============================================================================
// Types
// ============================================================================

export interface NodeIODefinition {
  name: string
  label: string
  type: 'main' | 'conditional' | 'error'
}

export interface NodeExecutionContext {
  config: Record<string, unknown>
  inputData: Record<string, unknown>
  runContext: Record<string, unknown>
  nodeId: string
  runId: string
  em: EntityManager
  container: AwilixContainer
  logger: (message: string, data?: unknown) => void
}

export interface NodeExecutionResult {
  output: Record<string, unknown>
  outputRoute?: string
}

export interface AutomationNodeTypeDefinition {
  type: string
  category: 'trigger' | 'action' | 'logic' | 'utility'
  name: string
  description: string
  icon: string
  color: string
  configSchema: z.ZodSchema
  inputs: NodeIODefinition[]
  outputs: NodeIODefinition[]
  execute: (ctx: NodeExecutionContext) => Promise<NodeExecutionResult>
  testExecute?: (config: Record<string, unknown>, testInput: Record<string, unknown>) => Promise<unknown>
}

// ============================================================================
// Global Registry
// ============================================================================

const REGISTRY_KEY = '__openMercatoAutomationNodeTypes__'

function getRegistry(): Map<string, AutomationNodeTypeDefinition> {
  const globalState = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: Map<string, AutomationNodeTypeDefinition>
  }

  if (!globalState[REGISTRY_KEY]) {
    globalState[REGISTRY_KEY] = new Map<string, AutomationNodeTypeDefinition>()
  }

  return globalState[REGISTRY_KEY]
}

export function registerAutomationNodeType(def: AutomationNodeTypeDefinition): () => void {
  const registry = getRegistry()
  registry.set(def.type, def)
  return () => {
    registry.delete(def.type)
  }
}

export function getAutomationNodeType(type: string): AutomationNodeTypeDefinition | undefined {
  return getRegistry().get(type)
}

export function listAutomationNodeTypes(): AutomationNodeTypeDefinition[] {
  return Array.from(getRegistry().values())
}

export function listAutomationNodeTypesByCategory(category: string): AutomationNodeTypeDefinition[] {
  return listAutomationNodeTypes().filter(def => def.category === category)
}

export function clearAutomationNodeTypes(): void {
  getRegistry().clear()
}
