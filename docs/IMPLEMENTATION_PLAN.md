# Bakeoff 2 implementation plan

## Goal and scope

Build a working prototype for WDD 430 Bakeoff Round Two. Use the original Budget Together specification and its agreed product changes. Keep `main` at the October 17, 2026 baseline. Make this work on `SSR`, as requested. The branch name is retained; the final rendering mode is static.

The prototype must support registration, sign-in and sign-out, private budgets, balanced monthly plans, categories, transactions, responsive layouts, and useful validation. Retain the existing shared-budget, reporting, review, and bank Sandbox features. Live bank production access, payments, and email-provider setup are outside the course minimum.

## Stack and architecture

- Astro 7 in `output: "static"` mode builds the HTML and reusable native HTML templates.
- TypeScript browser scripts read the session, load authorized data, bind data to cloned templates, and handle forms.
- Convex stores data and runs the existing queries, mutations, access checks, revision checks, bank imports, and scheduled jobs.
- Better Auth stores sessions in the Convex component. A small Netlify API function forwards `/api/auth/*` to Convex. It returns auth responses; it does not render HTML.
- Netlify serves the prebuilt HTML, CSS, and JavaScript. GitHub pushes to `SSR` trigger production builds.
- Keep the existing Tailwind CSS build and Biome checks. Add no UI framework or new runtime package.

Each visitor receives the same public HTML file. Private names, budget records, and session tokens never enter the build output. After authentication, the browser uses the authenticated Convex client. Live query changes update the view unless a form has unsaved entries. Such a form keeps its values and revision until the user chooses to load current values.

## Research and starting guide

1. Follow Astro's [client-side script tutorial](https://docs.astro.build/en/tutorial/3-components/4/) to connect static HTML to browser events.
2. Use [Scripts and event handling](https://docs.astro.build/en/guides/client-side-scripts/) for native component scripts and HTML templates.
3. Use [Astro's rendering guide](https://docs.astro.build/en/guides/on-demand-rendering/) to check the boundary between prebuilt pages and request-time rendering.
4. Use the [Convex and Better Auth guide](https://labs.convex.dev/better-auth/basic-usage) for browser authentication and authenticated data calls.

The prior implementation used request-time page rendering. This implementation explores build-time HTML with browser data loading. Reusing Convex is allowed by the assignment. The database choice does not determine the page rendering mode.

## Implementation tasks and order

- [x] Replace the Astro page server with static pages and remove both SSR adapters.
- [x] Move the existing auth proxy to a standalone Netlify API function. Support the same route in local development.
- [x] Build static auth forms, setup, navigation, view shells, and reusable row templates in `.astro` files.
- [x] Add browser template binding with DOM APIs. Treat record values as text or input values, never executable markup.
- [x] Load session and budget queries in the browser. Keep queries bounded to the selected budget and month.
- [x] Retain all existing form conversions, integer-cent calculations, and backend validation.
- [x] Retain bank linking, account moves, invitations, partner funding, reports, alerts, and monthly review.
- [x] Keep live updates, loading states, retry controls, conflict notices, and unsaved form protection.
- [x] Test static output, authentication, core budget workflows, validation, mobile layout, and keyboard controls.
- [ ] Deploy `SSR` and verify the public site.
- [x] Record results and known limits in the course checklist.
- [ ] Student: build one additional feature with AI used for guidance only.
- [ ] Student: write the personal reflection and complete the course evaluation form.

## Acceptance checks

1. `pnpm build` writes `dist/index.html` and `dist/404.html`, with no Astro page server.
2. The generated page contains the public forms and view templates. It contains no private data and needs no database access during the build.
3. Sign-up, sign-in, sign-out, and session persistence work on the hosted site.
4. A user can save a balanced monthly plan. An unbalanced plan is rejected. Categories and manual transactions retain their CRUD operations and revisions.
5. A different user cannot read or edit a private budget through the API.
6. Core pages work at desktop and mobile widths. Controls have labels and work with a keyboard.
7. Errors retain the user's entries and offer a useful next action.
8. The submission contains the specification, this plan, task status, research links, test evidence, and honest notes about AI use.

## Work reserved for the student

The application migration and its documentation are AI-assisted work. They do not count as the student's manually built feature. Use the optional Framework Student agent for that work. Personal experience, course ratings, and claims of authorship must be written by the student.
