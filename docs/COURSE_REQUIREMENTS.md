# WDD 430 Bakeoff Round Two checklist

## Current status

The technical implementation targets the course's **static rendering** architecture. Work is on `SSR`, as requested. The branch name does not describe its current rendering mode. `main` remains the October 17 baseline.

| Course requirement | Evidence | Status |
| --- | --- | --- |
| Explore a different architecture | Astro static HTML replaces request-time page rendering | Implemented |
| Use an allowed framework in static mode | `astro.config.mjs`: `output: "static"`; both SSR adapters removed | Implemented |
| Use a database of choice | Separate Convex project and authenticated browser queries | Implemented |
| Sign up, log in, log out | Native Astro auth templates, browser script, Better Auth API | Implemented; live registration, login, logout, and persistence checks passed |
| Core project feature | Balanced budgets, category management, transactions, and monthly review | Implemented; original backend checks retained |
| Responsive desktop and mobile UI | Original responsive CSS, native labeled controls | Fixture browser checks passed |
| Basic error handling and validation | Loading/retry states, integer cents, zero-balance checks, backend access/revision validation | Implemented and unit tested |
| Research a guide | Official Astro tutorial and documentation links in the plan | Complete |
| Branch from `main` | `SSR` descends from `main`; specification PDF is tracked | Complete |
| Detailed prototype plan and task list | `IMPLEMENTATION_PLAN.md` | Complete |
| Learn measurement and comparison | `pnpm measure`, `BUILD_MEASUREMENT.json`, evaluation preparation | Tooling provided; student comparison/reflection remains |
| Student builds one feature with AI in a guidance role | Optional read-only Framework Student agent | **Student action required** |
| Evaluation form and reflection | `EVALUATION_PREP.md` supplies facts and prompts | **Student action required** |

## Release checks

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm check` (report existing advisory warnings separately from errors)
- [x] `pnpm test:static`
- [x] Browser form and core-workflow checks against an isolated fixture
- [x] Desktop and 375-pixel mobile layout checks
- [x] Netlify function bundle check
- [x] Static deployment and live auth checks

## Architecture evidence

The output test requires `dist/index.html` and `dist/404.html` and rejects an Astro page server. It checks that different cookies receive identical public HTML. The templates contain no budget records or JWTs. Browser scripts load authorized records only after authentication. The standalone auth function is a JSON API and does not render HTML.

## Honest submission boundary

The AI-assisted implementation cannot satisfy the student's manual-feature or personal-reflection requirement. These tasks remain visible and unfinished until the student completes them. No course form has been submitted by AI. The custom Framework Student mode is optional; the manually built feature is required.

## Prototype limits

Plaid uses Sandbox. Resend credentials are not configured, so password reset and invitation emails cannot be delivered yet. Those email features exceed the course minimum of sign-up, login, and logout. Live bank production access and final-project scaling are outside this prototype.

## Local verification record

- 51 unit, domain, backend, form, and query-loading tests passed.
- 4 static-output tests passed.
- Astro and TypeScript reported no errors or warnings.
- Biome completed with no errors. It reports advisory warnings, including existing non-null assertions and CSS rules.
- Netlify's production build bundled only the `auth` function.
- Isolated browser checks exercised auth, core forms, exact-cent payloads, revisions, live updates, keyboard controls, and desktop/mobile layouts. They found a Back-navigation issue with dirty forms. A confirmation guard was added before release.
- The local build-size measurement is recorded separately, with its date, environment, and commit. It is a single sample, not a controlled stack comparison.

## Hosted release evidence — October 31, 2026

The static release was verified on https://bakeoff-troyowens.netlify.app at code commit `a86b14aec3d7e0dd827622aa141a5d5cc925d07e`.

- Registration opened setup; setup persisted after a reload.
- The setup-page sign-out button opened the login form. Login returned to setup. A second logout succeeded.
- Invalid credentials produced a useful error and the expected HTTP 401 response.
- Authenticated and public requests received identical static HTML. The HTML included templates and no private snapshot or test email.
- The site deployed one backend function, `auth`. It did not deploy an Astro page-rendering function.
- Login and setup fit desktop and 375-pixel widths, and keyboard focus reached visible controls.
- The temporary test accounts were signed out and removed. No test budget or profile was created on the hosted database.

The remaining unfinished tasks are the student's additional feature, personal reflection/comparison, and external course evaluation form.
