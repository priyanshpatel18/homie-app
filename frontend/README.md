# Homie

The Homie web frontend — a Solana-native product surface for the Eitherway × Frontier hackathon track.

## What is Homie?

Homie is the public web app for HOMIE, a Solana product workspace combining
partner integrations (DFlow, Kamino, Jupiter, and others) into a single
surface. This frontend currently hosts the marketing/landing experience and
will grow into the live product UI.

## Key Features

- **Solana-native UX**: Wallet-aware flows designed around partner DeFi stacks
- **Partner integrations**: Surface for DFlow, Kamino, Jupiter, and more as they land
- **Modern App Router**: Built on Next.js 16 with React 19 and the new caching model

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Styling**: Tailwind CSS v4, `tw-animate-css`, Motion
- **UI Primitives**: Base UI, shadcn, Hugeicons, Paper Design shaders
- **Code Quality**: ESLint (`eslint-config-next`)

> Note: this Next.js version has breaking changes vs. older releases. See [`AGENTS.md`](./AGENTS.md) before writing code.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9.x

### Installation

```bash
# Install dependencies (run from repo root: homie-app/)
pnpm install

# Run development server (from this directory)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Environment Variables

Create a `.env.local` file in this directory for any required keys. There are
no required envs at the moment; partner integrations will document their own.

## Development

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint
pnpm lint
```

You can also run these from the repo root via the workspace scripts:

```bash
pnpm frontend:dev
pnpm frontend:build
pnpm frontend:lint
pnpm frontend:start
```

## Project Structure

```
frontend/
├── app/              # Next.js app router pages, metadata, sitemap, robots
├── components/       # React components
│   └── ui/           # Reusable UI primitives
├── config/           # Site config and constants
├── lib/              # Shared utilities
└── public/           # Static assets
```

## Deployment

The frontend deploys on Vercel as a monorepo project with **Root Directory**
set to `frontend`.
