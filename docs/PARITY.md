# Baseline feature parity

Baseline: `main` at `6ed8acf`. Scope is all current features, including the agreed changes to the PDF. Existing deployments and their records stay separate.

| Baseline area | New implementation | Verification |
| --- | --- | --- |
| Sign-up, login/logout, profile/password | `server/auth.ts`, browser auth/profile templates | REST tests; browser auth/profile checks |
| Reset password | Hashed expiring single-use reset token; Resend HTTP email | REST test with simulated delivery, session revocation |
| Private budget and onboarding | `features/model/spaces.ts`, onboarding template | SQLite regression and browser checks |
| Shared creation, invitation acceptance/revocation, leave | `features/sharing.ts`, account settings | REST invitation acceptance; SQLite access/departure regressions |
| Accounts, future moves, retained history | `features/accounts.ts`, account settings | SQLite account move/departure checks |
| Category CRUD/reassignment | `features/model/categories.ts`, category editor | SQLite CRUD/reassignment checks |
| Monthly zero-balance plan/save/repeat | `features/model/plans.ts`, monthly budget view | SQLite balance/revision checks; browser save |
| Shared-to-personal allocations | `features/personalAllocations.ts`, shared plan view | SQLite paired funding, privacy, conflict tests |
| Legacy contributions and matches | `features/contributions.ts`, contribution panel | SQLite legacy accounting tests |
| Manual transaction CRUD, classification, splits, notes | `features/model/transactions.ts`, editor | SQLite CRUD, split, refund, reconciliation checks |
| Search, filters, pagination | Monthly transaction list and REST query parameters | Retained pagination logic; Playwright search/account/category filters pass |
| Bank link, duplicate review, sync/reconnect/disconnect | `features/bank.ts`, Plaid Link browser controls | Simulated provider integration; SQLite dedupe checks |
| Pending replacement and idempotent imports | Cursor checks and import transaction | SQLite import checks; simulated provider sync |
| Signed bank events | `/bank-events`, ES256 and body hash verification | Valid/tampered/expired signature tests |
| Six-hour sync and persisted jobs | Node worker plus SQLite job table | Import job survives database reopen in provider test |
| Dashboard, alerts/read state, recurring decisions | Reporting and insight modules; overview | Domain/SQLite checks |
| Historical spending charts | `spending-chart.ts`, browser SVG/DOM | Chart unit checks and retained frontend |
| Monthly review and explicit carry-forward | Plan model, review form | Repeated review and correction regression checks |
| Shared changes without page reload | Authenticated two-second query polling | Playwright update and unsaved-form retention checks pass |
| Responsive UI, errors, unsaved forms | Native controls, reused CSS, client state | All six views checked at 375px; screenshots inspected; keyboard login passes |

Automatic imports require Plaid Sandbox credentials. Invitation/reset delivery requires Resend credentials and a verified sender. These connections are implemented and simulated in tests; this record does not claim a live provider acceptance test. The prototype starts with a new SQLite database.
