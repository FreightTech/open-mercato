import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { findBackendMatch } from '@open-mercato/shared/modules/registry'
import { modules } from '@/generated/modules.generated'
import { getAuthFromCookies } from '@/lib/auth/server'
import { ApplyBreadcrumb } from '@open-mercato/ui/backend/AppShell'
import { createRequestContainer } from '@/lib/di/container'
import { resolveFeatureCheckContext } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'

type Awaitable<T> = T | Promise<T>

export default async function BackendCatchAll(props: { params: Awaitable<{ slug?: string[] }> }) {
  const params = await props.params
  const pathname = '/backend/' + (params.slug?.join('/') ?? '')
  const match = findBackendMatch(modules, pathname)
  if (!match) return notFound()
  if (match.route.requireAuth) {
    const auth = await getAuthFromCookies()
    if (!auth) redirect('/api/auth/session/refresh?redirect=' + encodeURIComponent(pathname))

    const requiredRoles = match.route.requireRoles || []
    const requiredFeatures = match.route.requireFeatures || []
    const needsPermissionCheck = requiredRoles.length > 0 || requiredFeatures.length > 0

    if (needsPermissionCheck) {
      const container = await createRequestContainer()
      const rbac = container.resolve('rbacService') as RbacService
      const cookieStore = await cookies()
      const cookieSelectedOrg = cookieStore.get('om_selected_org')?.value ?? null
      const cookieSelectedTenant = cookieStore.get('om_selected_tenant')?.value ?? null
      let tenantIdForCheck: string | null = cookieSelectedTenant ?? auth.tenantId ?? null
      let organizationIdForCheck: string | null = auth.orgId ?? null

      // Resolve scope for feature/superadmin checks
      try {
        const { organizationId, allowedOrganizationIds, scope } = await resolveFeatureCheckContext({
          container,
          auth,
          selectedId: cookieSelectedOrg,
          tenantId: cookieSelectedTenant ?? undefined,
        })
        organizationIdForCheck = organizationId
        tenantIdForCheck = scope.tenantId ?? cookieSelectedTenant ?? auth.tenantId ?? null
        if (requiredFeatures.length && Array.isArray(allowedOrganizationIds) && allowedOrganizationIds.length === 0) {
          redirect('/login?requireFeature=' + encodeURIComponent(requiredFeatures.join(',')))
        }
      } catch {
        organizationIdForCheck = auth.orgId ?? null
        tenantIdForCheck = cookieSelectedTenant ?? auth.tenantId ?? null
      }

      // Check if user is superadmin - superadmins bypass all role/feature checks
      const acl = await rbac.loadAcl(auth.sub, { tenantId: tenantIdForCheck, organizationId: organizationIdForCheck })
      const isSuperAdmin = acl.isSuperAdmin

      // Check required roles (superadmins bypass)
      if (requiredRoles.length && !isSuperAdmin) {
        const roles = auth.roles || []
        const ok = requiredRoles.some(r => roles.includes(r))
        if (!ok) redirect('/login?requireRole=' + encodeURIComponent(requiredRoles.join(',')))
      }

      // Check required features (superadmins bypass via loadAcl)
      if (requiredFeatures.length && !isSuperAdmin) {
        const ok = await rbac.userHasAllFeatures(auth.sub, requiredFeatures, { tenantId: tenantIdForCheck, organizationId: organizationIdForCheck })
        if (!ok) redirect('/login?requireFeature=' + encodeURIComponent(requiredFeatures.join(',')))
      }
    }
  }
  const Component = match.route.Component
  return (
    <>
      <ApplyBreadcrumb breadcrumb={match.route.breadcrumb} title={match.route.title} titleKey={match.route.titleKey} />
      <Component params={match.params} />
    </>
  )
}

export const dynamic = 'force-dynamic'
