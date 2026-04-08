# Package Publishing Guide (FreightTech)

## TLDR

This document describes how packages are published and consumed across two separate registries.

**Key Points:**
- **Platform packages** (`shared`, `core`, `ui`, etc.) are published to the **official npm registry** (`https://registry.npmjs.org`) via CI workflows (changesets). They are installed from npm by all consumers.
- **FMS packages** (`fms`, `fms_tracking`, `ksef`) are published **exclusively** to the **FreightTech Verdaccio** (`https://dev.registry.freighttech.org`) via `yarn registry:fms:publish`. They must never be published to npm.
- The FreightTech Verdaccio proxies npmjs for platform packages, so FMS client repos can install both FMS and platform packages from a single registry endpoint.
- A local Verdaccio (`localhost:4873`) is available for development testing of both package groups.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Open Mercato Monorepo                                  │
│                                                         │
│  Platform packages/          FMS packages/              │
│    shared/                     fms/                     │
│    events/                     fms_tracking/            │
│    cache/                      ksef/                    │
│    queue/                                               │
│    ui/                                                  │
│    core/                                                │
│    gateway-stripe/                                      │
│    search/                                              │
│    content/                                             │
│    onboarding/                                          │
│    ai-assistant/                                        │
│    scheduler/                                           │
│    cli/                                                 │
│    create-app/                                          │
└────────┬──────────────────────────────┬─────────────────┘
         │                              │
         │ CI (changesets)              │ yarn registry:fms:publish
         │                              │
         ▼                              ▼
┌──────────────────┐    ┌──────────────────────────────────┐
│  npm registry    │    │  FreightTech Verdaccio           │
│  registry.       │◄───│  https://dev.registry.           │
│  npmjs.org       │    │         freighttech.org          │
│                  │    │                                  │
│  @open-mercato/  │    │  @open-mercato/fms               │
│    shared        │    │  @open-mercato/fms_tracking      │
│    core          │    │  @open-mercato/ksef              │
│    ui ...        │    │                                  │
│                  │    │  Proxies npmjs for platform pkgs  │
└──────────────────┘    └──────────┬───────────────────────┘
                                   │
                                   │  yarn add @open-mercato/fms
                                   │  (+ platform pkgs via proxy)
                                   ▼
                        ┌──────────────────────────────────┐
                        │  FMS Client Repository           │
                        │  (e.g. freighttech-app)          │
                        │                                  │
                        │  .npmrc → FreightTech Verdaccio  │
                        │  Gets FMS pkgs directly +        │
                        │  platform pkgs via npm proxy     │
                        └──────────────────────────────────┘
```

---

## Part 1: Publishing FMS Packages

This is the primary workflow for FreightTech developers. FMS packages are published to the FreightTech Verdaccio only.

### Prerequisites

1. **Access to the monorepo** — clone `open-mercato` and install dependencies (`yarn install`)
2. **Node 24.x** — required by the monorepo
3. **Registry credentials** — you need a user account on the FreightTech Verdaccio instance

### Step 1: Authenticate with the FreightTech Verdaccio

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

### Step 3: Publish FMS Packages

```bash
yarn registry:fms:publish
```

This runs `scripts/registry/publish-fms.sh` which publishes **only FMS packages** to `https://dev.registry.freighttech.org`. The script:

1. Pings the registry to confirm it's reachable
2. **Unpublishes** existing versions of all FMS packages (to allow republishing the same version)
3. Builds all packages (`yarn build:packages`)
4. For each FMS package in dependency order:
   - Creates a tarball via `yarn pack --out package.tgz` (resolves `workspace:*` references to actual versions)
   - Publishes the tarball via `npm publish package.tgz --registry <url> --access public --tag latest`
   - Cleans up the tarball

**FMS publication order** (dependency-first):
```
fms → fms_tracking → ksef
```

### Step 4: Verify

Visit `https://dev.registry.freighttech.org` in a browser to see published packages.

---

## Part 2: Publishing Platform Packages

Platform packages (`shared`, `core`, `ui`, `cli`, etc.) are published to the **official npm registry** (`https://registry.npmjs.org`) via CI workflows using changesets. See `SPEC-066` for the full release workflow.

**Platform packages are NOT published via manual scripts to production.** The `yarn registry:publish` script exists only for **local Verdaccio testing** during development.

### Local Verdaccio Testing (Platform)

```bash
# Start local Verdaccio
docker compose up -d verdaccio

# Publish platform packages to local Verdaccio (localhost:4873)
yarn registry:publish
```

**Platform packages in the local publish script** (dependency-first):
```
shared → events → cache → queue → ui → core → gateway-stripe →
search → content → onboarding → ai-assistant → scheduler → cli → create-app
```

---

## Part 3: Updating a Package

### Making Changes

1. Edit source files in the relevant package (e.g., `packages/fms/src/`, `packages/ksef/src/`)
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

Use the correct publish command based on which package you changed:

- **FMS packages** (`fms`, `fms_tracking`, `ksef`):
  ```bash
  yarn registry:fms:publish
  ```

- **Platform packages** (shared, core, ui, etc.) — published via CI; for local testing only:
  ```bash
  yarn registry:publish
  ```

**Important:** Each script republishes all packages in its group, not just the one you changed. This is by design — packages within a group are published as a coherent set due to inter-package `workspace:*` dependencies.

### Version Bumping (Optional)

If you need a new version number (e.g., to differentiate from a previous publish):

```bash
# Bump patch version across all packages (e.g., 0.4.9 → 0.4.10)
yarn workspaces foreach -A --no-private version patch
```

Then republish. Note: the Verdaccio publish script unpublishes existing versions first, so version bumping is not strictly required for the dev registry.

---

## Part 4: Adding a New FMS Package

### Step 1: Create the Package

1. Create directory under `packages/<your-package>/`
2. Add `package.json`:

```json
{
  "name": "@open-mercato/your-fms-package",
  "version": "0.1.0",
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
    "@open-mercato/ui": "workspace:*"
  },
  "peerDependencies": {
    "@mikro-orm/postgresql": "^6.5.9",
    "@open-mercato/shared": "workspace:*",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@open-mercato/shared": "workspace:*"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://dev.registry.freighttech.org/"
  }
}
```

Key points:
- **`publishConfig.registry`** must point to `https://dev.registry.freighttech.org/` — FMS packages are never published to npm
- **`@open-mercato/shared`** goes in `peerDependencies` (+ `devDependencies` for local dev)
- Do **not** set `"private": true` — that blocks publishing
- Use `workspace:*` for internal dependencies — `yarn pack` resolves these to real versions during publish

3. Add `build.mjs` — copy from `packages/ksef/build.mjs` and adjust the success message
4. Add `tsconfig.json`
5. Add source code under `src/`

### Step 2: Register in the FMS Publish Script

Add your package to the `PACKAGES` array in `scripts/registry/publish-fms.sh`:

```bash
PACKAGES=(
  "fms"
  "fms_tracking"
  "ksef"
  "your-fms-package"  # Add after its dependencies
)
```

FMS packages must **never** be added to `scripts/registry/publish.sh` (the platform script).

### Step 3: Enable in the App (if it contains modules)

Add the package to `apps/mercato/src/modules.ts` if it provides modules:

```typescript
import '@open-mercato/your-fms-package/modules/your_module'
```

### Step 4: Build, Generate, Publish

```bash
yarn install                    # Resolve new workspace dependency
yarn build:packages
yarn generate
yarn build:packages
yarn registry:fms:publish       # Publish to FreightTech Verdaccio
```

---

## Part 5: Installing/Updating Packages in an FMS Client Repo

### Initial Setup

#### Step 1: Configure `.npmrc`

Create or update `.npmrc` in the client repo root:

```ini
@open-mercato:registry=https://dev.registry.freighttech.org
//dev.registry.freighttech.org/:_authToken=${NPM_TOKEN}
```

The first line routes all `@open-mercato/*` installs to the FreightTech Verdaccio. The Verdaccio instance proxies npmjs, so platform packages (`shared`, `core`, `ui`, etc.) are resolved transparently from npm. The second line provides authentication (set `NPM_TOKEN` in your environment or CI secrets).

**Alternative (no auth token, if registry allows anonymous access):**

```ini
@open-mercato:registry=https://dev.registry.freighttech.org
```

#### Step 2: Install Packages

```bash
# Install FMS packages (from FreightTech Verdaccio)
yarn add @open-mercato/fms @open-mercato/fms_tracking @open-mercato/ksef

# Platform packages are resolved via Verdaccio's npm proxy
yarn add @open-mercato/core @open-mercato/ui @open-mercato/shared
```

### Updating to Latest Version

When new versions are published:

```bash
# Update all @open-mercato packages to latest
yarn up '@open-mercato/*'

# Or manually set version in package.json and reinstall
yarn install
```

### Verifying Installation

```bash
# Check which version is installed
npm ls @open-mercato/fms

# Check what's available on the registry
npm view @open-mercato/fms versions --registry https://dev.registry.freighttech.org

# Check registry info
npm info @open-mercato/fms --registry https://dev.registry.freighttech.org
```

### Using FMS Packages in Client Code

After installation, import from the packages:

```typescript
// Module registration (in your app's modules.ts)
import '@open-mercato/fms/modules/fms_invoicing'
import '@open-mercato/fms/modules/fms_locations'
import '@open-mercato/fms/modules/fms_offers'
// ... other fms modules as needed

import '@open-mercato/fms_tracking/modules/fms_tracking'
import '@open-mercato/ksef/modules/ksef'
```

Modules are auto-discovered by the platform's module system once imported in `modules.ts`.

#### Available FMS packages

| Package | Modules | Description |
|---------|---------|-------------|
| `@open-mercato/fms` | contractors, fms_documents, fms_files, fms_invoicing, fms_locations, fms_offers, fms_products, fms_projects, fms_teams, pdf_templates, email_templates, tasks_board, transports, truck_loading | Core FMS functionality |
| `@open-mercato/fms_tracking` | fms_tracking | Freight tracking with FreightTech integration |
| `@open-mercato/ksef` | ksef | Polish e-invoice system (KSeF) integration |

---

## Part 6: Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| `npm ERR! 403 Forbidden` during publish | Run `npm adduser --registry https://dev.registry.freighttech.org` to authenticate |
| `ETARGET` — version not found | The version hasn't been published yet. Run `yarn registry:fms:publish` from the monorepo |
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

# Publish platform packages to local Verdaccio
yarn registry:publish

# Publish FMS packages to local Verdaccio
yarn registry:fms:publish:local

# Test installation from local registry
npm install @open-mercato/fms --registry http://localhost:4873
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Authenticate with FreightTech Verdaccio | `npm adduser --registry https://dev.registry.freighttech.org` |
| Build packages | `yarn build:packages && yarn generate && yarn build:packages` |
| **Publish FMS packages** to FreightTech Verdaccio | `yarn registry:fms:publish` |
| Publish FMS packages to local Verdaccio | `yarn registry:fms:publish:local` |
| Publish platform packages to local Verdaccio | `yarn registry:publish` |
| Start local Verdaccio | `docker compose up -d verdaccio` |
| Install FMS in client repo | `yarn add @open-mercato/fms @open-mercato/fms_tracking @open-mercato/ksef` |
| Update in client repo | `yarn up '@open-mercato/*'` |
| Check available versions | `npm view @open-mercato/fms versions --registry https://dev.registry.freighttech.org` |
| Scaffold a new app from registry | `npx --registry https://dev.registry.freighttech.org create-mercato-app@latest my-app` |

---

## Registry Separation Rules

| Package Group | Production Registry | Publish Command | Publish Script |
|--------------|-------------------|-----------------|----------------|
| **Platform** (shared, core, ui, cli, etc.) | `https://registry.npmjs.org` (via CI/changesets) | CI only; `yarn registry:publish` for local testing | `scripts/registry/publish.sh` |
| **FMS** (fms, fms_tracking, ksef) | `https://dev.registry.freighttech.org` | `yarn registry:fms:publish` | `scripts/registry/publish-fms.sh` |

**Rules:**
- FMS packages must **never** be published to npm (`registry.npmjs.org`)
- FMS packages must **never** be added to `scripts/registry/publish.sh`
- Platform packages are **not** manually published — CI handles npm releases
- The FreightTech Verdaccio proxies npm, so FMS clients get platform packages transparently
