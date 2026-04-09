import { getNestedValue } from './filters'

// ============================================================================
// Variable Interpolation
// ============================================================================

interface InterpolationContext {
  trigger: Record<string, unknown>
  nodes: Record<string, Record<string, unknown>>
  context: Record<string, unknown>
  env: Record<string, string | undefined>
}

const TEMPLATE_REGEX = /\{\{(.+?)\}\}/g

function resolveVariable(path: string, ctx: InterpolationContext): unknown {
  const trimmed = path.trim()

  // Special values
  if (trimmed === 'now') return new Date().toISOString()
  if (trimmed === 'today') return new Date().toISOString().split('T')[0]

  // Namespace resolution
  if (trimmed.startsWith('trigger.')) {
    return getNestedValue(ctx.trigger, trimmed.slice('trigger.'.length))
  }
  if (trimmed.startsWith('nodes.')) {
    const rest = trimmed.slice('nodes.'.length)
    const dotIndex = rest.indexOf('.')
    if (dotIndex === -1) return ctx.nodes[rest]
    const nodeId = rest.slice(0, dotIndex)
    const field = rest.slice(dotIndex + 1)
    const nodeOutput = ctx.nodes[nodeId]
    if (!nodeOutput) return undefined
    return getNestedValue(nodeOutput, field)
  }
  if (trimmed.startsWith('context.')) {
    return getNestedValue(ctx.context, trimmed.slice('context.'.length))
  }
  if (trimmed.startsWith('env.')) {
    return ctx.env[trimmed.slice('env.'.length)]
  }

  // Fallback: try trigger, then context
  const fromTrigger = getNestedValue(ctx.trigger, trimmed)
  if (fromTrigger !== undefined) return fromTrigger
  return getNestedValue(ctx.context, trimmed)
}

export function interpolateString(template: string, ctx: InterpolationContext): string {
  return template.replace(TEMPLATE_REGEX, (match, path) => {
    const value = resolveVariable(path, ctx)
    if (value === undefined || value === null) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  })
}

export function interpolateValue(value: unknown, ctx: InterpolationContext): unknown {
  if (typeof value === 'string') {
    // If the entire string is a single template, return the raw value (preserving type)
    const singleMatch = value.match(/^\{\{(.+?)\}\}$/)
    if (singleMatch) {
      return resolveVariable(singleMatch[1], ctx) ?? value
    }
    return interpolateString(value, ctx)
  }

  if (Array.isArray(value)) {
    return value.map(item => interpolateValue(item, ctx))
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateValue(val, ctx)
    }
    return result
  }

  return value
}

export function interpolateConfig(
  config: Record<string, unknown>,
  ctx: InterpolationContext
): Record<string, unknown> {
  return interpolateValue(config, ctx) as Record<string, unknown>
}

const ALLOWED_ENV_PREFIXES = ['AUTOMATION_', 'PUBLIC_', 'NEXT_PUBLIC_']

function buildAllowedEnv(): Record<string, string | undefined> {
  const allowed: Record<string, string | undefined> = {}
  for (const key of Object.keys(process.env)) {
    if (ALLOWED_ENV_PREFIXES.some(prefix => key.startsWith(prefix))) {
      allowed[key] = process.env[key]
    }
  }
  return allowed
}

export function createInterpolationContext(
  triggerData: Record<string, unknown>,
  nodeOutputs: Map<string, Record<string, unknown>>,
  runContext: Record<string, unknown>
): InterpolationContext {
  const nodes: Record<string, Record<string, unknown>> = {}
  for (const [nodeId, output] of nodeOutputs) {
    nodes[nodeId] = output
  }

  return {
    trigger: triggerData,
    nodes,
    context: runContext,
    env: buildAllowedEnv(),
  }
}
