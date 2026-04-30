# Homie App

Homie App is a [Turborepo](https://turborepo.dev/) monorepo for **HOMIE** — a
Solana DeFi chatbot/agent assistant that reads portfolios, fetches live market
data and yield rates, and builds/signs Solana transactions (Marinade staking,
Kamino lending, Jupiter swaps, and more). Built for the Eitherway × Frontier
hackathon.

## Monorepo Structure

| Directory | What it contains | Start here |
| --- | --- | --- |
| [`frontend/`](./frontend) | Next.js (App Router) Homie web frontend | [`frontend/README.md`](./frontend/README.md) |
| [`mobile/`](./mobile) | React Native + Expo iOS/Android app | [`mobile/`](./mobile) |
| [`server/`](./server) | Express agent backend (OpenRouter, Solana SDKs, push) | [`server/`](./server) |
| [`sdk/`](./sdk) | Publishable client SDKs (`@homie/sdk`) shared across web, mobile, and future platforms | [`sdk/homie-sdk/README.md`](./sdk/homie-sdk/README.md) |
| [`packages/`](./packages) | Internal shared workspace libraries (domain packages land here) | [`packages/`](./packages) |

**Package manager:** `pnpm` (see `packageManager` in [`package.json`](./package.json)).
**Task runner:** Turborepo.

## Quick Start (Contributors)

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Build the shared SDK once so workspaces can resolve it:
   ```bash
   pnpm sdk:build
   ```
3. Run the pieces you need:
   ```bash
   pnpm server:dev      # Express agent backend on http://localhost:3000
   pnpm frontend:dev    # Next.js web frontend on http://localhost:3001
   pnpm mobile:dev      # Expo dev server (then press i / a)
   ```

For Vercel monorepo deploys, set the project **Root Directory** to `frontend`.

## Common Commands

### Root

```bash
pnpm install
pnpm frontend:dev
pnpm frontend:build
pnpm frontend:lint
pnpm frontend:start
pnpm mobile:dev
pnpm mobile:android
pnpm mobile:ios
pnpm mobile:web
pnpm server:dev
pnpm server:start
pnpm sdk:build
pnpm sdk:dev
pnpm build
pnpm lint
pnpm check-types
pnpm format
```

### Web Frontend (`/frontend`)

```bash
pnpm dev
pnpm build
pnpm lint
pnpm start
```

### Mobile (`/mobile`)

```bash
pnpm start         # Expo dev server (Expo Go)
pnpm android       # Build + run on Android device/emulator
pnpm ios           # Build + run on iOS (macOS + Xcode required)
pnpm web           # Expo web target
```

The mobile app reads `EXPO_PUBLIC_API_URL` from `mobile/.env` to reach the
backend. Defaults useful per environment:

| Target | Value |
| --- | --- |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Physical device | `http://<your-LAN-IP>:3000` |
| Production | `https://your-server.com` |

### Server (`/server`)

```bash
pnpm dev           # node --watch index.js
pnpm start         # node index.js
```

Copy `server/.env.example` to `server/.env` and fill in `LLM_API_KEY` (OpenRouter)
plus optional `JUP_API_KEY`, `BIRDEYE_API_KEY`, `SANCTUM_API_KEY`. Server boots
on `http://0.0.0.0:3000`.

### SDK (`/sdk/homie-sdk`)

```bash
pnpm build         # tsc → dist/
pnpm dev           # tsc --watch
pnpm check-types
```

The SDK is wired into `mobile` and `server` via `"@homie/sdk": "workspace:*"`.
Web (`frontend`) can adopt it the same way when it needs a typed client to the
agent backend.

## Adding a New Workspace Package

The monorepo is set up to grow into more shared libraries (DFlow, Kamino,
Jupiter, partner integrations, wallet adapters, etc.). Two slots exist:

- **`packages/<name>/`** — internal-only shared libraries. Reference them from
  workspaces with `"<name>": "workspace:*"` in dependencies.
- **`sdk/<name>/`** — publishable SDKs intended for external consumers.

Both slots are picked up automatically by [`pnpm-workspace.yaml`](./pnpm-workspace.yaml).

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
- **Expo CLI** is invoked via `pnpm` (no global install required)
