import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  Unique,
  ManyToOne,
  OneToMany,
  Collection,
  OptionalProps,
} from '@mikro-orm/core'

export type CellAnnotationColor = 'gray' | 'pink' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

@Entity({ tableName: 'cell_annotations' })
@Index({ name: 'cell_annotations_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'cell_annotations_table_row_idx', properties: ['organizationId', 'tenantId', 'tableId', 'rowId'] })
@Unique({ name: 'cell_annotations_unique_cell', properties: ['organizationId', 'tenantId', 'tableId', 'rowId', 'columnKey'] })
export class CellAnnotation {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'table_id', type: 'text' })
  tableId!: string

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
