import { z } from 'zod'

const uuid = () => z.string().uuid()

const columnConfigSchema = z.record(z.string(), z.object({
  title: z.string().optional(),
  type: z.enum(['text', 'numeric', 'date', 'boolean']).optional(),
  width: z.number().min(20).max(1000).optional(),
  readOnly: z.boolean().optional(),
})).nullable().optional()

export const tableDefinitionCreateSchema = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
  name: z.string().trim().min(1).max(200),
  siteId: z.string().trim().min(1),
  driveId: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
  filePath: z.string().trim().max(2000).nullable().optional(),
  worksheetName: z.string().trim().min(1).max(200),
  dataRange: z.string().trim().max(100).nullable().optional(),
  columnConfig: columnConfigSchema,
  hasHeaderRow: z.boolean().optional().default(true),
})

export const tableDefinitionUpdateSchema = z.object({
  id: uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  worksheetName: z.string().trim().min(1).max(200).optional(),
  dataRange: z.string().trim().max(100).nullable().optional(),
  columnConfig: columnConfigSchema,
  hasHeaderRow: z.boolean().optional(),
})

export const tableDefinitionListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  search: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const tableDefinitionDeleteSchema = z.object({
  id: uuid(),
})

export const cellWriteSchema = z.object({
  definitionId: uuid(),
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})

export type TableDefinitionCreate = z.infer<typeof tableDefinitionCreateSchema>
export type TableDefinitionUpdate = z.infer<typeof tableDefinitionUpdateSchema>
export type TableDefinitionList = z.infer<typeof tableDefinitionListSchema>
export type CellWrite = z.infer<typeof cellWriteSchema>
