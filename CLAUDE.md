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

## Reminders (web push notifications)

Daily "log your day" + weekly check-in reminders, and milestone pings to a person's OTHER devices. Files: `lib/push.js` (all logic; storage and
sending are injected so it is testable), `api/push.js` (GET/POST for the signed-in user: subscribe / prefs / unsubscribe / test / milestone),
`api/cron/remind.js` (the job), `sw.js` (push + notificationclick), `js/push.js` (the Reminders dialog in Account). KV: `push:<userId>` =
`{ prefs, subs[{id,endpoint,keys,addedAt}], lastSent{daily,weekly,any} }` and the set `push:users`. Deleting an account removes both.
Rules, do not weaken: (1) subscription endpoints must be on the browser makers' push hosts (`ALLOWED_HOSTS`), otherwise the server could be
pointed at any address (SSRF); (2) times only 06:00-21:30 in 15-minute steps; (3) at most ONE reminder a day; the daily one is skipped if they already
logged, the weekly one if they weighed in recently; (4) message text is GENERIC (it shows on lock screens): never weights, calories, body fat or health;
(5) milestone kinds are an allowlist and the text is built on the server, never taken from the client; (6) iPhone requires every push to show a notification,
so the service worker always shows one; (7) free Vercel plan: max 12 functions (we use 11) and cron jobs only once a day, so NO `crons` entry
more frequent than daily may go into vercel.json (the deploy would fail). `web-push` is imported lazily so everything else is testable without it.
SETUP (one time): `node scripts/generate-vapid.mjs` -> add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET in Vercel env vars and redeploy;
then an outside scheduler (cron-job.org, free) calls `GET /api/cron/remind` every 15 minutes with header `Authorization: Bearer <CRON_SECRET>`.

## Body measurements, goals and plan updates (js/body.js)

`appState.measurements` = `[{ d, w (kg), bf?, wa? }]` (one per date, max 1000) and `appState.targets` = `{ weight, bf, startWeight, startBf, startDate, setAt, reachedAt }`;
both sync via /api/state (validated in `cleanMeasurements` / `cleanTargets`). UI: History > Body tab (charts with a 7-day trend line, goal bars, entry list),
a Body card on Today, log + goal dialogs. Pure logic is in `js/body.js` (tested with node `vm`). Key rules, do not weaken:
- Daily weight bounces, so goals are judged on the 7-DAY TREND, never on a single weigh-in.
- Goals below BMI 18.5 (using the plan's stored height) or below body-fat floors (men 6%, women 14%) are REFUSED with a doctor/dietitian message.
- Underweight readings show a caring note; fast loss (>=1% of body weight a week) gets an information note. Never celebrate or shame.
- `plan.meta.profile` stores the NON-health numbers a plan was built from (gender, age, height, weight, bf, freq, exp, sleep, stress, goal, diet,
  allerg, cycle) so "Update my plan" can pre-fill the intake form. HEALTH ANSWERS ARE NEVER STORED and the health check is ALWAYS asked again.
- A plan is flagged for an update after >= max(2 kg, 3%) weight change or >= 2 points body fat versus the numbers it was built from, or when a goal is reached
  (then a maintenance goal is suggested). Updating regenerates the plan via the normal intake; history and measurements are kept.

## Food swaps ("can't eat it" / "too expensive" / "hard to find")

Every generated meal carries `type` (breakfast/main/snack) and `items: [[foodId, grams, text], ...]` next to the old `foods` text.
`lib/planner/swaps.js` (pure ESM, shared by the generator, the browser and the tests) holds `formatAmount` (the ONE place amounts
are formatted, so plan text and swap text never drift), `suggestSwaps`, `applySwap`, `undoMeal`, `swapEverywhere`, `refreshDayTotals`.
The browser loads it lazily with `import('/lib/planner/swaps.js')` (so `lib/planner/*` must stay publicly served static files).
`lib/planner/restrictions.js` = diet / allergy / avoid rules, used by BOTH the generator and the swap engine.
Food data (foods.js): `role` (protein/carb/fat/veg), `cost` 1-3 and `avail` 1-3 (relative, South Africa; rough guides, NOT prices),
`sweet` (shake / yogurt proteins), `nut` (nuts and butters), `FOOD_TYPES` (meal types a food really appears in). New foods need metadata
or foods.js throws on load. A swap: same job, allowed by diet / allergies / avoid list, fits the meal type and how it is eaten, then
the new amount AND the biggest carb and fat foods are re-solved so calories and protein stay near the original (on target = calories
within 6% or 15 kcal, protein within 12% or 3 g). "I can't eat it" never offers a close cousin (same allergen group) and can add the
food to `appState.avoidFoods` (synced via /api/state, sent to /api/plan/generate as `avoid`). Swapped meals keep `orig` so Undo works.
api/state.js `scrub` depth must stay >= 12 or swapped meals get their items nulled. Old plans without `items` show text only.

## Training Center + exercise library

Data: the Free Exercise DB (github.com/yuhonas/free-exercise-db, Unlicense / public domain; credit shown in the app).
`scripts/build-training-media.py` turns it into `data/exercises.json` (slim, 876 exercises) and
`exercises/<id>/0.webp, 1.webp` (start / end photos, 640px WebP, about 31 MB). These are committed to the repo and
served as static files (vercel.json caches them). `js/training.js` = the Training Center (search with synonyms,
filters, photo viewer, steps) and `HFTraining.open(id)` powers every "How to" button.
The planner's exercise pools are GENERATED by `scripts/build-planner-library.py` into `lib/planner/library.js`
(curated rules + exclusion lists + safety flags; edit the lists in the script and re-run, never hand-edit).
Every plan exercise carries `libId`. `li` = safe for gentle / low-impact plans and is CONSERVATIVE: machines, cables,
dumbbells and barbells unless the name matches a risky pattern; bodyweight only if reviewed. Power pool is never `li`.
Plans saved before the library existed are linked by old name via `js/exercise-links.js` (also generated).
Search ranking: everyday strength first, closest name match, easier before harder (so "squat" shows Hack / Goblet /
Barbell squat, not "Squat Jerk"). The mobile bottom tab bar must stay a `<div>` (a `<nav>` inherits the top-bar CSS and covers the screen).

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
get a Share -> Add to Home Screen guide; **Samsung Internet is deliberately NOT given the one-tap install** (its own install package was blocked by Google Play Protect as "Unsafe app blocked" on a real phone, while Chrome's installs cleanly), so it gets a "use Chrome" guide with Samsung's shortcut route as the alternative; in-app browsers are told to open the real browser; installed or
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
