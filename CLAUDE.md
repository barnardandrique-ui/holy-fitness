# Holy Fitness ✝️ — Project Context for Claude Code

Read this before making changes. It exists so you don't need the person to
re-explain the project.

## What this is

A fitness web app: users sign up, enter a profile (body stats incl. body fat %,
goal, diet, allergies, optional cycle phase), and get a custom 7-day training,
nutrition and sleep plan. A progress dashboard shows which day they're on, and
daily loggers record workouts, meals and sleep.

**Deployment:** Vercel project `holy-fitness`, connected to GitHub repo
`barnardandrique-ui/holy-fitness` (`main`). Every push to `main` auto-deploys.

**What the person wants:** to describe changes in plain language and have them
actually happen (edit → test → commit → push) without manual copy/paste steps.
If you have real file/git access, act on it.

## Architecture

```
index.html                Landing page, dashboard, intake form (incl. health check), progress page, modals
css/styles.css, extra.css, brand.css  Styling (brand.css = the corporate identity, loaded last)
js/app.js                  Frontend logic: auth, state sync, plan rendering, dashboard, loggers
privacy.html, terms.html   Legal pages — DRAFTS with [PLACEHOLDERS]; need lawyer review
api/auth/*.js              signup (consent + 8-char pw), login (lockout after 8 fails/15 min),
                           logout, me, forgot + reset (emailed one-hour token via Resend)
api/state.js               GET/PUT the user's plan, progress, logs (cross-device sync)
api/account/delete.js      Permanently deletes account + all data (needs password)
api/plan/generate.js       Session check, then the planner. No AI, no API key.
lib/planner/engine.js      Plan generator
lib/planner/safety.js      Health screening, gentle/low-impact/obesity modes, women's health
lib/planner/exercises.js, foods.js   Data libraries
lib/db.js                  ALL storage (Vercel KV / Upstash Redis)
lib/auth.js                requireUser(): session + account exists + session not revoked
lib/session.js             Signed JWT cookie (carries a session version `sv`)
lib/email.js               Resend via fetch (no SDK)
scripts/selftest.mjs       `node scripts/selftest.mjs` — planner/safety self-check
```

Hobby plan allows 12 serverless functions; this uses 9 (everything under `api/`).

## The planner (lib/planner) — IMPORTANT

Plans are produced by a **deterministic, rule-based algorithm**, not an AI. This
was a deliberate choice: zero cost per plan, instant results, fully explainable,
testable. Do not reintroduce an LLM call for plan generation unless asked.

Pipeline in `engine.js`:
1. **Body composition:** lean mass = weight × (1 − bf%).
2. **Energy:** Katch-McArdle BMR (370 + 21.6 × lean mass) × activity multiplier
   (from training days) = maintenance (TDEE).
3. **Goal:** surplus/deficit by goal, experience, body fat and FFMI, with safety
   rules (calorie floor = max(1200 F / 1500 M, BMR); very lean people on "fat
   loss" get maintenance; under-18s get a capped deficit).
4. **Macros:** protein g/kg of LEAN mass by goal (adjusted for vegan/vegetarian/
   high-protein), fat % of calories, carbs fill the rest; low-carb caps carbs.
   Training days run above, rest days below, averaging to the weekly target.
5. **Training:** split from days/week (2: full body, 3: full body, 4: upper/lower,
   5: PPL + upper/lower, 6: PPL×2); exercises chosen from pools by experience
   level; sets/reps/rest from the goal; cycle phase trims volume (luteal/menstrual).
6. **Nutrition:** meals assembled from `foods.js` templates; portions solved
   numerically so each day lands on its macro targets; meal count scales with
   carbs; allergies/diet filter foods; a calorie-correction pass trims carbs/fats.
7. **Sleep:** target hours from goal + stress, bedtime from a fixed 6:30 AM wake.

Output shape (the frontend `renderPlan` depends on it exactly):
`{ overview, days[7]{day,trainingType,isRest,training,nutrition{totalCalories,
targets,meals,hydration,supplements},sleep}, sleepProtocol, meta }`.

`generatePlan(profile, { seed })` — same seed gives the same plan; no seed gives
a new variation hitting the same targets. Tests used a random-profile suite
(thousands of plans) checking: structure, no NaN, allergen/diet violations,
duplicate exercises, calorie accuracy (mean ~1.7% error), safety floors.
When changing the engine, re-run that kind of check.

Known planner limits: restricted combos (e.g. vegan + soy-free + gluten-free)
have thin food options and can land several % off target; the "enhanced use"
form field is intentionally NOT used for programming (a summary disclaimer is
added instead) — consider removing that section from the UI.

## Daily targets, celebration and history (js/progress.js)

Pure logic lives in `js/progress.js` (no DOM; tested with node `vm`). A day is a **perfect day** when:
workout = every planned exercise ticked (rest days count automatically); meals = every planned meal ticked
AND planned meals + typed extras <= 110% of the day's calories (no celebrating overeating); sleep = logged and
within 30 minutes of the target (more sleep is never penalised). Perfect days trigger the celebration once
(`c` flag on the entry). Streaks are consecutive calendar days with a perfect day; today doesn't break a streak
until the day is over. Never add shaming copy: imperfect days get a kind toast only.
Every logged / completed day is upserted into `appState.history` as a compact entry (`id = planId:dayIndex`,
arrays `w` workout, `m` meals, `s` sleep, `x` extras, `n` notes). History is PERMANENT: starting a new plan
clears `logs` but never `history`. It syncs via `/api/state` (validated + scrubbed in `cleanHistory`, capped at 730
entries). The History page has Days / Weeks (Mon-Sun) / Months (calendar) views. Respect `prefers-reduced-motion`.

## Install as an app (PWA)

`site.webmanifest` (192 + 512 + maskable icons), `sw.js` and `js/install.js` make the site installable.
The service worker is deliberately tiny: it ONLY serves `offline.html` when a page cannot load; scripts, styles,
plans and the API always go to the network, so nobody gets stuck on an old version or stale health data.
Don't add caching of app files without a versioning plan. `install.js`: Android/Chrome/Edge hold the
`beforeinstallprompt` event and fire it from our "Add App to Home Screen" button; iPhone/iPad (no install API)
get a Share -> Add to Home Screen guide; in-app browsers are told to open the real browser; installed or
unsupported browsers see nothing. The card shows only when signed in, is dismissible for 14 days, and an
accepted install is remembered. The Account dialog always offers it. Detection rules are pure functions,
unit-tested. When launched from the home screen the nav respects the notch (`env(safe-area-inset-*)`).

## Brand / corporate identity (keep consistent)

Logo: the HF monogram (red H whose stem becomes a blade, black F, gold halo). Source was a PNG only,
so `assets/logo*.svg` are TRACES (icons: favicon-32, apple-touch-icon, icon-192; og-image.png for sharing) (fine for screen; commission a redraw for large print). Never recolour;
use `assets/logo.svg` on light and `assets/logo-reversed.svg` (white F) on dark.
Colours (css/brand.css variables): Holy Red #E10000, Ink #0B0B0B, Halo Gold #D6BA82, Deep Gold #8A6B2E
(gold as text on light), Paper #FBF9F5, Warm Line #E7E1D6, Wine #3D0000.
Type: Bodoni Moda 700/900 for display (sentence case, one italic red word), Barlow for UI, Barlow
Condensed for labels/buttons. Fonts load from Google Fonts (disclosed in the privacy policy).
No emoji in the UI; use line icons. Never call the plans "AI". Tagline: "Train with intent."
`brand.html` is the living guideline page (noindex). `css/brand.css` loads LAST and overrides styles.css.
If the production domain changes, update the og:image URL in index.html.

## Health screening (IMPORTANT — don't weaken)

`safety.js` runs before anything else. **Blockers** (heart condition, chest pain,
dizziness/fainting, insulin/medication-treated diabetes, kidney disease,
pregnancy/postpartum, eating-disorder history) return `{ blocked: true, message }`
with NO plan, calories, macros or exercises. Eating-disorder messages must stay free
of numbers. **Caution** answers (high BP, joints, other condition, 60+, obesity, PCOS,
irregular periods, underweight) produce gentler plans (`gentle`, `lowImpact`, capped
deficit) plus `plan.notes`. Calories round toward maintenance so caps are never exceeded.
Health answers are NOT stored as a record; plan notes mention them only generally.

## Other design decisions (don't undo)

- **Sessions are HttpOnly cookies.** `sv` (session version) in the JWT lets a password
  reset sign out every device. Account storage and session are separate.
- **Plan/progress/logs are saved server-side** (`state:<id>` in KV) via `/api/state`, with
  a local cache + retry in the frontend so offline changes aren't lost. State is validated
  and scrubbed of HTML on the server.
- **Password reset** never reveals whether an email has an account, rate-limits per
  address, stores only a SHA-256 of the token, and works only if `RESEND_API_KEY`,
  `EMAIL_FROM` and an app URL are set. Without a verified Resend domain it only emails the owner.
- Site copy must not claim plans are "AI-generated". The old "enhanced use" section was
  removed on purpose; don't add compound/steroid programming.

## Next steps (rough priority)

0. (Ideas) weight/strength charts from history; weekly auto-adjust of calories; shareable week summary.
1. Fill in and have a South African attorney review `privacy.html` / `terms.html` (POPIA; placeholders for contact email, address, Information Officer). Register the Information Officer with the Information Regulator.
2. Set up Resend with a verified domain so password resets work for everyone.
3. Show target-vs-actual macros per day (`nutrition.targets` is already returned).
4. Equipment/injury inputs (home vs gym), more cuisines in `foods.js`.
5. Weekly auto-adjustment of calories from logged weight trend.
6. Email verification on signup.
