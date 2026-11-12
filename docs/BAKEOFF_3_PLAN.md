# Bakeoff Three implementation plan

## Decisions

The student selected vanilla TypeScript in the browser, a Node.js REST API, and SQLite. The branch is `bakeoff-3`, created from `main` at `6ed8acf7683457cfb1f9fc31cbfff0d85292beae`. Keep all current features from that baseline. The tracked PDF remains the specification, with the agreed product changes in README taking precedence.

The student will add a separate feature after the migration is complete. No baseline feature is withheld for manual work. AI implementation, including this migration, does not count as that student feature. The reflection and evaluation form also remain student work.

## Research and starting guides

- Follow the [TypeScript DOM manipulation guide](https://www.typescriptlang.org/docs/handbook/dom-manipulation.html) to create typed controls and update the document.
- Use the [Node HTTP guide](https://nodejs.org/en/learn/modules/anatomy-of-an-http-transaction) to trace requests, headers, bodies, and responses.
- Use the [Node SQLite example](https://nodejs.org/api/sqlite.html) to open a database, execute parameterized SQL, and read results.
- Use the [Node crypto API](https://nodejs.org/api/crypto.html) for scrypt, random session tokens, timing-safe comparisons, and Web Crypto bank verification.
- Retain the [Plaid Transactions sync guide](https://plaid.com/docs/transactions/sync-migration/) for cursor imports and the [Resend HTTP API](https://resend.com/docs/api-reference/emails/send-email) for delivery.

The first round uses React and request-time rendering. The second round uses Astro static pages. Both use Convex. This round starts with an empty HTML shell, creates views in the browser, and uses a traditional stateful REST server with SQLite. A build can run without a database or provider credentials.

## Module design

The browser owns navigation, form state, templates, and data loading. The REST route map is a thin shared interface. The server separates HTTP, authentication, transactional execution, storage, background jobs, and provider IO. The existing domain modules retain private access, accounting, and revision checks. SQL uses bound parameters. No ORM, auth SDK, UI framework, or new runtime package is added.

## Task list

- [x] Create the branch from `main` and keep the specification.
- [x] Confirm the stack, full baseline scope, and separate student feature.
- [x] Port reusable native HTML templates and DOM rendering to a vanilla Vite client.
- [x] Remove React, TanStack, Astro, Convex, and Better Auth runtime dependencies.
- [x] Define the REST route contract for all public baseline operations.
- [x] Implement SQLite records, indexed fields, schema validation, and transactional rollback.
- [x] Implement local registration, login/logout, hashed sessions, profile/password changes, and single-use password resets.
- [x] Port private/shared access, invitations, account moves, and departure cutoffs.
- [x] Port categories, monthly plans, partner funding, transactions, splits, reconciliation, and carry-forward.
- [x] Port dashboards, reports/charts, alerts, recurring decisions, and legacy contributions.
- [x] Port encrypted Plaid Sandbox connections, signed bank events, idempotent sync, reconnect/disconnect, and persisted jobs.
- [x] Preserve labeled controls, responsive CSS, loading/errors, revisions, and unsaved form protection.
- [x] Run backend regression checks against both memory fixtures and SQLite.
- [x] Add HTTP authentication/access tests and simulated provider integration tests.
- [x] Complete browser workflow verification and record results.
- [x] Record final build measurements and known limits.
- [ ] Student: implement an additional feature with AI in a guidance role.
- [ ] Student: write the personal reflection and submit the evaluation form.

## Acceptance

The prototype must retain the baseline feature map in PARITY.md, reject unbalanced plans and unauthorized private requests, retain data after opening the database again, avoid duplicate bank imports and carry-forward, and work at mobile and desktop widths. Record live-provider limits separately from simulated-provider results. Do not claim that AI performed the student feature or wrote the student's experience.
