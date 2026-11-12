# Bakeoff Three evaluation preparation

## Facts for the evaluation

- Architecture: client-side rendering with vanilla TypeScript and native DOM templates.
- Backend: Node.js REST API using built-in HTTP, crypto, and SQLite APIs.
- Database: SQLite on a persistent local/server disk, with schema-validated JSON records and field indexes.
- Tooling: existing Vite, TypeScript, Tailwind, and Biome. No new runtime framework, auth library, database driver, or ORM.
- Scope: all product features from `main` at `6ed8acf`; see the parity map.
- Authentication: scrypt passwords, hashed server sessions, HttpOnly same-site cookies, single-use reset links, and server-side access checks.
- Collaboration: authorized two-second polling with unsaved-entry protection. This replaces Convex subscriptions.
- Hosting: one Node process plus a writable persistent disk. The former static-only deployment configuration does not apply.
- Tests: domain and model regression tests, real SQLite tests, REST authentication/access tests, simulated provider tests, and browser checks recorded separately.
- Data: a fresh SQLite database; previous deployment users and bank connections are not migrated.

See BUILD_MEASUREMENT.json for local build duration and asset sizes. These are measurements of one local build. They do not establish runtime performance or provider latency. Compare the same tasks, device widths, data volume, and environment when assessing the earlier stacks.

## Prompts for the student's reflection

1. What was easier or harder when views used native DOM APIs instead of framework components?
2. What did you learn about REST requests, cookie sessions, SQLite transactions, and access checks?
3. Which modules made the backend change easier? Which assumptions tied the old code to its service?
4. What tradeoff did you observe between managed subscriptions and polling?
5. What additional feature did you implement yourself? Which code is yours, and where did AI provide guidance?
6. Which errors did you encounter, and how did you diagnose them?
7. Which stack would you choose for the final project, and what evidence supports the choice?

Write personal experience and ratings yourself. Do not treat AI-generated implementation as the manual feature. No personal reflection or evaluation submission is supplied here.
