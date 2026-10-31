# Astro parity record

## Baseline

Source: `TroyOwens0493/budgetTogether`, main branch at the end of October 17, 2026, America/Boise.

Commit: `6ed8acf7683457cfb1f9fc31cbfff0d85292beae`.

The `bakeoff/main` ref points to that exact commit. The `SSR` branch starts there. The backend files in `convex/`, the shared domain calculations, the specification, and all original tests are unchanged. Later Budget Together features are outside this comparison.

## Feature map

| Baseline feature | Astro implementation | Verification |
| --- | --- | --- |
| Register, sign in/out, password reset | `Auth.astro`, `scripts/app.ts`, `netlify/functions/auth.mts` | Auth proxy tests; static login/register/reset templates |
| Private-budget setup, name, time zone | `Onboarding.astro`, `Profile.astro` | Setup/profile templates; original access tests |
| Password change and session revocation | `Profile.astro`, Better Auth client | Static form; unchanged auth API |
| Private/shared selection and reporting month | `BudgetApp.astro`, request query parameters | Browser views; time-zone unit test |
| Category balances, income, spending, savings, pending totals | `Overview.astro`, `Summary.astro` | Original accounting tests; rendered dashboard |
| Total/category history chart, refund bars, text table | `Overview.astro`, unchanged `spending-chart.ts` | Original chart tests; rendered report |
| Recurring suggestions, confirm/dismiss | `Overview.astro` | Original backend tests; rendered mutation controls |
| Per-user alerts and mark read | `BudgetApp.astro` | Original backend tests; rendered controls |
| Balanced monthly plans and repeat limits | `Plan.astro`, cents-only form conversion | Original plan tests; new form tests; rendered plan |
| Shared-to-personal funding | `Plan.astro` | Original allocation/access tests; rendered funding forms |
| Explicit carry-forward, repeated review | `Review.astro`, `AllocationRow.astro` | Original review tests; new form conversion tests |
| Transaction search, account/category filters, pagination | `Transactions.astro`, server query parameters | Browser filter/pagination tests; unchanged backend |
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
| Read access after leaving; private history restrictions | Convex queries use the unchanged access checks | Original access tests; rendered read-only budget |
| Live changes without page reload | Plain Convex subscriptions update cloned static templates | Browser verification; static-output tests |
| Conflicts preserve unsaved edits | Dirty forms block live replacement; all revisions are retained | Original stale-edit tests; browser verification |
| Responsive and keyboard operation | Original CSS with native links, forms, details, and labeled controls | Browser verification |

## Implementation

Astro builds all public HTML and native templates in advance. There are no `.tsx` files, React components, React islands, or request-time HTML rendering. The browser reads the session, queries Convex, clones templates, and fills them through DOM APIs. It does not request a page server for budget views.

Editable records keep the revision from the browser's authenticated query. Live updates preserve dirty forms. The user can load current values or submit the old revision and receive a conflict error. All money fields use the original `cents` conversion.

A standalone Netlify API function forwards auth requests to Convex. It preserves cookies and returns auth data only. Private records and tokens never enter the static HTML. The browser's Convex connection enforces the unchanged backend access rules.

Both SSR adapters are removed. The name `SSR` is retained at the user's request; the architecture on that branch is now static.

## Validation and limits

Run `pnpm test`, `pnpm typecheck`, `pnpm check`, and `pnpm test:static`. The static-output suite verifies the built artifact. Browser checks use the fixture backend for full form coverage, followed by live authentication checks.

These checks establish the local implementation and API contracts. They do not establish delivery by a live email provider or connectivity to a live bank. The hosted app uses the separate `troyteancum/bakeoff` Convex development deployment. No account or budget data was copied. Authentication and encryption keys are new; the existing Plaid Sandbox credentials were reused. Live email delivery and collaboration between two real users still need acceptance testing. Resend credentials are not configured.

The baseline's product decisions still apply: no transaction exclusions, no activation step, shared budgets fund personal budgets, and no automatic rollover. The limitations in the README still apply.
