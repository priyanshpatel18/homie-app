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

**Package manager:** `npm` (see `packageManager` in [`package.json`](./package.json)).
**Task runner:** Turborepo.

> **Mobile is intentionally outside the npm workspace.** Expo/Metro doesn't
> play well with hoisted workspace deps, so `mobile/` keeps its own
> `package-lock.json` and consumes `@homie/sdk` via `file:../sdk/homie-sdk`.
> Use `npm run mobile:install` to install it.

## Quick Start (Contributors)

1. Install workspace dependencies:
   ```bash
   npm install
   ```
2. Install mobile dependencies (separate, outside workspace):
   ```bash
   npm run mobile:install
   ```
3. Build the shared SDK once so workspaces can resolve it:
   ```bash
   npm run sdk:build
   ```
4. Run the pieces you need:
   ```bash
   npm run server:dev      # Express agent backend on http://localhost:3000
   npm run frontend:dev    # Next.js web frontend on http://localhost:3001
   npm run mobile:dev      # Expo dev server (then press i / a)
   ```

For Vercel monorepo deploys, set the project **Root Directory** to `frontend`.

## Common Commands

### Root

```bash
npm install
npm run frontend:dev
npm run frontend:build
npm run frontend:lint
npm run frontend:start
npm run mobile:install
npm run mobile:dev
npm run mobile:android
npm run mobile:ios
npm run mobile:web
npm run server:dev
npm run server:start
npm run sdk:build
npm run sdk:dev
npm run build
npm run lint
npm run check-types
npm run format
```

### Web Frontend (`/frontend`)

```bash
npm run dev
npm run build
npm run lint
npm run start
```

### Mobile (`/mobile`)

```bash
npm install        # mobile maintains its own package-lock.json
npm start          # Expo dev server (Expo Go)
npm run android    # Build + run on Android device/emulator
npm run ios        # Build + run on iOS (macOS + Xcode required)
npm run web        # Expo web target
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
npm run dev        # tsx watch src/index.ts
npm start          # node dist/index.js
```

Copy `server/.env.example` to `server/.env` and fill in `LLM_API_KEY` (OpenRouter)
plus optional `JUP_API_KEY`, `BIRDEYE_API_KEY`, `SANCTUM_API_KEY`. Server boots
on `http://0.0.0.0:3000`.

### SDK (`/sdk/homie-sdk`)

```bash
npm run build      # tsc → dist/
npm run dev        # tsc --watch
npm run check-types
```

The SDK is wired into `server` and `frontend` via `"@homie/sdk": "*"`
(resolved through npm workspaces). `mobile` lives outside the workspace and
consumes it via `"@homie/sdk": "file:../sdk/homie-sdk"`.

## Adding a New Workspace Package

The monorepo is set up to grow into more shared libraries (DFlow, Kamino,
Jupiter, partner integrations, wallet adapters, etc.). Two slots exist:

- **`packages/<name>/`** — internal-only shared libraries. Reference them from
  other workspaces with `"<name>": "*"` in dependencies.
- **`sdk/<name>/`** — publishable SDKs intended for external consumers.

Both slots are picked up automatically by the `workspaces` array in the root
[`package.json`](./package.json) (`packages/*` and `sdk/*`).

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
- **npm** `>= 10`
- **Expo CLI** is invoked via `npm` scripts (no global install required)
