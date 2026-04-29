# Homie App

Homie App is a [Turborepo](https://turborepo.dev/) monorepo for **HOMIE**, the
Solana-focused product workspace built for the Eitherway × Frontier hackathon
track. It hosts the primary Homie web frontend and the workspace packages it
will grow into (DFlow, Kamino, Jupiter, and other partner integrations).

## Monorepo Structure

| Directory | What it contains | Start here |
| --- | --- | --- |
| [`frontend/`](./frontend) | Next.js (App Router) Homie web frontend | [`frontend/README.md`](./frontend/README.md) |
| [`packages/`](./packages) | Shared workspace libraries (empty for now; domain packages land here) | [`packages/`](./packages) |

**Package manager:** `pnpm` (see `packageManager` in [`package.json`](./package.json)).
**Task runner:** Turborepo.

## Quick Start (Contributors)

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Run the frontend in dev:
   ```bash
   pnpm frontend:dev
   ```
3. Open [http://localhost:3000](http://localhost:3000).

For Vercel monorepo deploys, set the project **Root Directory** to `frontend`.

## Common Commands

### Root

```bash
pnpm install
pnpm frontend:dev
pnpm frontend:build
pnpm frontend:lint
pnpm frontend:start
pnpm build
pnpm lint
pnpm check-types
pnpm format
```

### Frontend (`/frontend`)

```bash
pnpm dev
pnpm build
pnpm lint
pnpm start
```

## Commit and PR Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
messages and PR titles. Format:

```
type(scope): short description
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`,
`test`, `build`, `ci`, `revert`.

## Requirements

- **Node.js** `>= 18` (see `engines` in [`package.json`](./package.json))
- **pnpm** `9.x`
