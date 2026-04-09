import type { CanvasNode, CanvasEdge } from '../components/canvas/types'
import type { AutomationDefinitionData, AutomationNode, AutomationConnection } from '../data/entities'

// ============================================================================
// Definition -> ReactFlow Graph
// ============================================================================

export function definitionToGraph(definition: AutomationDefinitionData): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = definition.nodes.map(node => ({
    id: node.id,
    type: mapNodeCategory(node.type),
    position: node.position,
    data: {
      label: node.name,
      nodeType: node.type,
      config: node.config,
      disabled: node.disabled,
      onError: node.onError,
      icon: getNodeIcon(node.type),
      color: getNodeColor(node.type),
    },
  }))

  const edges: CanvasEdge[] = definition.connections.map(conn => ({
    id: conn.id,
    source: conn.sourceNodeId,
    sourceHandle: conn.sourceOutput,
    target: conn.targetNodeId,
    targetHandle: conn.targetInput,
    type: 'automationEdge',
    data: { sourceOutput: conn.sourceOutput },
  }))

  return { nodes, edges }
}

// ============================================================================
// ReactFlow Graph -> Definition
// ============================================================================

export function graphToDefinition(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  existingNodes?: Map<string, AutomationNode>
): AutomationDefinitionData {
  const automationNodes: AutomationNode[] = nodes.map(node => {
    const existing = existingNodes?.get(node.id)
    return {
      id: node.id,
      type: node.data?.nodeType ?? 'trigger.manual',
      name: node.data?.label ?? node.id,
      position: node.position,
      config: existing?.config ?? node.data?.config ?? {},
      disabled: node.data?.disabled ?? false,
      onError: existing?.onError ?? node.data?.onError,
      retryPolicy: existing?.retryPolicy,
      notes: existing?.notes,
    }
  })

  const connections: AutomationConnection[] = edges.map(edge => ({
    id: edge.id,
    sourceNodeId: edge.source,
    sourceOutput: edge.sourceHandle ?? 'main',
    targetNodeId: edge.target,
    targetInput: edge.targetHandle ?? 'main',
  }))

  return { nodes: automationNodes, connections }
}

// ============================================================================
// Validation
// ============================================================================

export interface GraphValidationError {
  type: 'no_trigger' | 'multiple_triggers' | 'orphan_node' | 'self_loop' | 'empty'
  message: string
  nodeId?: string
}

export function validateGraph(definition: AutomationDefinitionData): GraphValidationError[] {
  const errors: GraphValidationError[] = []

  if (definition.nodes.length === 0) {
    errors.push({ type: 'empty', message: 'Automation must have at least one node' })
    return errors
  }

  // Check trigger nodes
  const triggerNodes = definition.nodes.filter(n => n.type.startsWith('trigger.'))
  if (triggerNodes.length === 0) {
    errors.push({ type: 'no_trigger', message: 'Automation must have a trigger node' })
  }
  if (triggerNodes.length > 1) {
    errors.push({ type: 'multiple_triggers', message: 'Automation should have only one trigger node' })
  }

  // Check for self-loops
  for (const conn of definition.connections) {
    if (conn.sourceNodeId === conn.targetNodeId) {
      errors.push({ type: 'self_loop', message: `Node "${conn.sourceNodeId}" has a self-loop`, nodeId: conn.sourceNodeId })
    }
  }

  // Check for orphan nodes (not connected to anything, excluding trigger)
  const connectedNodeIds = new Set<string>()
  for (const conn of definition.connections) {
    connectedNodeIds.add(conn.sourceNodeId)
    connectedNodeIds.add(conn.targetNodeId)
  }
  for (const node of definition.nodes) {
    if (!node.type.startsWith('trigger.') && !connectedNodeIds.has(node.id)) {
      errors.push({ type: 'orphan_node', message: `Node "${node.name}" is not connected`, nodeId: node.id })
    }
  }

  return errors
}

// ============================================================================
// Helpers
// ============================================================================

function mapNodeCategory(type: string): string {
  if (type.startsWith('trigger.')) return 'triggerNode'
  if (type.startsWith('action.')) return 'actionNode'
  if (type.startsWith('logic.')) return 'logicNode'
  return 'utilityNode'
}

const NODE_ICONS: Record<string, string> = {
  'trigger.manual': 'play',
  'trigger.event': 'zap',
  'trigger.webhook': 'webhook',
  'trigger.schedule': 'clock',
  'action.http_request': 'globe',
  'action.send_email': 'mail',
  'action.update_entity': 'database',
  'action.emit_event': 'radio',
  'action.transform': 'shuffle',
  'action.code': 'code',
  'action.delay': 'timer',
  'action.set_variable': 'variable',
  'action.filter': 'filter',
  'action.respond_webhook': 'reply',
  'logic.if': 'git-branch',
  'logic.switch': 'list-tree',
  'logic.merge': 'merge',
  'logic.loop': 'repeat',
  'utility.noop': 'minus',
}

function getNodeIcon(type: string): string {
  return NODE_ICONS[type] ?? 'circle'
}

const NODE_COLORS: Record<string, string> = {
  trigger: '#22c55e',
  action: '#3b82f6',
  logic: '#f59e0b',
  utility: '#6b7280',
}

function getNodeColor(type: string): string {
  const category = type.split('.')[0]
  return NODE_COLORS[category] ?? '#6b7280'
}
