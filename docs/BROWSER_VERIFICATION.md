# Browser verification

On 2026-11-11, all 13 named steps passed against the production build in a headed Chromium browser on a private Xvfb display. The suite reported no page errors. It checks registration, categories, split transactions and filters, budget validation and carry-forward, sharing and privacy, allocations, live updates, profile and login, and mobile views.

```sh
Xvfb :97 -screen 0 1440x1000x24 >/tmp/bakeoff-xvfb.log 2>&1 &
xvfb_pid=$!
BROWSER_EXECUTABLE=/home/troyowens/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
PLAYWRIGHT_MODULE=/usr/lib/chatgpt/resources/cua_node/lib/node_modules/playwright/index.mjs \
DISPLAY=:97 pnpm test:browser
kill "$xvfb_pid"
```

The suite starts its own server and uses an in-memory SQLite database, a simulated checking account and income, and mocked Resend email. It forbids live Plaid requests. It does not verify real bank connections or email delivery. Results, screenshots, and a trace are written to `output/browser/`. The mobile screenshots and desktop overview were inspected; the transaction table scrolls horizontally within its panel on mobile.
