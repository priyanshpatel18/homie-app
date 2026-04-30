---
name: Privy
description: Use when building authentication systems, embedded wallets, wallet infrastructure, transaction signing, user management, and policy controls for blockchain applications. Reach for this skill when implementing user onboarding, wallet creation, transaction execution, multi-signature controls, or integrating crypto functionality into web and mobile apps.
metadata:
    mintlify-proj: privy
    version: "1.0"
---

# Privy Skill Reference

## Product summary

Privy is an authentication and wallet infrastructure platform for building crypto applications. It provides client-side SDKs (React, React Native, Swift, Android, Flutter, Unity) and server-side SDKs (Node.js, Python, Java, Go, Rust) to authenticate users, create and manage embedded wallets, control wallet access via policies and signers, and execute transactions across 50+ blockchains.

**Key files and configuration:**
- Dashboard: https://dashboard.privy.io (create apps, configure login methods, set up policies)
- Client SDK: `@privy-io/react-auth` (React), `@privy-io/react-native` (React Native), platform-specific SDKs for mobile
- Server SDK: `@privy-io/node` (Node.js), language-specific packages for Python, Java, Go, Rust
- Configuration: `PrivyProvider` wraps your app with `appId` and `clientId` from dashboard
- REST API: Direct HTTP endpoints for users, wallets, policies, transactions, webhooks
- Primary docs: https://docs.privy.io

## When to use

Reach for this skill when:
- Building user authentication with email, SMS, social login, passkeys, or wallet-based login
- Creating embedded wallets for users without requiring external wallet clients
- Managing wallet ownership and access control via owners, signers, and policies
- Executing transactions (send, sign, swap) on Ethereum, Solana, or other blockchains
- Implementing multi-signature approval flows or quorum-based controls
- Setting up automated wallet actions with server-side signers
- Configuring transaction policies (amount limits, recipient allowlists, contract restrictions)
- Handling webhooks for transaction status, user events, or wallet activity
- Migrating users from external authentication systems to Privy
- Building treasury wallets, trading apps, or agent wallets with strict controls

## Quick reference

### SDK Installation

| Platform | Package | Command |
|----------|---------|---------|
| React | `@privy-io/react-auth` | `npm install @privy-io/react-auth@latest` |
| React Native | `@privy-io/react-native` | `npm install @privy-io/react-native@latest` |
| Node.js | `@privy-io/node` | `npm install @privy-io/node@latest` |
| Python | `privy-python` | `pip install privy-python` |
| Java | `io.privy:privy-java` | Maven/Gradle dependency |
| Go | `github.com/privy-io/privy-go` | `go get github.com/privy-io/privy-go` |

### Core Concepts

| Concept | Purpose | Example |
|---------|---------|---------|
| **User** | Authenticated identity with linked accounts (email, wallet, social) | User ID, email, wallet addresses |
| **Embedded wallet** | Privy-managed wallet owned by user or authorization key | Self-custodial user wallet, server-controlled treasury |
| **Owner** | Entity with full control over wallet (user, auth key, or quorum) | User owns their wallet; auth key owns treasury |
| **Signer** | Additional party with scoped permissions to sign transactions | Server signer for automated trades with limits |
| **Policy** | Rules constraining what actions a wallet can perform | Max transfer amount, approved recipients, contract allowlist |
| **Authorization key** | Server-controlled credential for managing wallets via API | Backend signer for treasury operations |
| **Access token** | JWT issued after user login; proves authentication | Pass to backend to verify user identity |
| **Identity token** | JWT containing user data (linked accounts, metadata) | Query user info on backend without API call |

### Dashboard Configuration

| Task | Location | Notes |
|------|----------|-------|
| Create app | Applications page | Get `appId` and `clientId` for SDK setup |
| Configure login methods | App > Authentication > Login methods | Enable email, SMS, social, wallet, passkey |
| Set up MFA | App > Authentication > Multi-factor | Require MFA for sensitive actions |
| Create policies | App > Wallet infrastructure > Policies | Define transaction rules and limits |
| Configure gas sponsorship | App > Wallet infrastructure > Gas | Auto-fund wallets for transaction fees |
| Set up webhooks | App > Webhooks | Subscribe to user, transaction, wallet events |
| Manage team | Account > Team | Invite members with Admin, Developer, Viewer roles |

### Common API Endpoints

| Resource | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| Create user | POST | `/v1/users` | Create user with optional wallets |
| Get user | GET | `/v1/users/{user_id}` | Fetch user by ID |
| Create wallet | POST | `/v1/wallets` | Create embedded wallet for user or auth key |
| Send transaction | POST | `/v1/wallets/{wallet_id}/ethereum/eth_sendTransaction` | Execute transaction on Ethereum |
| Create policy | POST | `/v1/policies` | Define transaction rules |
| Get wallet | GET | `/v1/wallets/{wallet_id}` | Fetch wallet details |
| List webhooks | GET | `/v1/webhooks` | View configured webhook endpoints |

## Decision guidance

### When to use embedded wallets vs. external wallets

| Scenario | Embedded | External |
|----------|----------|----------|
| New users without crypto experience | ✓ | |
| Users with existing MetaMask/Phantom | | ✓ |
| Seamless onboarding without wallet client | ✓ | |
| Users want to bring their own assets | | ✓ |
| Server-controlled treasury/agent wallets | ✓ | |
| Power users familiar with wallet UX | | ✓ |

### When to use Privy authentication vs. JWT-based auth

| Scenario | Privy Auth | JWT-based |
|----------|-----------|-----------|
| Building from scratch | ✓ | |
| Existing auth system (Firebase, Auth0) | | ✓ |
| Need email, SMS, social, passkey login | ✓ | |
| Only adding wallet functionality | | ✓ |
| Want Privy-managed user object | ✓ | |
| Minimal integration overhead | ✓ | |

### When to use client-side vs. server-side signing

| Scenario | Client-side | Server-side |
|----------|------------|------------|
| User-initiated transactions | ✓ | |
| Automated trading/limit orders | | ✓ |
| User approval required | ✓ | |
| Treasury operations | | ✓ |
| User controls keys | ✓ | |
| Application controls keys | | ✓ |

### When to use policies vs. signers

| Scenario | Policies | Signers |
|----------|----------|---------|
| Limit transaction amounts | ✓ | |
| Restrict recipient addresses | ✓ | |
| Delegate signing to another party | | ✓ |
| Require approval from multiple parties | | ✓ |
| Prevent contract interactions | ✓ | |
| Enforce time-based restrictions | ✓ | |

## Workflow

### 1. Set up a Privy app and authenticate users

1. Create app in Privy Dashboard (Applications page)
2. Copy `appId` and `clientId` from App Settings > Basics
3. Install client SDK: `npm install @privy-io/react-auth`
4. Wrap app with `PrivyProvider`:
   ```tsx
   <PrivyProvider appId="your-app-id" clientId="your-client-id">
     {children}
   </PrivyProvider>
   ```
5. Configure login methods in Dashboard (email, SMS, social, wallet, passkey)
6. Use `usePrivy()` hook to access `user`, `login`, `logout`, `ready` state
7. Wait for `ready === true` before consuming Privy state
8. Pass `user.id` or `idToken` to backend for verification

### 2. Create and manage embedded wallets

1. Enable embedded wallets in `PrivyProvider` config:
   ```tsx
   config={{ embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } } }}
   ```
2. Or manually create wallet with `useCreateWallet()` hook
3. Fetch wallet with `useWallets()` hook to get `address` and `chainId`
4. Store wallet address in your database linked to user ID
5. Use wallet address to query balance, transactions, or assets

### 3. Execute transactions from embedded wallets

1. Import transaction hook: `useSendTransaction` (Ethereum) or `useSignTransaction` (Solana)
2. Build unsigned transaction object with `to`, `value`, `data` fields
3. Call `sendTransaction(unsignedTx)` to prompt user to sign
4. Receive transaction hash; track status via webhooks or polling
5. For server-side signing, use server SDK with authorization key as signer

### 4. Set up policies and signers for controlled access

1. Create policy in Dashboard (Wallet infrastructure > Policies) or via API
2. Define rules: transaction limits, recipient allowlists, contract restrictions
3. Create authorization key for server-side signer (API or Dashboard)
4. Add signer to wallet with `PATCH /v1/wallets/{wallet_id}` (server SDK)
5. Attach policy to signer to scope permissions
6. Test signer can execute transactions within policy constraints

### 5. Configure webhooks for transaction tracking

1. Navigate to Dashboard > Webhooks
2. Add webhook endpoint URL (must be HTTPS)
3. Subscribe to event types: `transaction.confirmed`, `transaction.failed`, `user.created`, etc.
4. Implement webhook handler to verify signature and process events
5. Store transaction status in your database
6. Use webhook data to update UI or trigger downstream actions

### 6. Migrate existing users to Privy

1. Export user data from existing system (email, phone, user ID)
2. Use server SDK to create users: `privy.createUser({ email: 'user@example.com' })`
3. Optionally pregenerate wallets: `privy.pregenerateWallets({ userId: 'user-id' })`
4. Map old user IDs to new Privy user IDs in your database
5. Update frontend to use Privy authentication
6. Gradually migrate users or run parallel auth systems during transition

## Common gotchas

- **Privy not ready**: Always check `usePrivy().ready === true` before accessing user state or wallets. Accessing state before ready can return stale data.
- **Missing appId or clientId**: Both are required in `PrivyProvider`. Get them from Dashboard > App Settings > Basics.
- **Wallet not created**: Embedded wallets don't auto-create unless `createOnLogin` is set. Manually create with `useCreateWallet()` if needed.
- **Authorization key not configured**: Server-side signing requires an authorization key created in Dashboard or via API. Without it, server cannot sign transactions.
- **Policy not attached to signer**: Creating a policy doesn't enforce it. Attach policy to signer via `additional_signers` with `policyIds` array.
- **Webhook signature verification skipped**: Always verify webhook signature using Privy's public key. Unverified webhooks can be spoofed.
- **Rate limits on API calls**: Privy rate limits REST API endpoints. Implement exponential backoff retry logic for 429 responses.
- **Identity tokens not enabled**: Identity tokens must be enabled in Dashboard > User management > Authentication > Advanced before using them.
- **Solana peer dependencies missing**: React SDK for Solana requires `@solana/kit`, `@solana-program/memo`, etc. Install them explicitly.
- **External wallet not configured**: To use external wallets (MetaMask, Phantom), configure chains and wallets in Dashboard > Wallet infrastructure > External wallets.
- **MFA not enforced on sensitive actions**: MFA is optional. Enable in Dashboard > Authentication > Multi-factor and configure which actions require it.
- **Whitelabel login not compatible with auto-wallet creation**: Automatic wallet creation only works with Privy's default login modal, not custom whitelabel UIs.

## Verification checklist

Before submitting work with Privy:

- [ ] `PrivyProvider` wraps entire app and `ready` state is checked before consuming Privy
- [ ] `appId` and `clientId` are correct and from Dashboard > App Settings > Basics
- [ ] Login methods are configured in Dashboard and enabled in code
- [ ] Embedded wallets are created (auto or manual) and address is stored in database
- [ ] Transaction signing works end-to-end (user can sign and transaction broadcasts)
- [ ] Policies are created and attached to signers with correct `policyIds`
- [ ] Authorization keys are created for server-side signers
- [ ] Webhooks are configured with correct endpoint URL and event subscriptions
- [ ] Webhook handler verifies signature and processes events correctly
- [ ] Access tokens or identity tokens are passed to backend for user verification
- [ ] Error handling covers common cases (user not authenticated, wallet not found, policy violation)
- [ ] Rate limiting is handled with exponential backoff on 429 responses
- [ ] External wallets are configured if using MetaMask, Phantom, or other connectors
- [ ] MFA is enabled for sensitive actions if required by security policy
- [ ] User data is queried via identity token (server-side) not direct API calls when possible

## Resources

- **Comprehensive page navigation**: https://docs.privy.io/llms.txt
- **Getting started**: https://docs.privy.io/basics/get-started/about
- **Authentication overview**: https://docs.privy.io/authentication/overview
- **Wallets overview**: https://docs.privy.io/wallets/overview
- **Policies & controls**: https://docs.privy.io/controls/overview
- **REST API reference**: https://docs.privy.io/api-reference/introduction
- **Webhooks**: https://docs.privy.io/api-reference/webhooks/overview

---

> For additional documentation and navigation, see: https://docs.privy.io/llms.txt