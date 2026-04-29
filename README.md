# Homie App

Homie App is a [Turborepo](https://turborepo.dev/) monorepo for **HOMIE** — Solana-focused product work aligned with the Eitherway × Frontier hackathon track (integrations like DFlow, Kamino, Jupiter, and partner stacks). It hosts the main web frontend plus shared UI and tooling packages.

## Monorepo structure

| Directory | What it contains | Start here |
| --- | --- | --- |
| [`apps/frontend/`](./apps/frontend) | Next.js app (App Router) — primary Homie web UI | [`apps/frontend/README.md`](./apps/frontend/README.md) |
| [`packages/ui/`](./packages/ui) | Shared React component library (`@repo/ui`) | [`packages/ui/`](./packages/ui) |
| [`packages/eslint-config/`](./packages/eslint-config) | ESLint presets (`@repo/eslint-config`) | [`packages/eslint-config/README.md`](./packages/eslint-config/README.md) |
| [`packages/typescript-config/`](./packages/typescript-config) | Shared `tsconfig` bases (`@repo/typescript-config`) | [`packages/typescript-config/`](./packages/typescript-config) |

**Package manager:** `pnpm` (see root `packageManager` in [`package.json`](./package.json)). **Task runner:** Turborepo (`turbo`).

## Related folders in the HOMIE repo

From the repository root, HOMIE also includes (not part of this Turborepo):

| Path | Notes |
| --- | --- |
| [`../homie-redirects/`](../homie-redirects) | Redirect / edge app (separate package) |
| [`../homie-mobile/`](../homie-mobile) | Mobile app and related server code |

This file documents **`homie-app`** only.

## Quick start (contributors)

1. Install dependencies (from this directory):

   ```bash
   pnpm install
   ```

2. Run all dev tasks (or scope to the frontend):

   ```bash
   pnpm dev
   ```

   ```bash
   pnpm dev --filter=frontend
   ```

3. Open the app: by default the Next.js dev server serves at [http://localhost:3000](http://localhost:3000) when only `frontend` is running.

For **Vercel** (or similar) monorepo deploys, set the project **Root Directory** to `apps/frontend` (or deploy the whole repo and filter the app in the platform’s UI).

## Common commands

### Root (`homie-app/`)

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm check-types
pnpm format
```

Run a task for one package:

```bash
pnpm dev --filter=frontend
pnpm build --filter=frontend
pnpm lint --filter=@repo/ui
```

### Frontend (`apps/frontend/`)

```bash
cd apps/frontend
pnpm dev
pnpm build
pnpm lint
pnpm start
```

### Shared UI (`packages/ui/`)

```bash
cd packages/ui
pnpm lint
pnpm check-types
```

## Documentation and context

- Hackathon / partner context: [`../SIDETRACK.md`](../SIDETRACK.md), [`../JUP_SIDETRACK.md`](../JUP_SIDETRACK.md) (Eitherway / Jupiter sidetracks).
- Product planning and DX notes at repo root: [`../ROADMAP.md`](../ROADMAP.md), [`../DAYS.md`](../DAYS.md), [`../DX-REPORT.md`](../DX-REPORT.md), [`../BACKLOG.md`](../BACKLOG.md).

## Requirements

- **Node.js** `>= 18` (see root `engines` in [`package.json`](./package.json)).
