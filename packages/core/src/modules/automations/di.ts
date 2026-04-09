import type { AwilixContainer } from 'awilix'
import { asFunction } from 'awilix'
import * as executionEngine from './lib/execution-engine'
import * as nodeTypeRegistry from './lib/node-type-registry'
import { registerBuiltinNodeTypes } from './lib/node-types'

export function register(container: AwilixContainer): void {
  // Register built-in node types into the global registry
  registerBuiltinNodeTypes()

  container.register({
    automationExecutionEngine: asFunction(() => executionEngine).scoped(),
    automationNodeTypeRegistry: asFunction(() => nodeTypeRegistry).scoped(),
  })
}
