# Astro parity record

## Baseline

Source: `TroyOwens0493/budgetTogether`, main branch at the end of October 17, 2026, America/Boise.

Commit: `6ed8acf7683457cfb1f9fc31cbfff0d85292beae`.

The `bakeoff/main` ref points to that exact commit. The `SSR` branch starts there. The backend files in `convex/`, the shared domain calculations, the specification, and all original tests are unchanged. Later Budget Together features are outside this comparison.

## Feature map

| Baseline feature | Astro implementation | Verification |
| --- | --- | --- |
| Register, sign in/out, password reset | `Auth.astro`, `scripts/app.ts`, `/api/auth/[...path].ts` | Auth proxy tests; server login/register/reset forms |
| Private-budget setup, name, time zone | `Onboarding.astro`, `Profile.astro` | Setup/profile server views; original access tests |
| Password change and session revocation | `Profile.astro`, Better Auth client | Server form; unchanged auth API |
| Private/shared selection and reporting month | `BudgetApp.astro`, request query parameters | All server views; time-zone unit test |
| Category balances, income, spending, savings, pending totals | `Overview.astro`, `Summary.astro` | Original accounting tests; rendered dashboard |
| Total/category history chart, refund bars, text table | `Overview.astro`, unchanged `spending-chart.ts` | Original chart tests; rendered report |
| Recurring suggestions, confirm/dismiss | `Overview.astro` | Original backend tests; rendered mutation controls |
| Per-user alerts and mark read | `BudgetApp.astro` | Original backend tests; rendered controls |
| Balanced monthly plans and repeat limits | `Plan.astro`, cents-only form conversion | Original plan tests; new form tests; rendered plan |
| Shared-to-personal funding | `Plan.astro` | Original allocation/access tests; rendered funding forms |
| Explicit carry-forward, repeated review | `Review.astro`, `AllocationRow.astro` | Original review tests; new form conversion tests |
| Transaction search, account/category filters, pagination | `Transactions.astro`, server query parameters | SSR filter/pagination tests; unchanged backend |
| Manual transaction create/edit/delete | `TransactionEditor.astro` | Original CRUD tests; rendered editor/actions |
| Imported notes/classification, locked bank fields | `TransactionEditor.astro` | Original bank-field tests; editor and conversion tests |
| Splits, signed refunds, pending entries | `TransactionEditor.astro`, `AllocationRow.astro` | Original accounting tests; new form tests |
| Manual/import reconciliation | `TransactionEditor.astro` | Original reconciliation tests; rendered matching form |
| Category create/edit/delete with reassignment | `Categories.astro` | Original reassignment tests; rendered revision/form |
| Bank link, reconnect, sync, disconnect | `Accounts.astro`, unchanged `plaid-link.ts` | Rendered controls; original import tests |
| Duplicate-account review | `Accounts.astro` | Original privacy/import tests; form types and rendered decisions |
| Account rename and future-only moves | `Accounts.astro` | Original move/access tests; rendered revision and warning |
| Shared creation, invitations, status, revoke, accept, leave | `Accounts.astro` | Original membership tests; rendered controls |
| Legacy contribution history and matching | `Contributions.astro` | Original contribution tests; rendered forms/actions |
| Read access after leaving; private history restrictions | Server queries use the unchanged access checks | Original access tests; rendered read-only budget |
| Live changes without page reload | Plain Convex subscriptions fetch fresh Astro HTML | Browser verification; server response tests |
| Conflicts preserve unsaved edits | Dirty forms block live replacement; all revisions are retained | Original stale-edit tests; browser verification |
| Responsive and keyboard operation | Original CSS with native links, forms, details, and labeled controls | Browser verification |

## Implementation

Every view is rendered by Astro. There are no `.tsx` files, React components, or React islands in the app. The browser script handles form events and the existing Convex APIs. It does not build the page markup. Live updates fetch a new server-rendered document and replace `#app-content` when no form has unsaved entries.

Editable records retain the revision from the server response. A live update does not replace an open form with unsaved entries. The user can load current values or submit the old revision and receive the backend conflict error. Amounts pass through the original `cents` validation before an API call.

The server exchanges the incoming auth cookie for a Convex JWT, then queries Convex with a request-local client. It sends no JWT in the HTML. Each response has private/no-store cache headers. Auth requests keep the original browser origin, response status, redirects, and all Set-Cookie headers.

Node and Netlify use official Astro adapters. The old TanStack, Nitro, React routing, and Vercel configuration have been removed from `SSR`.

## Validation and limits

Run `pnpm test`, `pnpm typecheck`, `pnpm check`, and `pnpm test:ssr`. The SSR suite builds the Node server and uses a local fixture backend. A Netlify build can be checked with `NETLIFY=true SITE_URL=https://example.com pnpm build`.

These checks establish the local implementation and API contracts. They do not establish delivery by a live email provider or connectivity to a live bank. No account data or secrets were copied from the source app. Live Convex authentication, Plaid Sandbox, Resend, and collaboration between two real users need a configured development deployment for final acceptance.

The baseline's product decisions still apply: no transaction exclusions, no activation step, shared budgets fund personal budgets, and no automatic rollover. The limitations in the README still apply.
