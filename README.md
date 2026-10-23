# Holy Fitness ✝️

Custom 7-day training, nutrition and sleep plans calculated from your body
composition, with a health check, a progress dashboard, and daily workout /
meal / sleep logging. Plans and logs are saved to your account, so they follow
you across devices. Static frontend + Vercel serverless API. **No AI API and no per-plan cost.**

## How plans are made

`lib/planner/engine.js` is a rule-based generator: lean mass → Katch-McArdle BMR
→ maintenance → goal-adjusted calories → macros → split, exercises, meals and
sleep. `lib/planner/safety.js` screens health answers first: some conditions
(heart conditions, insulin-treated diabetes, kidney disease, pregnancy,
eating-disorder history…) produce **no plan** and a message to see a doctor;
others (blood pressure, joints, 60+, obesity, PCOS…) produce a gentler plan with notes.
See `CLAUDE.md` for the full pipeline. Run `node scripts/selftest.mjs` to check it.

## Structure

```
index.html, css/*.css, js/app.js      Frontend
privacy.html, terms.html              Legal pages for South Africa (DRAFTS — fill placeholders, get reviewed)
js/progress.js                        Daily-target logic, streaks, history views (tested separately)
brand.html, assets/                   Brand guidelines page, logo SVGs, icons, social image
api/auth/*                            signup, login, logout, me, forgot, reset
api/state.js                          Saves/loads plan, progress, logs per account
api/account/delete.js                 Permanently deletes an account and its data
api/plan/generate.js                  Session check + planner
lib/planner/*                         Plan generator (engine, safety, exercise/food data)
lib/db.js, lib/auth.js, lib/session.js, lib/email.js
scripts/selftest.mjs                  Planner self-check
```

## Setup

1. Push to GitHub, import the repo in Vercel.
2. Project → Storage → Create Database → Upstash Redis, prefix **KV**.
3. Settings → Environment Variables: add `SESSION_SECRET`.
4. Optional, for password-reset emails: `RESEND_API_KEY`, `EMAIL_FROM` (see `.env.example`).
5. Fill in the `[PLACEHOLDERS]` in `privacy.html` / `terms.html` and have them reviewed before launch.
6. Deploy. Every push to `main` redeploys.

## Local development

```bash
npm install
cp .env.example .env   # set SESSION_SECRET
vercel dev
```

## Before opening to the public

- Replace and legally review the privacy policy and terms.
- Set up email (Resend + a verified domain) or password resets won't work for users.
- Vercel's free Hobby plan is for non-commercial use; upgrade if you charge money.
