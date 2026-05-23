import { Collection, OptionalProps } from '@mikro-orm/core'
import { Entity, PrimaryKey, Property, Index, Unique, ManyToOne, OneToMany } from '@mikro-orm/decorators/legacy'

export type CellAnnotationColor = 'gray' | 'pink' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

@Entity({ tableName: 'cell_annotations' })
@Index({ name: 'cell_annotations_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'cell_annotations_entity_row_idx', properties: ['organizationId', 'tenantId', 'entityType', 'rowId'] })
@Unique({ name: 'cell_annotations_unique_entity_cell', properties: ['organizationId', 'tenantId', 'entityType', 'rowId', 'columnKey'] })
export class CellAnnotation {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'tableId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'entity_type', type: 'text' })
  entityType!: string

  @Property({ name: 'table_id', type: 'text', nullable: true })
  tableId?: string | null

  @Property({ name: 'row_id', type: 'text' })
  rowId!: string

  @Property({ name: 'column_key', type: 'text' })
  columnKey!: string

  @Property({ name: 'color', type: 'text', nullable: true })
  color?: CellAnnotationColor | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => CellComment, (comment) => comment.annotation)
  comments = new Collection<CellComment>(this)

  @OneToMany(() => CellAnnotationAssignee, (a) => a.annotation)
  assignees = new Collection<CellAnnotationAssignee>(this)
}

@Entity({ tableName: 'cell_comments' })
@Index({ name: 'cell_comments_annotation_idx', properties: ['annotation'] })
@Index({ name: 'cell_comments_annotation_created_idx', properties: ['annotation', 'createdAt'] })
export class CellComment {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'content', type: 'text' })
  content!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @ManyToOne(() => CellAnnotation, { fieldName: 'annotation_id' })
  annotation!: CellAnnotation
}

@Entity({ tableName: 'cell_annotation_assignees' })
@Unique({ properties: ['annotation', 'userId'] })
@Index({ properties: ['annotation'] })
export class CellAnnotationAssignee {
  [OptionalProps]?: 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'assigned_by', type: 'uuid' })
  assignedBy!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @ManyToOne(() => CellAnnotation, { fieldName: 'annotation_id' })
  annotation!: CellAnnotation
}
