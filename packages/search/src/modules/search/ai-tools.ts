import { z } from 'zod'
import type { SearchResult, SearchStrategyId } from '@open-mercato/shared/modules/search'

/**
 * AI Tools definitions for the Search module.
 *
 * These tool definitions are discovered by the ai-assistant module's generator
 * and registered as MCP tools. The search module does not depend on ai-assistant.
 *
 * Tool Definition Format:
 * - name: Unique tool identifier (module_action format, no dots allowed)
 * - description: Human-readable description for AI clients
 * - inputSchema: Zod schema for input validation
 * - requiredFeatures: ACL features required to execute
 * - handler: Async function that executes the tool
 */

/**
 * Tool context provided by the MCP server at execution time.
 */
type ToolContext = {
  tenantId: string | null
  organizationId: string | null
  userId: string | null
  container: {
    resolve: <T = unknown>(name: string) => T
  }
  userFeatures: string[]
  isSuperAdmin: boolean
}

/**
 * Tool definition structure.
 */
type AiToolDefinition = {
  name: string
  description: string
  inputSchema: z.ZodType<any>
  requiredFeatures?: string[]
  handler: (input: any, ctx: ToolContext) => Promise<unknown>
}

// =============================================================================
// EntityGraph types (mirrored from ai-assistant to avoid circular dependency)
// These are resolved at runtime via dynamic import when the MCP server runs
// =============================================================================

type RelationshipType =
  | 'BELONGS_TO'
  | 'HAS_MANY'
  | 'HAS_ONE'
  | 'BELONGS_TO_ONE'
  | 'HAS_MANY_MANY'
  | 'BELONGS_TO_MANY'

interface EntityTriple {
  source: string
  relationship: RelationshipType
  target: string
  property: string
  nullable?: boolean
}

interface EntityNode {
  className: string
  tableName: string
  properties: Array<{ name: string; type: string; nullable: boolean }>
}

interface EntityGraph {
  nodes: EntityNode[]
  edges: EntityTriple[]
  generatedAt: string
}

// Compact schema output for LLM consumption
interface CompactSchema {
  entities: string[] // e.g., "SalesOrder (sales_orders) [sales]"
  relationships: string[] // e.g., "(SalesOrder)-[HAS_MANY:lines]->(SalesOrderLine)"
}

/**
 * Group items by a key function.
 */
function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const existing = map.get(key) ?? []
    existing.push(item)
    map.set(key, existing)
  }
  return map
}

/**
 * Infer module name from entity class name or table name.
 * Mirrors the logic from ai-assistant/entity-graph.ts
 */
function inferModuleFromEntity(className: string, tableName: string): string {
  // First try table name prefix (most reliable)
  const tableParts = tableName.split('_')
  if (tableParts.length > 1) {
    return tableParts[0]
  }

  // Try to extract from class name
  const nameWithoutSuffix = className.replace(/Entity$/, '').replace(/Model$/, '')
  const match = nameWithoutSuffix.match(/^([A-Z][a-z]+)/)
  if (match) {
    const prefix = match[1].toLowerCase()
    const moduleMap: Record<string, string> = {
      sales: 'sales',
      customer: 'customers',
      catalog: 'catalog',
      product: 'catalog',
      order: 'sales',
      invoice: 'sales',
      quote: 'sales',
      auth: 'auth',
      user: 'auth',
      tenant: 'auth',
      organization: 'auth',
      workflow: 'workflows',
      config: 'configs',
      dictionary: 'dictionaries',
      entity: 'entities',
      search: 'search',
      attachment: 'attachments',
      audit: 'audit_logs',
    }
    if (moduleMap[prefix]) {
      return moduleMap[prefix]
    }
    return prefix
  }

  return 'core'
}

/**
 * Dynamically get the cached EntityGraph from ai-assistant module.
 * This works because search tools run in the same process as the MCP server.
 */
async function getEntityGraph(): Promise<EntityGraph | null> {
  try {
    // Dynamic import to avoid circular dependency at build time
    const { getCachedEntityGraph } = await import(
      '@open-mercato/ai-assistant/modules/ai_assistant/lib/entity-graph'
    )
    return getCachedEntityGraph()
  } catch {
    // EntityGraph not available (e.g., running outside MCP server)
    return null
  }
}

/**
 * Format a relationship edge as a triple string.
 * Example: (SalesOrder)-[HAS_MANY:lines]->(SalesOrderLine)
 */
function formatTriple(edge: EntityTriple): string {
  const nullable = edge.nullable ? '?' : ''
  return `(${edge.source})-[${edge.relationship}${nullable}:${edge.property}]->(${edge.target})`
}

/**
 * Build compact schema for matched entity types.
 * Returns entities and relationships as readable strings.
 */
function buildSchemaForEntities(
  graph: EntityGraph,
  entityTypes: Set<string>
): CompactSchema | null {
  const entities: string[] = []
  const relationships: string[] = []
  const includedClassNames = new Set<string>()

  for (const entityType of entityTypes) {
    // entityType format: "module:entity_name" -> extract entity name
    const parts = entityType.split(':')
    const entityName = parts[1] || parts[0]

    // Find matching node (try various name formats)
    const node = graph.nodes.find((n) => {
      const classNameLower = n.className.toLowerCase()
      const entityNameNormalized = entityName.replace(/_/g, '').toLowerCase()
      const tableNameNormalized = entityName.replace(/:/g, '_')
      return (
        classNameLower.includes(entityNameNormalized) ||
        n.tableName === tableNameNormalized
      )
    })

    if (node && !includedClassNames.has(node.className)) {
      const module = inferModuleFromEntity(node.className, node.tableName)
      entities.push(`${node.className} (${node.tableName}) [${module}]`)
      includedClassNames.add(node.className)
    }
  }

  // Get edges for included entities (both outgoing and incoming)
  const seenEdges = new Set<string>()
  for (const className of includedClassNames) {
    const entityEdges = graph.edges.filter(
      (e) => e.source === className || e.target === className
    )
    for (const edge of entityEdges) {
      const tripleStr = formatTriple(edge)
      if (!seenEdges.has(tripleStr)) {
        relationships.push(tripleStr)
        seenEdges.add(tripleStr)
      }
    }
  }

  return entities.length > 0 ? { entities, relationships } : null
}

// =============================================================================
// Tool Definitions
// =============================================================================

const searchTool: AiToolDefinition = {
  name: 'search',
  description: `Search across all data. Returns full records with schema graph.

Schema format:
- entities: ["SalesOrder (sales_orders) [sales]"]
- relationships: ["(SalesOrder)-[HAS_MANY:lines]->(SalesOrderLine)"]`,
  inputSchema: z.object({
    query: z.string().min(1).describe('Search query'),
    limit: z.number().int().min(1).max(100).optional().default(20),
    entityTypes: z.array(z.string()).optional().describe('Filter by entity types'),
  }),
  requiredFeatures: ['search.global'],
  handler: async (input, ctx) => {
    if (!ctx.tenantId) {
      throw new Error('Tenant context is required for search')
    }

    const searchService = ctx.container.resolve<{
      search: (query: string, options: any) => Promise<SearchResult[]>
    }>('searchService')

    const queryEngine = ctx.container.resolve<{
      query: (entityId: string, options: any) => Promise<{ items: unknown[]; total: number }>
    }>('queryEngine')

    // 1. Execute search (fulltext + tokens only, no vector)
    const searchResults = await searchService.search(input.query, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      entityTypes: input.entityTypes,
      strategies: ['fulltext', 'tokens'] as SearchStrategyId[],
      limit: input.limit,
    })

    // 2. Build compact schema for matched entity types
    let schema: CompactSchema | null = null
    if (searchResults.length > 0) {
      const graph = await getEntityGraph()
      if (graph) {
        const uniqueEntityTypes = new Set(searchResults.map((r) => r.entityId))
        schema = buildSchemaForEntities(graph, uniqueEntityTypes)
      }
    }

    // 3. Fetch full records
    const fullRecords = new Map<string, Record<string, unknown>>()
    if (searchResults.length > 0) {
      const byEntity = groupBy(searchResults, (r) => r.entityId)

      await Promise.all(
        Array.from(byEntity.entries()).map(async ([entityId, results]) => {
          try {
            const { items } = await queryEngine.query(entityId, {
              tenantId: ctx.tenantId,
              organizationId: ctx.organizationId,
              filters: { id: { $in: results.map((r) => r.recordId) } },
              includeCustomFields: true,
              page: { page: 1, pageSize: results.length },
            })
            for (const item of items as Record<string, unknown>[]) {
              if (item && typeof item === 'object' && 'id' in item) {
                fullRecords.set(`${entityId}:${item.id}`, item)
              }
            }
          } catch {
            // Skip non-queryable entities silently
          }
        })
      )
    }

    // 4. Return combined response
    return {
      query: input.query,
      totalResults: searchResults.length,
      schema,
      results: searchResults.map((r) => ({
        entityType: r.entityId,
        recordId: r.recordId,
        score: Math.round(r.score * 100) / 100,
        source: r.source,
        presenter: {
          title: r.presenter?.title ?? r.recordId,
          subtitle: r.presenter?.subtitle,
          icon: r.presenter?.icon,
        },
        record: fullRecords.get(`${r.entityId}:${r.recordId}`) ?? null,
        url: r.url,
      })),
    }
  },
}

// =============================================================================
// search_get - Retrieve full record details by entity type and ID
// =============================================================================

const searchGetTool: AiToolDefinition = {
  name: 'search_get',
  description: `Get full record details by entityType and recordId from search_query results.`,
  inputSchema: z.object({
    entityType: z
      .string()
      .describe('The entity type (e.g., "customers:customer_company_profile", "customers:customer_deal")'),
    recordId: z.string().describe('The record ID (UUID)'),
  }),
  requiredFeatures: ['search.view'],
  handler: async (input, ctx) => {
    if (!ctx.tenantId) {
      throw new Error('Tenant context is required')
    }

    const queryEngine = ctx.container.resolve<{
      query: (entityId: string, options: any) => Promise<{ items: unknown[]; total: number }>
    }>('queryEngine')

    const result = await queryEngine.query(input.entityType, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      filters: { id: input.recordId },
      includeCustomFields: true,
      page: { page: 1, pageSize: 1 },
    })

    const record = result.items[0] as Record<string, unknown> | undefined
    if (!record) {
      return {
        found: false,
        entityType: input.entityType,
        recordId: input.recordId,
        error: 'Record not found',
      }
    }

    // Extract custom fields
    const customFields: Record<string, unknown> = {}
    const standardFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('cf:') || key.startsWith('cf_')) {
        customFields[key.replace(/^cf[:_]/, '')] = value
      } else {
        standardFields[key] = value
      }
    }

    // Build URL based on entity type
    let url: string | null = null
    const id = record.id ?? record.entity_id ?? input.recordId
    if (input.entityType.includes('person')) {
      url = `/backend/customers/people/${id}`
    } else if (input.entityType.includes('company')) {
      url = `/backend/customers/companies/${id}`
    } else if (input.entityType.includes('deal')) {
      url = `/backend/customers/deals/${id}`
    } else if (input.entityType.includes('activity')) {
      const entityId = record.entity_id ?? record.entityId
      url = entityId ? `/backend/customers/companies/${entityId}#activity-${id}` : null
    }

    return {
      found: true,
      entityType: input.entityType,
      recordId: input.recordId,
      record: standardFields,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      url,
    }
  },
}

// =============================================================================
// search.aggregate - Get counts grouped by field values
// =============================================================================

const searchAggregateTool: AiToolDefinition = {
  name: 'search_aggregate',
  description:
    'Get record counts grouped by a field value. Useful for analytics like "how many deals by stage?" or "customers by status".',
  inputSchema: z.object({
    entityType: z
      .string()
      .describe('The entity type to aggregate (e.g., "customers:customer_deal")'),
    groupBy: z
      .string()
      .describe('The field to group by (e.g., "status", "industry", "pipeline_stage")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of buckets to return (default: 20)'),
  }),
  requiredFeatures: ['search.view'],
  handler: async (input, ctx) => {
    if (!ctx.tenantId) {
      throw new Error('Tenant context is required')
    }

    const queryEngine = ctx.container.resolve<{
      query: (entityId: string, options: any) => Promise<{ items: unknown[]; total: number }>
    }>('queryEngine')

    // Fetch records and aggregate in memory
    // Note: For large datasets, this should use database GROUP BY
    const result = await queryEngine.query(input.entityType, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      page: { page: 1, pageSize: 1000 }, // Fetch up to 1000 for aggregation
    })

    const counts = new Map<string | null, number>()
    for (const item of result.items as Record<string, unknown>[]) {
      const value = item[input.groupBy]
      const key = value === null || value === undefined ? null : String(value)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const total = result.items.length
    const buckets = Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        percentage: Math.round((count / total) * 100 * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, input.limit)

    return {
      entityType: input.entityType,
      groupBy: input.groupBy,
      total,
      buckets,
    }
  },
}

// =============================================================================
// Export
// =============================================================================

/**
 * All AI tools exported by the search module.
 * Discovered by ai-assistant module's generator.
 *
 * Tools:
 * - search: Hybrid search with full records + schema graph
 * - search_get: Get single record by entity type and ID
 * - search_aggregate: Analytics/grouping by field values
 */
export const aiTools = [
  searchTool,
  searchGetTool,
  searchAggregateTool,
]

export default aiTools
