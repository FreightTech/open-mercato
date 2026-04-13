import { createScopedApiHelpers } from '@open-mercato/shared/lib/api/scoped'

const { withScopedPayload } = createScopedApiHelpers({
  messages: {
    tenantRequired: { key: 'annotations.errors.tenant_required', fallback: 'Tenant context is required' },
    organizationRequired: { key: 'annotations.errors.organization_required', fallback: 'Organization context is required' },
  },
})

export { withScopedPayload }
