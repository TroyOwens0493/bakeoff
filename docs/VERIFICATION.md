# Bakeoff Three verification record

Verified on November 11, 2026 (America/Boise), using Node v26.13.0 and pnpm 12.5.1.

| Check | Result |
| --- | --- |
| `pnpm test` | 67 passing tests: domain, chart, backend in memory and SQLite, REST authentication/access, and simulated bank/email integration |
| `pnpm typecheck` | Pass |
| `pnpm check` | Pass with advisory lint warnings; no errors |
| `pnpm test:production` | Production build and HTTP asset/auth isolation test pass |
| `pnpm test:browser` | 13 passing workflow steps in headed Chromium on a separate private Xvfb display |
| Browser page errors | None reported by the suite |
| Desktop/mobile visual review | Desktop overview and all six 375px mobile views inspected; mobile transaction table scrolls inside its panel |
| `pnpm measure` | Build sizes and local duration saved to BUILD_MEASUREMENT.json |
| `git diff --check` | Pass |

Browser commands and details are in BROWSER_VERIFICATION.md. BROWSER_RESULTS.json preserves the final workflow results. The reusable browser suite, production test, and test-provider fixtures are tracked. Generated screenshots and the trace remain in ignored `output/browser/` and can be regenerated.

The server-preview save action timed out twice. Following the workspace fallback rule, the final suite used a separate headed browser on a private display. T3 Code was not moved. The final browser run required three test-harness corrections: a registration selector, a filter render wait, and opening the password section. It required no application changes. The earlier browser finding of a duplicate login form was fixed before the final suite.

## Limits of this evidence

Plaid and Resend tests simulate provider responses. The browser uses a simulated checking account and income and a mocked email sender. Live bank linking and real email delivery remain dependent on credentials and provider configuration; those credentials are not configured in the local environment. No earlier hosted app, database, or account was changed. No production bank deployment was performed.

The student still needs to add the separate manual feature, write the personal reflection, and submit the evaluation form. The prototype migration and these tests are AI-assisted work.
