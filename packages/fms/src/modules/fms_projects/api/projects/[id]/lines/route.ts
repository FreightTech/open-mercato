/**
 * FMS Projects Module - Project Lines API
 * Manage financial tracking lines for a project
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsProjectLine } from '../../../../data/entities'
import { fmsProjectLineCreateSchema, fmsProjectLineUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsProjectLine,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    populate: ['project'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      // Get project ID from route params
      const projectId = ctx.params?.id
      if (projectId) {
        return { project: projectId }
      }
      return {}
    },
    sortFieldMap: {
      lineNumber: 'line_number',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsProjectLineCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set project ID from route params
      const projectId = ctx.params?.id
      if (projectId) {
        ctx.data.projectId = projectId
      }

      // Auto-increment line number if not provided
      if (!ctx.data.lineNumber) {
        const existingLines = await ctx.em.find(FmsProjectLine, {
          project: ctx.data.projectId,
          deletedAt: null,
        })
        ctx.data.lineNumber = existingLines.length + 1
      }

      // Calculate sold amount from unit price and quantity
      if (ctx.data.soldUnitPrice && ctx.data.quantity) {
        const unitPrice = parseFloat(ctx.data.soldUnitPrice) || 0
        const qty = parseFloat(ctx.data.quantity) || 1
        ctx.data.soldAmount = (unitPrice * qty).toString()
      }

      // Calculate actual cost from actual unit cost and quantity
      if (ctx.data.actualUnitCost && ctx.data.quantity) {
        const unitCost = parseFloat(ctx.data.actualUnitCost) || 0
        const qty = parseFloat(ctx.data.quantity) || 1
        ctx.data.actualCost = (unitCost * qty).toString()
      }
    },
  } as any,
  update: {
    schema: fmsProjectLineUpdateSchema,
    beforeUpdate: async (ctx: any) => {
      // Get current line data if needed
      const existingLine = await ctx.em.findOne(FmsProjectLine, { id: ctx.data.id })
      if (!existingLine) return

      // Recalculate sold amount when quantity or sold unit price changes
      const qty = ctx.data.quantity !== undefined
        ? parseFloat(ctx.data.quantity) || 1
        : parseFloat(existingLine.quantity) || 1
      const soldUnitPrice = ctx.data.soldUnitPrice !== undefined
        ? parseFloat(ctx.data.soldUnitPrice) || 0
        : parseFloat(existingLine.soldUnitPrice) || 0

      if (ctx.data.quantity !== undefined || ctx.data.soldUnitPrice !== undefined) {
        ctx.data.soldAmount = (soldUnitPrice * qty).toString()
      }

      // Recalculate actual cost when quantity or actual unit cost changes
      const actualUnitCost = ctx.data.actualUnitCost !== undefined
        ? parseFloat(ctx.data.actualUnitCost) || 0
        : parseFloat(existingLine.actualUnitCost || '0') || 0

      if (ctx.data.quantity !== undefined || ctx.data.actualUnitCost !== undefined) {
        if (actualUnitCost > 0) {
          ctx.data.actualCost = (actualUnitCost * qty).toString()
        }
      }
    },
  } as any,
  del: {
    softDelete: true,
    beforeDelete: async (ctx: any) => {
      // Only allow deleting manual lines
      const line = await ctx.em.findOne(FmsProjectLine, { id: ctx.id })
      if (line?.sourceType === 'offer') {
        throw new Error('Cannot delete lines sourced from offers')
      }
    },
  } as any,
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
