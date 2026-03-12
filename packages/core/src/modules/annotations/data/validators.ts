import { z } from 'zod'

const annotationColorEnum = z.enum(['gray', 'pink', 'orange', 'yellow', 'green', 'blue', 'purple'])

export const createAnnotationSchema = z.object({
  tableId: z.string().trim().min(1).max(200),
  rowId: z.string().trim().min(1).max(200),
  columnKey: z.string().trim().min(1).max(200),
  color: annotationColorEnum.nullable().optional(),
})

export const updateAnnotationColorSchema = z.object({
  color: annotationColorEnum.nullable(),
})

export const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  mentionedUserIds: z.array(z.string().uuid()).max(20).optional(),
})

export const batchGetAnnotationsSchema = z.object({
  tableId: z.string().trim().min(1).max(200),
  rowIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
})

export const batchSetColorSchema = z.object({
  tableId: z.string().trim().min(1).max(200),
  cells: z.array(z.object({
    rowId: z.string().trim().min(1).max(200),
    columnKey: z.string().trim().min(1).max(200),
  })).min(1).max(500),
  color: annotationColorEnum.nullable().optional(),
  comment: z.string().trim().min(1).max(8000).optional(),
  mentionedUserIds: z.array(z.string().uuid()).max(20).optional(),
})

export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>
export type UpdateAnnotationColorInput = z.infer<typeof updateAnnotationColorSchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type BatchGetAnnotationsInput = z.infer<typeof batchGetAnnotationsSchema>
export type BatchSetColorInput = z.infer<typeof batchSetColorSchema>
