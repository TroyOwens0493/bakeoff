# bakeoff

A responsive US-dollar budgeting app for individuals and couples. Each user has a private budget and can share one budget with one partner. Monthly plans allocate expected income, personal funding, and explicit carry-forward to category limits and a savings target. The app does not move money.

This repository compares two implementations of the same app:

- `main` is the exact Budget Together main-branch commit at the end of October 17, 2026, in America/Boise: `6ed8acf7683457cfb1f9fc31cbfff0d85292beae`. This commit was merged on October 13. The next main-branch change was October 24. All original files and history are retained on `main`.
- `SSR` now uses Astro 7 in **static rendering mode**, native `.astro` templates, and TypeScript browser scripts. The branch name is retained at the user's request. Every HTML page is built in advance. Convex, Better Auth, the budget rules, and the bank/email backend remain in use.

See [PARITY.md](PARITY.md) for the feature map. Course documents:

- [Implementation plan and task list](docs/IMPLEMENTATION_PLAN.md)
- [Requirements checklist](docs/COURSE_REQUIREMENTS.md)
- [Evaluation and reflection preparation](docs/EVALUATION_PREP.md)

The remaining student work is to build one additional feature, write the personal reflection, and submit the course evaluation form.

## Development

Use Node 24 or later and the pnpm version specified in package.json.

```sh
pnpm install
cp .env.example .env.local
pnpm exec convex dev
```

Sign in to the existing Convex **development** project. Keep `convex dev` running to generate types and sync backend changes. Set `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` in `.env.local` to the development deployment's `.cloud` and `.site` addresses. Do not use a production deployment for this branch.

Set the variables described in `.env.example` on that Convex development deployment. `SITE_URL` is the app origin, usually `http://localhost:3000`. Generate a random Better Auth secret and a base64 key containing 32 random bytes for Plaid token encryption. Keep secrets in deployment environment variables. The two `VITE_CONVEX_*` values are public backend addresses. They must not contain secrets. Astro passes the public Convex address to its browser script.

```sh
pnpm dev
```

Open http://localhost:3000. Local authentication also accepts http://127.0.0.1:3000 and http://[::1]:3000 on the same port. Create an account and private budget. Connect a bank, add a monthly plan, and optionally create a shared budget and invite a partner.

`pnpm dev` stops with an error if port `3000` is already in use. It does not switch to a different port. If the app is already running, use that server.

If your SSH tunnel or a second development server uses a different browser address or port, set `AUTH_TRUSTED_ORIGINS` on the same Convex development deployment. This is a comma-separated list of extra addresses. For example, to accept http://localhost:3001 as well as http://localhost:3000:

```sh
pnpm exec convex env set AUTH_TRUSTED_ORIGINS 'http://localhost:3001'
pnpm exec convex dev --once
```

Use the address shown in the browser, including its protocol and port. Each configured loopback address also accepts `localhost`, `127.0.0.1`, and `[::1]` with the same protocol and port. Other addresses must be listed explicitly. Hosted deployments accept only `SITE_URL` and any explicitly configured extra origins. Put this setting on Convex; `.env.local` alone does not configure backend authentication.

## Static rendering and deployment

`astro.config.mjs` uses `output: "static"`. `pnpm build` creates `dist/index.html`, `dist/404.html`, and bundled assets. There is no Astro page server or SSR adapter. Every visitor receives the same public HTML, with forms and reusable native HTML templates. The build does not query Convex or include private budget records.

After the page loads, `src/scripts/app.ts` reads the session and uses the authenticated Convex browser client. `src/lib/load-budget.ts` selects the queries for the current view. `src/lib/render.ts` clones the built templates and fills text, inputs, and rows through DOM APIs. Record text is never inserted as executable HTML. Live subscriptions refresh clean views. Unsaved forms keep their entries and revisions and show **Load current values**.

Authentication uses the small API function `netlify/functions/auth.mts`. It forwards `/api/auth/*` to Better Auth on Convex and preserves cookies, origin, status, and redirects. It returns auth data, not rendered pages. The development server supplies the same API route through `server/dev-auth.ts`.

```sh
pnpm build
pnpm test:static
```

Netlify serves `dist` and deploys the auth function. `netlify.toml` sets the build command, public directory, Node 24, and functions directory. Set `VITE_CONVEX_URL` at build time for the browser, and `VITE_CONVEX_URL` plus `VITE_CONVEX_SITE_URL` in the function environment. These are public deployment addresses. Keep Plaid, Resend, and Better Auth secrets on Convex.

`pnpm preview` and `pnpm start` serve only the generated static files. Use `pnpm dev` for local auth, or Netlify CLI for a production-style local preview with functions. JavaScript is required for authentication and private budget data.

The live Astro app is https://bakeoff-troyowens.netlify.app. Netlify is linked to `TroyOwens0493/bakeoff` and builds the `SSR` branch on each push. Its dashboard is https://app.netlify.com/projects/bakeoff-troyowens.

The app uses its own Convex development deployment, `notable-meadowlark-550`, in the `troyteancum/bakeoff` project. Its public endpoints are `https://notable-meadowlark-550.convex.cloud` and `https://notable-meadowlark-550.convex.site`. The database starts empty. Create a new account on this site.

The backend has fresh Better Auth and bank-token encryption keys. Plaid Sandbox credentials are configured. Email delivery needs `RESEND_API_KEY` and `RESEND_FROM` on this deployment; those values were not configured in the source project. Password reset and invitation emails will not be delivered until they are set.

## Bank connectivity and email

This branch uses **Plaid Sandbox only**. It loads Plaid Link from Plaid's hosted script, exchanges public tokens on the backend, encrypts access tokens with AES-GCM, and imports Transactions through the cursor-based sync API. Only checking, savings, and credit card accounts are supported. Sandbox test credentials are documented at https://plaid.com/docs/sandbox/test-credentials/.

The bank event endpoint is `https://<development-deployment>.convex.site/bank-events`. Requests require Plaid's ES256 signature, a recent timestamp, and a matching SHA-256 request-body hash. Bank events trigger imports. A six-hour scheduled job retries active connections. Sync errors retain imported history, show the last successful import, and provide reconnect controls. Disconnecting removes the Plaid Item and retains app history.

Resend sends partner invitations and password reset emails. Configure a verified sender domain and `RESEND_FROM`. Invitation delivery status appears in account settings; a failed invitation can be revoked and replaced. Invitations expire after seven days, require the recipient's email address, and become membership only after acceptance. Reset links use Better Auth's expiration and single-use token handling.

## Agreed product choices

- Shared budgets are called **Shared**. Users do not choose a name. Existing shared budgets also appear as **Shared**.
- Bank accounts start private. Account moves apply to transactions dated from the move date onward. Previously imported records stay in their original budget; earlier private history is never shared.
- A departing partner's accounts return to their private budget. The remaining partner keeps the shared budget active. The departing partner can read records shared before the departure and cannot edit that budget or read later transactions.
- **Shared budgets fund personal budgets**, overriding the contribution direction in the PDF. All planned income goes into the shared monthly plan. Each partner receives a monthly personal allocation from that plan. The allocation reduces shared funding and adds the same amount to personal funding at once; no bank transfer is needed. Both partners can see and edit the amounts, while personal categories, spending, and transactions stay private. Income recorded in a member's personal accounts counts in shared income totals without exposing private entries. This rule starts in the month the member joins; earlier months retain their prior accounting. Existing contribution records stay readable for historical totals.
- **Exclusion was removed at the user's request**, overriding that feature in the PDF. Duplicate manual entries can be reconciled with bank imports instead.
- **Draft and activation steps were removed at the user's request**, overriding those steps in the PDF. Users finish a monthly budget and choose **Save budget**. Every save requires a zero balance. A personal allocation change requires both affected budgets to be balanced and saved again.
- New months start with prior limits for the user to check and save. Monthly review explicitly adds carry-forward to next month's categories or savings target. Repeated reviews replace existing reservations and adjust the destination budget by the difference, including an already saved budget; they do not change historical savings results. Existing records with the former draft/active field stay readable and move to the new saved field when updated.

## API and modules

The PDF's API paths describe conceptual operations. This implementation uses authenticated Convex queries, mutations, and actions. The browser subscribes to queries for shared updates without a page refresh.

`convex/budgets.ts` defines the budget API arguments and connects each operation to a plain TypeScript function in `convex/model/`. These model functions contain access checks, validation, and database operations. They use the caller's Convex context, so each mutation remains one database transaction.

| Budget model | Responsibility |
| --- | --- |
| `spaces.ts` | Profile setup, private-budget creation, and the user's budget list |
| `categories.ts` | Category lists, edits, and deletion with reassignment |
| `accounting.ts` | Planned and actual funding, carry-forward funding, and monthly results |
| `plans.ts` | Monthly plan saves, repetition, initial creation, and reviews |
| `transactions.ts` | Transaction search, edits, deletion, splits, and reconciliation |
| `reporting.ts` | Dashboard data and historical reports |
| `insights.ts` | Recurring-charge suggestions, alerts, and per-user alert read state |

The model modules do not register Convex API functions. `src/domain/budget.ts` contains the budget calculations that the browser and server share. Add reusable budget operations to the model modules and keep the API definitions small.

| Module | Operations |
| --- | --- |
| `auth` and `/api/auth/*` | Registration, sign-in/out, password reset, profile and password changes through Better Auth |
| `budgets` | Setup, dashboard, category CRUD and reassignment, budget save/repeat, transaction search/pagination/CRUD/splits, reconciliation, monthly review, reports, recurring suggestions, alerts |
| `accounts` | Authorized account lists, names, assignment moves, connection status |
| `sharing` | Shared-budget creation, email invitations, acceptance, revocation, leave |
| `personalAllocations` | Shared-to-personal monthly funding amounts; both partners can edit |
| `contributions` | Legacy funding and bank matches for historical months |
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
pnpm test:static
```

Tests use Node's built-in test runner. Accounting tests cover cents, balance, refunds, transfers, pending entries, splits, carry-forward, and recurring estimates. Backend tests exercise the actual query/mutation handlers against an in-memory database with stubbed authentication. They check direct private access, stale edits, repeated reviews, account moves, departure cutoffs, contribution matches, and import idempotency. They do not replace live Convex, Plaid, or Resend integration tests.

## Current verification limits

The original 40 domain and backend tests are retained. New tests cover form conversion, auth forwarding, browser query selection, and budget isolation. The static-output suite checks prebuilt pages, equal HTML for visitors with different cookies, built forms and templates, the 404 page, and the absence of an Astro page server. Browser tests cover the interactive forms and live updates. These checks do not replace live bank, email, and two-user acceptance tests.

The live site has a separate Convex development deployment. The backend code was deployed from this branch. The original project's account and budget records were not copied. Each app has its own authentication and encryption keys. Bank connectivity uses Sandbox; this site is not configured for live bank imports.

Persistent Plaid account identifiers prevent duplicate connections where Plaid provides them. When no persistent ID is available, a match on bank, account type, and last four digits pauses the new connection. The user must identify it as the same account (keep the existing import) or a different account (import it). This check includes the current partner's accounts without returning their private account details. Imports, webhooks, and scheduled sync cannot bypass a pending review.

Transaction pages return a bounded page, but their backend filtering currently reads the selected month's records. Very large monthly histories and initial Plaid import batches will need bounded server queries and chunked sync staging before production use. Recurring suggestions estimate monthly charges from three similar posted entries; estimates are not bill reminders. This branch is not configured for Plaid Production.

## Project workflow

The Astro implementation is on `SSR`. Keep `main` at the baseline commit for comparison. Team membership and project tracking are not yet configured in this repo. Add confirmed team members, sprint goals, and retrospective notes when the team and tracking tool are chosen. Future work includes live acceptance testing, production bank rollout, and larger-history query/import scaling. Investment tracking, payments, groups larger than two, non-US banks, other currencies, reminders, offline support, and subscription billing remain outside scope.
