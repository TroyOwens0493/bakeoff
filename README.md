# Budget Together

A responsive US-dollar budgeting app for individuals and couples. Each user has a private budget and can share one budget with one partner. Monthly plans allocate expected income, contributions, and explicit carry-forward to category limits and a savings target. The app does not move money.

The project uses the existing React, TanStack Start, Tailwind CSS, Convex, Better Auth, Lucide, and Biome stack. The additional `@convex-dev/better-auth` component stores authentication in Convex. Plaid and Resend use their HTTP APIs without additional SDK packages.

## Development

Use Node 24 or later and the pnpm version specified in package.json.

```sh
pnpm install
cp .env.example .env.local
pnpm exec convex dev
```

Sign in to the existing Convex **development** project. Keep `convex dev` running to generate types and sync backend changes. Set `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` in `.env.local` to the development deployment's `.cloud` and `.site` addresses. Do not use a production deployment for this branch.

Set the variables described in `.env.example` on that Convex development deployment. `SITE_URL` is the app origin, usually `http://localhost:3000`. Generate a random Better Auth secret and a base64 key containing 32 random bytes for Plaid token encryption. Keep secrets in deployment environment variables. Browser variables start with `VITE_` and must not contain secrets.

```sh
pnpm dev
```

Open http://localhost:3000. Create an account and private budget. Connect a bank, add a monthly plan, and optionally create a shared budget and invite a partner.

## Bank connectivity and email

This branch uses **Plaid Sandbox only**. It loads Plaid Link from Plaid's hosted script, exchanges public tokens on the backend, encrypts access tokens with AES-GCM, and imports Transactions through the cursor-based sync API. Only checking, savings, and credit card accounts are supported. Sandbox test credentials are documented at https://plaid.com/docs/sandbox/test-credentials/.

The bank event endpoint is `https://<development-deployment>.convex.site/bank-events`. Requests require Plaid's ES256 signature, a recent timestamp, and a matching SHA-256 request-body hash. Bank events trigger imports. A six-hour scheduled job retries active connections. Sync errors retain imported history, show the last successful import, and provide reconnect controls. Disconnecting removes the Plaid Item and retains app history.

Resend sends partner invitations and password reset emails. Configure a verified sender domain and `RESEND_FROM`. Invitation delivery status appears in account settings; a failed invitation can be revoked and replaced. Invitations expire after seven days, require the recipient's email address, and become membership only after acceptance. Reset links use Better Auth's expiration and single-use token handling.

## Agreed product choices

- Bank accounts start private. Account moves apply to transactions dated from the move date onward. Previously imported records stay in their original budget; earlier private history is never shared.
- A departing partner's accounts return to their private budget. The remaining partner keeps the shared budget active. The departing partner can read records shared before the departure and cannot edit that budget or read later transactions.
- The app suggests equal and opposite posted bank entries for a shared contribution. The user confirms the match. Contributions affect private and shared funding equally and do not count as earned income.
- **Exclusion was removed at the user's request**, overriding that feature in the PDF. Duplicate manual entries can be reconciled with bank imports instead.
- Draft plans can be incomplete. Activation and changes to active plans require a zero balance. Changing planned contributions requires both affected plans to be drafts.
- New monthly drafts repeat prior limits. Monthly review explicitly adds carry-forward to next month's categories or savings target. Repeated reviews replace existing reservations and adjust the destination draft by the difference; they do not change historical savings results.

## API and modules

The PDF's API paths describe conceptual operations. This implementation uses authenticated Convex queries, mutations, and actions. The browser subscribes to queries for shared updates without a page refresh.

| Module | Operations |
| --- | --- |
| `auth` and `/api/auth/*` | Registration, sign-in/out, password reset, profile and password changes through Better Auth |
| `budgets` | Setup, dashboard, category CRUD and reassignment, plan save/activation/draft/repeat, transaction search/pagination/CRUD/splits, reconciliation, monthly review, reports, recurring suggestions, alerts |
| `accounts` | Authorized account lists, manual accounts, names, assignment moves, connection status |
| `sharing` | Shared-budget creation, email invitations, acceptance, revocation, leave |
| `contributions` | Planned funding, proposed bank matches, confirmation, removal |
| `bank` | Link/update sessions, public-token exchange, sync, disconnect, internal imports |
| `/bank-events` | Verified Plaid bank events |

All money is stored as integer cents. Imported amounts use positive values for purchases/outflows and negative values for income/refunds. Refunds reduce spending. Pending entries are shown separately; posted entries replace pending ones without double counting. Transfers and credit card payments are omitted from income and spending. Splits must equal the transaction amount and use categories in the same budget.

Private access is checked in backend requests as well as UI controls. Mutations use revision numbers to reject outdated edits. The UI reports the conflict; reopening the editor loads current values. Categories can be deleted only with a replacement category. Bank entries retain bank-controlled amounts/dates; only manual entries can be deleted.

## Validation

```sh
pnpm test
pnpm typecheck
pnpm check
pnpm build
```

Tests use Node's built-in test runner. Accounting tests cover cents, balance, refunds, transfers, pending entries, splits, carry-forward, and recurring estimates. Backend tests exercise the actual query/mutation handlers against an in-memory database with stubbed authentication. They check direct private access, stale edits, repeated reviews, account moves, departure cutoffs, contribution matches, and import idempotency. They do not replace live Convex, Plaid, or Resend integration tests.

## Current verification limits

The implementation was developed without an authenticated Convex CLI session. API declarations were prepared locally and **must be regenerated with `pnpm exec convex dev`** once sign-in is available. The backend component has not yet been deployed or validated against a live Convex development deployment. Registration, reset emails, partner emails, Plaid Link/imports, and two-browser collaboration need live integration testing after configuration.

Persistent Plaid account identifiers prevent duplicate connections where Plaid provides them. When no persistent ID is available, a match on bank, account type, and last four digits pauses the new connection. The user must identify it as the same account (keep the existing import) or a different account (import it). This check includes the current partner's accounts without returning their private account details. Imports, webhooks, and scheduled sync cannot bypass a pending review.

Transaction pages return a bounded page, but their backend filtering currently reads the selected month's records. Very large monthly histories and initial Plaid import batches will need bounded server queries and chunked sync staging before production use. Recurring suggestions estimate monthly charges from three similar posted entries; estimates are not bill reminders. This branch is not configured for Plaid Production.

## Project workflow

Work is on the `dev` branch. Team membership and project tracking are not yet configured in this repo. Add confirmed team members, sprint goals, and retrospective notes when the team and tracking tool are chosen. Future work includes live acceptance testing, production bank rollout, and larger-history query/import scaling. Investment tracking, payments, groups larger than two, non-US banks, other currencies, reminders, offline support, and subscription billing remain outside scope.
