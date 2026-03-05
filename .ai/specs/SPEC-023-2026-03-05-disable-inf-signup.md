# SPEC-023: Disable Sign-Up for INF and FreightTech Brands

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Created** | 2026-03-05 |
| **Plane Task** | CHAME-43 |
| **Author** | Claude |

## Summary

Remove self-service sign-up functionality from the INF and FreightTech brand frontends. Users should not be able to access the registration/onboarding flow from the login pages or directly via URL.

## Background

The INF brand (`inf.localhost`, `inf.freighttech.org`) currently displays a "Sign up" button on the login page that links to `/inf/onboarding`. The FreightTech brand (`freighttech.org`, `freighttech.localhost`) also has an onboarding page at `/freighttech/onboarding`. These self-service registration flows should be disabled as user accounts are managed internally for these brands.

### Current State

1. **INF Login Page** (`apps/mercato/src/app/inf/login/page.tsx`)
   - Contains a "Sign up" link button pointing to `/inf/onboarding`
   - Located at lines 189-194

2. **INF Onboarding Page** (`apps/mercato/src/app/inf/onboarding/page.tsx`)
   - Full self-service registration form
   - Calls `/api/onboarding/onboarding` POST endpoint

3. **FreightTech Login Page** (`apps/mercato/src/app/freighttech/login/page.tsx`)
   - No sign-up link in the login form

4. **FreightTech Landing Page** (`apps/mercato/src/app/freighttech/page.tsx`)
   - Contains "Get Started" button linking to `/onboarding`

5. **FreightTech Onboarding Page** (`apps/mercato/src/app/freighttech/onboarding/page.tsx`)
   - Full self-service registration form
   - Calls `/api/onboarding/onboarding` POST endpoint

5. **Backend Protection** (already in place)
   - `packages/onboarding/src/modules/onboarding/api/post/onboarding.ts`
   - Protected by `SELF_SERVICE_ONBOARDING_ENABLED` environment variable
   - Returns 404 when env var is not set to `'true'`

## Requirements

### Functional Requirements

1. **FR-1**: Remove the "Sign up" button from the INF login page
2. **FR-2**: Remove the INF onboarding page (return 404 for `/inf/onboarding`)
3. **FR-3**: Remove the FreightTech onboarding page (return 404 for `/freighttech/onboarding`)
4. **FR-4**: Verify backend protection via environment variable in production

### Non-Functional Requirements

1. **NFR-1**: No impact on login functionality
2. **NFR-2**: No impact on other brands (OpenMercato, 4R Cargo)

## Design

### Approach

Simple removal approach since INF and FreightTech have dedicated frontend pages separate from other brands.

### Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/mercato/src/app/inf/login/page.tsx` | Edit | Remove sign-up link (lines 189-194) |
| `apps/mercato/src/app/inf/onboarding/page.tsx` | Delete | Remove file entirely |
| `apps/mercato/src/app/freighttech/onboarding/page.tsx` | Delete | Remove file entirely |

### Code Changes

#### 1. INF Login Page

**Before:**
```tsx
<button disabled={submitting} className="...">
  {submitting ? translate('auth.login.loading', 'Loading...') : translate('auth.signIn', 'Sign in')}
</button>
<Link
  href="/inf/onboarding"
  className="h-10 rounded-full border border-[#E67E5E] text-[#E67E5E] font-medium hover:bg-[#E67E5E] hover:text-white transition flex items-center justify-center"
>
  {translate('auth.signUp', 'Sign up')}
</Link>
<div className="text-xs text-gray-500 mt-2 text-center">
```

**After:**
```tsx
<button disabled={submitting} className="...">
  {submitting ? translate('auth.login.loading', 'Loading...') : translate('auth.signIn', 'Sign in')}
</button>
<div className="text-xs text-gray-500 mt-2 text-center">
```

#### 2. INF Onboarding Page

Delete the file `apps/mercato/src/app/inf/onboarding/page.tsx`. Next.js will automatically return 404 for `/inf/onboarding`.

#### 3. FreightTech Onboarding Page

Delete the file `apps/mercato/src/app/freighttech/onboarding/page.tsx`. Next.js will automatically return 404 for `/freighttech/onboarding`.

Note: The FreightTech login page (`apps/mercato/src/app/freighttech/login/page.tsx`) does not have a sign-up link, so no changes are needed there.

### Backend Protection

The backend is already protected. No code changes needed.

```typescript
// packages/onboarding/src/modules/onboarding/api/post/onboarding.ts:24-26
if (process.env.SELF_SERVICE_ONBOARDING_ENABLED !== 'true') {
  return NextResponse.json({ ok: false, error: 'Self-service onboarding is disabled.' }, { status: 404 })
}
```

**Production Action Required**: Verify `SELF_SERVICE_ONBOARDING_ENABLED` is NOT set to `'true'` in the INF production environment.

## Testing

### Manual Testing

1. Navigate to `/inf/login`
   - **Expected**: No "Sign up" button visible
   - **Expected**: Login form works correctly

2. Navigate to `/inf/onboarding` directly
   - **Expected**: 404 page

3. Navigate to `/freighttech/login`
   - **Expected**: Login form works correctly (no sign-up button was present)

4. Navigate to `/freighttech/onboarding` directly
   - **Expected**: 404 page

5. POST to `/api/onboarding/onboarding`
   - **Expected**: 404 response (when env var not set)

### Verification Checklist

- [x] Sign-up button removed from INF login page
- [x] `/inf/onboarding` returns 404
- [x] `/freighttech/onboarding` returns 404
- [ ] Login functionality unchanged
- [ ] Other brands unaffected
- [ ] `SELF_SERVICE_ONBOARDING_ENABLED` verified in production

## Rollback

To re-enable sign-up for INF:

1. Restore `apps/mercato/src/app/inf/onboarding/page.tsx` from git history
2. Add sign-up link back to `apps/mercato/src/app/inf/login/page.tsx`
3. Set `SELF_SERVICE_ONBOARDING_ENABLED=true` in environment

To re-enable sign-up for FreightTech:

1. Restore `apps/mercato/src/app/freighttech/onboarding/page.tsx` from git history
2. Optionally add sign-up link to `apps/mercato/src/app/freighttech/login/page.tsx`
3. Set `SELF_SERVICE_ONBOARDING_ENABLED=true` in environment

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-05 | Claude | Initial specification |
| 2026-03-05 | Claude | Added FreightTech onboarding page removal |
