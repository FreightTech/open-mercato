import { Collection, OptionalProps } from '@mikro-orm/core'
import { Entity, PrimaryKey, Property, Index, Unique, OneToOne, OneToMany, ManyToOne } from '@mikro-orm/decorators/legacy'

export type ContractorAddressPurpose = 'office' | 'warehouse' | 'billing' | 'shipping' | 'other'
export type ContractorRoleCategory = 'trading' | 'carrier' | 'intermediary' | 'facility'
export type PaymentMethod = 'bank_transfer' | 'card' | 'cash'
export type SopCommentCategory = 'general' | 'financial' | 'operations' | 'compliance'

@Entity({ tableName: 'contractors' })
@Index({ name: 'contractors_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({
  name: 'idx_contractors_tenant_org_id',
  expression: `create index "idx_contractors_tenant_org_id" on "contractors" ("tenant_id", "organization_id", "id") where deleted_at is null`,
})
@Index({ name: 'contractors_parent_idx', properties: ['parentId'] })
export class Contractor {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'roleTypeIds' | 'officialName' | 'krs' | 'registrationDate' | 'pkdMainCode' | 'pkdMainDescription'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'short_name', type: 'text', nullable: true })
  shortName?: string | null

  @Property({ name: 'official_name', type: 'text', nullable: true })
  officialName?: string | null

  @Property({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId?: string | null

  @Property({ name: 'tax_id', type: 'text', nullable: true })
  taxId?: string | null

  @Property({ name: 'regon', type: 'text', nullable: true })
  regon?: string | null

  @Property({ name: 'krs', type: 'text', nullable: true })
  krs?: string | null

  @Property({ name: 'registration_date', type: 'text', nullable: true })
  registrationDate?: string | null

  @Property({ name: 'pkd_main_code', type: 'text', nullable: true })
  pkdMainCode?: string | null

  @Property({ name: 'pkd_main_description', type: 'text', nullable: true })
  pkdMainDescription?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @Property({ name: 'role_type_ids', type: 'json', nullable: true })
  roleTypeIds?: string[] | null

  @OneToMany(() => ContractorAddress, (address) => address.contractor)
  addresses = new Collection<ContractorAddress>(this)

  @OneToMany(() => ContractorContact, (contact) => contact.contractor)
  contacts = new Collection<ContractorContact>(this)

  @OneToOne(() => ContractorPaymentTerms, (pt) => pt.contractor, { nullable: true, mappedBy: 'contractor' })
  paymentTerms?: ContractorPaymentTerms | null

  @OneToOne(() => ContractorCreditLimit, (cl) => cl.contractor, { nullable: true, mappedBy: 'contractor' })
  creditLimit?: ContractorCreditLimit | null

  @OneToMany(() => ContractorBankAccount, (ba) => ba.contractor)
  bankAccounts = new Collection<ContractorBankAccount>(this)

  @OneToMany(() => ContractorComment, (c) => c.contractor)
  comments = new Collection<ContractorComment>(this)
}

@Entity({ tableName: 'contractor_addresses' })
@Index({ name: 'contractor_addresses_contractor_idx', properties: ['contractor'] })
export class ContractorAddress {
  [OptionalProps]?: 'isActive' | 'isPrimary' | 'createdAt' | 'updatedAt' | 'addressLine' | 'city' | 'country'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  purpose!: ContractorAddressPurpose

  @Property({ name: 'address_line', type: 'text', nullable: true })
  addressLine?: string | null

  @Property({ type: 'text', nullable: true })
  city?: string | null

  @Property({ type: 'text', nullable: true })
  state?: string | null

  @Property({ name: 'postal_code', type: 'text', nullable: true })
  postalCode?: string | null

  @Property({ type: 'text', nullable: true })
  country?: string | null

  @Property({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean = false

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @ManyToOne(() => Contractor, { fieldName: 'contractor_id' })
  contractor!: Contractor
}

@Entity({ tableName: 'contractor_contacts' })
@Index({ name: 'contractor_contacts_contractor_idx', properties: ['contractor'] })
export class ContractorContact {
  [OptionalProps]?: 'isActive' | 'isPrimary' | 'createdAt' | 'updatedAt' | 'firstName' | 'lastName'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'first_name', type: 'text', nullable: true })
  firstName?: string | null

  @Property({ name: 'last_name', type: 'text', nullable: true })
  lastName?: string | null

  @Property({ type: 'text', nullable: true })
  email?: string | null

  @Property({ type: 'text', nullable: true })
  phone?: string | null

  @Property({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean = false

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @ManyToOne(() => Contractor, { fieldName: 'contractor_id' })
  contractor!: Contractor
}

@Entity({ tableName: 'contractor_role_types' })
@Index({ name: 'contractor_role_types_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({
  name: 'idx_contractor_role_types_category',
  expression: `create index "idx_contractor_role_types_category" on "contractor_role_types" ("tenant_id", "organization_id", "category") where is_active = true`,
})
@Unique({ name: 'contractor_role_types_code_unique', properties: ['organizationId', 'tenantId', 'code'] })
export class ContractorRoleType {
  [OptionalProps]?: 'isActive' | 'isSystem' | 'hasCustomFields' | 'sortOrder' | 'createdAt' | 'updatedAt'

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

  @Property({ type: 'text' })
  category!: ContractorRoleCategory

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ type: 'text', nullable: true })
  color?: string | null

  @Property({ type: 'text', nullable: true })
  icon?: string | null

  @Property({ name: 'has_custom_fields', type: 'boolean', default: false })
  hasCustomFields: boolean = false

  @Property({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number = 0

  @Property({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean = false

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'contractor_payment_terms' })
@Index({ name: 'contractor_payment_terms_contractor_idx', properties: ['contractor'] })
@Unique({ name: 'contractor_payment_terms_contractor_unique', properties: ['contractor'] })
export class ContractorPaymentTerms {
  [OptionalProps]?: 'paymentDays' | 'currencyCode' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'payment_days', type: 'int', default: 30 })
  paymentDays: number = 30

  @Property({ name: 'payment_method', type: 'text', nullable: true })
  paymentMethod?: PaymentMethod | null

  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  @Property({ name: 'bank_name', type: 'text', nullable: true })
  bankName?: string | null

  @Property({ name: 'bank_account_number', type: 'text', nullable: true })
  bankAccountNumber?: string | null

  @Property({ name: 'bank_routing_number', type: 'text', nullable: true })
  bankRoutingNumber?: string | null

  @Property({ type: 'text', nullable: true })
  iban?: string | null

  @Property({ name: 'swift_bic', type: 'text', nullable: true })
  swiftBic?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @OneToOne(() => Contractor, (c) => c.paymentTerms, {
    fieldName: 'contractor_id',
    owner: true,
  })
  contractor!: Contractor
}

@Entity({ tableName: 'contractor_bank_accounts' })
@Index({ name: 'contractor_bank_accounts_contractor_idx', properties: ['contractor'] })
export class ContractorBankAccount {
  [OptionalProps]?: 'isPrimary' | 'currencyCode' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'bank_name', type: 'text', nullable: true })
  bankName?: string | null

  @Property({ type: 'text', nullable: true })
  iban?: string | null

  @Property({ name: 'swift_bic', type: 'text', nullable: true })
  swiftBic?: string | null

  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  @Property({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean = false

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @ManyToOne(() => Contractor, { fieldName: 'contractor_id' })
  contractor!: Contractor
}

@Entity({ tableName: 'contractor_credit_limits' })
@Index({ name: 'contractor_credit_limits_contractor_idx', properties: ['contractor'] })
@Unique({ name: 'contractor_credit_limits_contractor_unique', properties: ['contractor'] })
export class ContractorCreditLimit {
  [OptionalProps]?: 'isUnlimited' | 'currencyCode' | 'paymentDays' | 'currentExposure' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'credit_limit', type: 'numeric', precision: 18, scale: 2 })
  creditLimit!: string

  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  @Property({ name: 'is_unlimited', type: 'boolean', default: false })
  isUnlimited: boolean = false

  @Property({ name: 'payment_days', type: 'int', default: 30 })
  paymentDays: number = 30

  @Property({ name: 'current_exposure', type: 'numeric', precision: 18, scale: 2, default: '0' })
  currentExposure: string = '0'

  @Property({ name: 'last_calculated_at', type: Date, nullable: true })
  lastCalculatedAt?: Date | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @OneToOne(() => Contractor, (c) => c.creditLimit, {
    fieldName: 'contractor_id',
    owner: true,
  })
  contractor!: Contractor
}

// ============================================================================
// ContractorSopComment Entity (Operational Comments / SOP)
// ============================================================================

@Entity({ tableName: 'contractor_sop_comments' })
@Index({ name: 'contractor_sop_comments_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'contractor_sop_comments_contractor_idx', properties: ['contractor'] })
export class ContractorSopComment {
  [OptionalProps]?: 'isPinned' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  category!: SopCommentCategory

  @Property({ type: 'text' })
  body!: string

  @Property({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId?: string | null

  @Property({ name: 'author_name', type: 'text', nullable: true })
  authorName?: string | null

  @Property({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean = false

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @ManyToOne(() => Contractor, { fieldName: 'contractor_id' })
  contractor!: Contractor
}

// ============================================================================
// ContractorComment Entity (Activity Timeline Comments)
// ============================================================================

@Entity({ tableName: 'contractor_comments' })
@Index({ name: 'contractor_comments_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'contractor_comments_contractor_idx', properties: ['contractor'] })
export class ContractorComment {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => Contractor, { fieldName: 'contractor_id' })
  contractor!: Contractor

  @Property({ name: 'body', type: 'text' })
  body!: string

  @Property({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId?: string | null

  @Property({ name: 'author_name', type: 'text', nullable: true })
  authorName?: string | null

  @Property({ name: 'attachment_id', type: 'uuid', nullable: true })
  attachmentId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
