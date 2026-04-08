# Verdaccio Package Publishing Guide (FreightTech)

## TLDR

This document describes how to publish Open Mercato packages to the FreightTech Verdaccio registry hosted on Dokploy, how to update existing packages, and how to install/update them in a client repository.

**Key Points:**
- FreightTech runs a remote Verdaccio instance at `https://dev.registry.freighttech.org`
- Publishing uses `yarn registry:dev:publish` which runs the same publish script against the remote registry
- Client repos install packages by configuring `.npmrc` to point at the Verdaccio registry for `@open-mercato/*` scoped packages
- All public packages share the same version (currently `0.4.9`); they are published together as a set
- The ksef package (`@open-mercato/ksef`) follows the same pattern as all other packages

---

## Architecture Overview

```
┌─────────────────────────────────┐
│  Open Mercato Monorepo          │
│                                 │
│  packages/                      │
│    shared/                      │
│    events/                      │
│    cache/                       │
│    queue/                       │
│    ui/                          │
│    core/                        │
│    gateway-stripe/              │
│    ksef/          ◄── example   │
│    search/                      │
│    content/                     │
│    onboarding/                  │
│    ai-assistant/                │
│    scheduler/                   │
│    cli/                         │
│    create-app/                  │
└──────────┬──────────────────────┘
           │
           │  yarn registry:dev:publish
           │  (build → pack → npm publish)
           ▼
┌──────────────────────────────────┐
│  Verdaccio on Dokploy            │
│  https://dev.registry.           │
│         freighttech.org          │
│                                  │
│  @open-mercato/* packages        │
│  Proxies npmjs for everything    │
│  else                            │
└──────────┬───────────────────────┘
           │
           │  npm install @open-mercato/ksef
           ▼
┌──────────────────────────────────┐
│  Client Repository               │
│  (e.g. freighttech-app)          │
│                                  │
│  .npmrc → registry config        │
│  package.json → @open-mercato/*  │
└──────────────────────────────────┘
```

---

## Part 1: Publishing Packages to Verdaccio

### Prerequisites

1. **Access to the monorepo** — clone `open-mercato` and install dependencies (`yarn install`)
2. **Node 24.x** — required by the monorepo
3. **Registry credentials** — you need a user account on the remote Verdaccio instance

### Step 1: Authenticate with the Remote Registry

```bash
npm adduser --registry https://dev.registry.freighttech.org
```

This stores credentials in your `~/.npmrc`. You only need to do this once.

### Step 2: Build All Packages

The publish script builds automatically, but if you want to verify first:

```bash
yarn build:packages
yarn generate
yarn build:packages
```

The three-step build is critical:
1. First `build:packages` — compiles all package source code
2. `generate` — runs module generators that scan built `dist/` directories to produce aggregated output files (e.g., `ai-tools.generated.ts`, `events.generated.ts`)
3. Second `build:packages` — recompiles packages that depend on generated files

### Step 3: Publish to Remote Verdaccio

```bash
yarn registry:dev:publish
```

This runs `scripts/registry/publish.sh` with `VERDACCIO_URL=https://dev.registry.freighttech.org`. The script:

1. Pings the registry to confirm it's reachable
2. **Unpublishes** existing versions of all packages (to allow republishing the same version)
3. Builds all packages (`yarn build:packages`)
4. For each package in dependency order:
   - Creates a tarball via `yarn pack --out package.tgz` (resolves `workspace:*` references to actual versions)
   - Publishes the tarball via `npm publish package.tgz --registry <url> --access public --tag latest`
   - Cleans up the tarball

**Publication order** (dependency-first):
```
shared → events → cache → queue → ui → core → gateway-stripe → ksef →
search → content → onboarding → ai-assistant → scheduler → cli → create-app
```

### Step 4: Verify

Visit `https://dev.registry.freighttech.org` in a browser to see published packages.

---

## Part 2: Updating a Package (e.g., ksef)

### Making Changes

1. Edit source files in `packages/ksef/src/`
2. If you modified module files (added new `events.ts`, `acl.ts`, etc.), run:
   ```bash
   yarn generate
   ```
3. Build and verify locally:
   ```bash
   yarn build:packages
   yarn typecheck
   yarn test
   ```

### Publishing the Update

After making changes, republish all packages:

```bash
yarn registry:dev:publish
```

**Important:** This republishes ALL packages, not just the one you changed. This is by design — all packages share the same version and are published as a coherent set. There is no mechanism to publish a single package in isolation because of inter-package `workspace:*` dependencies.

### Version Bumping (Optional)

If you need a new version number (e.g., to differentiate from a previous publish):

```bash
# Bump patch version across all packages (e.g., 0.4.9 → 0.4.10)
yarn workspaces foreach -A --no-private version patch
```

Then republish. Note: the Verdaccio publish script unpublishes existing versions first, so version bumping is not strictly required for the dev registry.

---

## Part 3: Adding a New Package

### Step 1: Create the Package

1. Create directory under `packages/<your-package>/`
2. Add `package.json`:

```json
{
  "name": "@open-mercato/your-package",
  "version": "0.4.9",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit"
  },
  "exports": {
    ".": "./dist/index.js",
    "./*": {
      "types": ["./src/*.ts", "./src/*.tsx"],
      "default": "./dist/*.js"
    }
  },
  "dependencies": {
    "@open-mercato/core": "workspace:*",
    "@open-mercato/shared": "workspace:*"
  },
  "publishConfig": {
    "access": "public",
    "registry": "http://localhost:4873"
  }
}
```

Key points:
- **Version** must match all other packages (check `packages/shared/package.json`)
- **`publishConfig.registry`** points to local Verdaccio by default (the publish scripts override this)
- Use `workspace:*` for internal dependencies — `yarn pack` resolves these to real versions during publish

3. Add `build.mjs` — copy from `packages/ksef/build.mjs` and adjust the success message
4. Add `tsconfig.json`
5. Add source code under `src/`

### Step 2: Register in the Publish Script

Add your package to the `PACKAGES` array in `scripts/registry/publish.sh`, respecting dependency order:

```bash
PACKAGES=(
  "shared"
  "events"
  ...
  "your-package"    # Add after all packages it depends on
  ...
  "create-app"      # create-app should remain last
)
```

### Step 3: Enable in the App (if it contains modules)

Add the package to `apps/mercato/src/modules.ts` if it provides modules:

```typescript
import '@open-mercato/your-package/modules/your_module'
```

### Step 4: Build, Generate, Publish

```bash
yarn install                    # Resolve new workspace dependency
yarn build:packages
yarn generate
yarn build:packages
yarn registry:dev:publish       # Publish to FreightTech Verdaccio
```

---

## Part 4: Installing/Updating Packages in a Client Repo

### Initial Setup

#### Step 1: Configure `.npmrc`

Create or update `.npmrc` in the client repo root:

```ini
@open-mercato:registry=https://dev.registry.freighttech.org
//dev.registry.freighttech.org/:_authToken=${NPM_TOKEN}
```

The first line routes all `@open-mercato/*` installs to the Verdaccio registry. The second line provides authentication (set `NPM_TOKEN` in your environment or CI secrets).

**Alternative (no auth token, if registry allows anonymous access):**

```ini
@open-mercato:registry=https://dev.registry.freighttech.org
```

#### Step 2: Install Packages

```bash
# Install specific packages
npm install @open-mercato/core @open-mercato/ui @open-mercato/shared

# Install the ksef package
npm install @open-mercato/ksef

# Or with yarn
yarn add @open-mercato/core @open-mercato/ui @open-mercato/shared @open-mercato/ksef
```

### Updating to Latest Version

When new versions are published to Verdaccio:

```bash
# Update all @open-mercato packages to latest
npm update @open-mercato/core @open-mercato/ui @open-mercato/shared @open-mercato/ksef

# Or force latest with yarn
yarn up '@open-mercato/*'

# Or manually set version in package.json and reinstall
# Change "0.4.9" to "0.4.10" in package.json, then:
yarn install
```

### Verifying Installation

```bash
# Check which version is installed
npm ls @open-mercato/ksef

# Check what's available on the registry
npm view @open-mercato/ksef versions --registry https://dev.registry.freighttech.org

# Check registry info
npm info @open-mercato/ksef --registry https://dev.registry.freighttech.org
```

### Using the ksef Package in Client Code

After installation, import from the package:

```typescript
// Module registration (in your app's modules.ts)
import '@open-mercato/ksef/modules/ksef'

// Direct imports
import { KsefAuthService } from '@open-mercato/ksef/modules/ksef/services/KsefAuthService'
```

The ksef module is auto-discovered by the platform's module system once imported in `modules.ts`. It provides:
- Backend pages under `/backend/ksef/...`
- API routes under `/api/ksef/...`
- Workers for invoice submission, status polling, UPO download, and receive sync
- ACL features: `ksef.view`, `ksef.submit`, `ksef.receive`, `ksef.settings.manage`

---

## Part 5: Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| `npm ERR! 403 Forbidden` during publish | Run `npm adduser --registry https://dev.registry.freighttech.org` to authenticate |
| `ETARGET` — version not found | The version hasn't been published yet. Run `yarn registry:dev:publish` from the monorepo |
| `yarn pack` fails for a package | Ensure `yarn build:packages` completed successfully first. Check for TypeScript errors with `yarn typecheck` |
| Registry unreachable | Verify `https://dev.registry.freighttech.org` is accessible. Check Dokploy dashboard for the Verdaccio service status |
| `workspace:*` appears in installed package.json | The tarball was created incorrectly. `yarn pack` should resolve `workspace:*` — ensure you're using Yarn 4.x |
| Client gets stale version | Clear npm/yarn cache: `npm cache clean --force` or `yarn cache clean`. Delete `node_modules` and lockfile, reinstall |

### Local Verdaccio (for development)

For local testing before publishing to the remote registry:

```bash
# Start local Verdaccio
docker compose up -d verdaccio

# Create a user (one-time)
yarn registry:setup-user

# Publish to local registry (localhost:4873)
yarn registry:publish

# Test installation from local registry
npm install @open-mercato/ksef --registry http://localhost:4873
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Authenticate with remote Verdaccio | `npm adduser --registry https://dev.registry.freighttech.org` |
| Build packages | `yarn build:packages && yarn generate && yarn build:packages` |
| Publish to FreightTech Verdaccio | `yarn registry:dev:publish` |
| Publish to local Verdaccio | `yarn registry:publish` |
| Start local Verdaccio | `docker compose up -d verdaccio` |
| Install in client repo | `yarn add @open-mercato/ksef` (with `.npmrc` configured) |
| Update in client repo | `yarn up '@open-mercato/*'` |
| Check available versions | `npm view @open-mercato/ksef versions --registry https://dev.registry.freighttech.org` |
| Scaffold a new app from registry | `npx --registry https://dev.registry.freighttech.org create-mercato-app@latest my-app` |
