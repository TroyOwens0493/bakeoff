# Budget Together - Bakeoff Three

A client-rendered budgeting prototype for individuals and couples. Work is on `bakeoff-3`, created from `main` at `6ed8acf`. It keeps the product features of that baseline and uses a different backend and database. The earlier implementations remain in Git history on `main` and `SSR`.

The browser uses vanilla TypeScript and native HTML templates. A Node.js HTTP server exposes a REST API. SQLite stores accounts, budgets, authentication, and background jobs. Vite builds the browser assets; the existing Tailwind build supplies styles. React, TanStack, Astro, Convex, and Better Auth are removed. No new runtime package was added.

## Run locally

Use Node 24 or later and pnpm 12.5.1. The development server uses port 3003 and stops if that port is in use.

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3003. Register and create your private budget. This branch starts with a new SQLite database. It does not copy users, sessions, budgets, or bank connections from the earlier deployments.

The Node server reads `.env.local` directly. Set `SITE_URL` to the exact browser origin, and `PORT` to its local port. Loopback aliases on the same port are accepted. `AUTH_TRUSTED_ORIGINS` can add explicit origins for a tunnel. Secrets stay on the server; there are no `VITE_` secrets or browser backend tokens.

For a production build:

```sh
pnpm build
pnpm start
```

The same Node server serves `dist` and the API. Deploy as one Node process with a persistent writable disk for `DATABASE_PATH`. Use HTTPS and set `SITE_URL` to that HTTPS origin. A static-only Netlify deployment cannot run this backend. This branch does not change either earlier hosted site. Back up the SQLite database, its WAL during a live backup, and the bank encryption key together. Stop the process before copying the database, or use SQLite's backup tooling.

## Features

- Registration, login, logout, profile updates, password changes, and single-use password resets.
- Private budgets and shared budgets with at most two active members, accepted email invitations, equal partner control, departure cutoffs, and private account history.
- Category CRUD with reassignment on deletion; monthly zero-balance plans, repeated limits, shared-to-personal funding, and legacy contribution records.
- Manual transaction CRUD, search, account/category filters, pagination, notes, recategorization, splits, refunds, and reconciliation with bank imports.
- Plaid Sandbox bank linking, duplicate-account review, encrypted tokens, cursor-based imports, pending replacement, signed bank events, retry, reconnect, and disconnect with history retention.
- Dashboard balances, category alerts with per-user read state, recurring-charge suggestions, spending charts, historical reports, and explicit monthly carry-forward.
- Responsive labeled controls, client navigation, loading/retry states, stale-edit rejection, and protection for unsaved forms.

Shared changes appear through authenticated query polling every two seconds. Polling compares query results and refreshes clean views. A dirty form retains its values and revision and offers **Load current values**.

## Bank and email setup

Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_TOKEN_ENCRYPTION_KEY` in `.env.local` or the Node process environment. The key must decode to 32 bytes. Use Sandbox credentials. Bank calls use Plaid's HTTP API without an SDK. Configure an approved `PLAID_REDIRECT_URI` if the selected bank needs OAuth. The public bank event address is `${SITE_URL}/bank-events`; a local-only address cannot receive provider callbacks. Manual sync still works locally.

Set `RESEND_API_KEY` and a verified `RESEND_FROM` sender for invitations and password resets. Missing email configuration does not prevent registration or login. Invitation delivery failures appear in account settings. Password reset requests always show the same public response to avoid disclosing accounts. Check the server log for delivery failures. Tests use simulated provider responses and do not prove delivery through a live bank or email account.

The background worker checks persisted jobs each second and schedules bank refreshes at startup and every six hours. Jobs survive process restarts. Failed jobs retry up to five times with a one-minute delay; their last error stays in SQLite. Imports also retain a visible connection status. Run one server process for this prototype; a distributed job lease is outside scope.

## Agreed product choices

- Shared budgets are called **Shared**. Users do not choose a name. Existing shared budgets also appear as **Shared**.
- Bank accounts start private. Account moves apply to transactions dated from the move date onward. Previously imported records stay in their original budget; earlier private history is never shared.
- A departing partner's accounts return to their private budget. The remaining partner keeps the shared budget active. The departing partner can read records shared before the departure and cannot edit that budget or read later transactions.
- **Shared budgets fund personal budgets**, overriding the contribution direction in the PDF. All planned income goes into the shared monthly plan. Each partner receives a monthly personal allocation from that plan. The allocation reduces shared funding and adds the same amount to personal funding at once; no bank transfer is needed. Both partners can see and edit the amounts, while personal categories, spending, and transactions stay private. Income recorded in a member's personal accounts counts in shared income totals without exposing private entries. This rule starts in the month the member joins; earlier months retain their prior accounting. Existing contribution records stay readable for historical totals.
- **Exclusion was removed at the user's request**, overriding that feature in the PDF. Duplicate manual entries can be reconciled with bank imports instead.
- **Draft and activation steps were removed at the user's request**, overriding those steps in the PDF. Users finish a monthly budget and choose **Save budget**. Every save requires a zero balance. A personal allocation change requires both affected budgets to be balanced and saved again.
- New months start with prior limits for the user to check and save. Monthly review explicitly adds carry-forward to next month's categories or savings target. Repeated reviews replace existing reservations and adjust the destination budget by the difference, including an already saved budget; they do not change historical savings results. Existing records with the former draft/active field stay readable and move to the new saved field when updated.


## Code and API

| Module | Responsibility |
| --- | --- |
| `src/scripts/app.ts` | Browser navigation, forms, live refresh, and bank-link controls |
| `src/lib/render.ts`, `templates.ts`, `src/templates.html` | Native templates and safe DOM binding; record text is never executable HTML |
| `src/shared/routes.ts` | Public REST route contract shared by browser and server |
| `server/index.ts` | HTTP routing, request limits, origin checks, API responses, and asset serving |
| `server/auth.ts` | Scrypt passwords, hashed cookie sessions, resets, and rate limits |
| `server/runtime.ts` | Validated operation dispatch, serialized transactions, and persisted jobs |
| `server/store.ts`, `features/schema.ts` | SQLite tables, JSON records, indexes, and storage validation |
| `server/features/model/` | Reusable access, accounting, plan, category, transaction, report, and insight rules |
| `server/features/` | Account moves, sharing, partner funding, bank imports, and email |
| `src/domain/budget.ts` | Pure integer-cent calculations used by browser and server |

See `src/shared/routes.ts` for all public methods and paths. GET routes accept named query parameters. Other routes accept a JSON body. For example, `GET /api/dashboard?spaceId=spaces:...&month=2026-11` reads a budget; `PUT /api/monthly-plan` saves a balanced plan. Auth routes are `/api/auth/register`, `/login`, `/logout`, `/session`, `/update-user`, `/change-password`, `/request-password-reset`, and `/reset-password` under the same prefix. All private routes use the same-origin session cookie. Internal import and delivery operations have no public route.

Every write validates its arguments and checks budget access in the domain module. Each mutation runs in a SQLite transaction; failed mutations roll back. Revisions reject stale writes. Queries also run through the serialized database boundary. Provider actions run outside database transactions and call small transactional operations for state changes. SQLite records use schema-validated JSON with indexed fields. This preserves the existing model boundaries without a new ORM.

## Verify and evaluate

```sh
pnpm test
pnpm typecheck
pnpm check
pnpm test:production
pnpm measure
```

For browser tests, use `pnpm test:browser` with an existing Playwright installation. The complete command is in [docs/BROWSER_VERIFICATION.md](docs/BROWSER_VERIFICATION.md). The test runner owns a separate server and database and uses simulated provider data. Playwright is test tooling supplied by the host, not an added app dependency.

The backend regression suite runs the same assertions with an in-memory fixture and real SQLite. REST tests cover authentication, validation, access rejection, password changes, invitation acceptance, password reset, and stored data. Provider tests simulate Plaid and Resend, including signed events, import idempotency, retained history after sync failure, and import jobs after reopening the database.

Course documents are in `docs/`: the implementation plan, requirement checklist, parity map, evaluation preparation, verification record, and build measurements. The student will add a separate manually implemented feature after this migration, write the reflection, and submit the evaluation form.

## Prototype limits

Bank and email integrations require server credentials and provider configuration. No production bank rollout is included. Transactions are paginated in the UI, but backend filtering still reads the selected month's records. Initial imports accumulate a provider batch before applying it. Large histories need bounded queries and chunked imports. Synchronous SQLite and serialized access suit this single-process prototype; they are not a load-tested production design. Sessions expire after seven days; reset links expire after one hour. Expired session/reset rows are rejected on use but are not yet pruned on a schedule.

Investment tracking, payments, groups larger than two, non-US banks, other currencies, reminders, offline use, and subscription billing remain outside scope.
