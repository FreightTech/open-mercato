import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import type { LocationType, FacilityCodeEntry } from './types'

@Entity({ tableName: 'fms_locations' })
@Index({
  name: 'fms_locations_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_locations_type_idx',
  properties: ['type'],
})
@Index({
  name: 'fms_locations_contractor_idx',
  properties: ['contractorId'],
})
export class FmsLocation {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
    | 'locode'
    | 'portId'
    | 'lat'
    | 'lng'
    | 'city'
    | 'country'
    | 'contractorId'
    | 'addressLine1'
    | 'addressLine2'
    | 'state'
    | 'postalCode'
    | 'isPrimary'
    | 'isActive'
    | 'googlePlaceId'
    | 'facilityCodes'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'product_type', type: 'text' })
  type!: LocationType

  @Property({ type: 'text', nullable: true })
  locode?: string | null

  @Property({ name: 'port_id', type: 'uuid', nullable: true })
  portId?: string | null

  @Property({ type: 'double', nullable: true })
  lat?: number | null

  @Property({ type: 'double', nullable: true })
  lng?: number | null

  @Property({ type: 'text', nullable: true })
  city?: string | null

  @Property({ type: 'text', nullable: true })
  country?: string | null

  // Contractor address fields
  @Property({ name: 'contractor_id', type: 'uuid', nullable: true })
  contractorId?: string | null

  @Property({ name: 'address_line1', type: 'text', nullable: true })
  addressLine1?: string | null

  @Property({ name: 'address_line2', type: 'text', nullable: true })
  addressLine2?: string | null

  @Property({ type: 'text', nullable: true })
  state?: string | null

  @Property({ name: 'postal_code', type: 'text', nullable: true })
  postalCode?: string | null

  @Property({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean = false

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'google_place_id', type: 'text', nullable: true })
  googlePlaceId?: string | null

  @Property({ name: 'facility_codes', type: 'jsonb', nullable: true })
  facilityCodes?: FacilityCodeEntry[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
