---
project: ObiTracker
created: 2026-05-24
status: pending
scope: manual-first-deploy
ci_cd: deferred
---

# ObiTracker — Cloudflare Workers Deploy Plan

**Scope:** Manual first deploy. GitHub Actions auto-deploy on merge to `master` is the eventual target but out of scope for now.

---

## Prerequisites

### A. Cloudflare account

1. Go to [cloudflare.com](https://cloudflare.com) → **Sign up** (free) or log in
2. From the dashboard sidebar, open **Workers & Pages**
3. Copy your **Account ID** — shown in the right sidebar. Keep it handy for Phase 3
4. Create a **scoped API token** for local `wrangler` access:
   - My Profile (top-right avatar) → **API Tokens** → **Create Token**
   - Use the **"Edit Cloudflare Workers"** template
   - Under *Account Resources*: select your account
   - Under *Zone Resources*: leave as "All zones" (or no zone needed for Workers)
   - Click **Continue to summary** → **Create Token**
   - Copy the token — it is shown **only once**

> **Edge case — multiple accounts:** If you belong to multiple Cloudflare accounts (personal + any org), confirm the Account ID in step 3 is the one you selected when creating the token. Running `npx wrangler whoami` after login will confirm which account Wrangler resolves to.

### B. Wrangler CLI (already in `devDependencies`)

Wrangler `^4.90.0` is already installed via `npm`. Authenticate it with your API token:

```powershell
# Option 1 — interactive browser login (easiest for local dev):
npx wrangler login

# Option 2 — token-based (no browser, works in any terminal):
$env:CLOUDFLARE_API_TOKEN = "paste-your-token-here"

# Verify authentication:
npx wrangler whoami
# Expected output: "You are logged in as <email> [Account: <name>, ID: <account-id>]"
```

> **Edge case:** `wrangler login` opens a browser tab to complete OAuth. If the browser doesn't open (headless/WSL environment), use Option 2 with the token from Prerequisite A step 4.

### C. Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier: 2 projects, 500 MB)
   - **Name:** `obitracker`
   - **Region:** closest to your users — `eu-central-1` (Frankfurt) or `eu-west-2` (London) for Poland
   - **Database password:** generate a strong one and save it (used for direct DB access later)
2. Wait for provisioning (~2 min), then go to **Settings → API**
3. Copy:
   - **Project URL** → this is `SUPABASE_URL` (e.g. `https://abcxyz.supabase.co`)
   - **`anon` public** key → this is `SUPABASE_KEY` (the long JWT)
4. Set them locally in `.env` for dev:
   ```
   SUPABASE_URL=https://abcxyz.supabase.co
   SUPABASE_KEY=eyJh...
   ```

> **Edge case — local vs production Supabase:** If you have a local Supabase instance running (`supabase start`), its URL is `http://127.0.0.1:54321` and anon key is printed by `supabase start`. These work for local dev but must **not** be used as Cloudflare Worker secrets — use the cloud project values from step 3 for production.

---

## Phase 0 — Code fixes

*Agent executes. Three names still read `"10x-astro-starter"` from the starter template. These must match `"obitracker"` before deploying — the `wrangler.jsonc` name becomes the Worker's name in Cloudflare.*

| File | Field | Before | After |
|---|---|---|---|
| `wrangler.jsonc` | `name` | `"10x-astro-starter"` | `"obitracker"` |
| `package.json` | `name` | `"10x-astro-starter"` | `"obitracker"` |
| `supabase/config.toml` | `project_id` | `"10x-astro-starter"` | `"obitracker"` |

- [ ] `wrangler.jsonc` name updated
- [ ] `package.json` name updated
- [ ] `supabase/config.toml` project_id updated
- [ ] `nodejs_compat` flag present in `wrangler.jsonc` ✅ already present — verified
- [ ] `assets` binding schema in `wrangler.jsonc` ✅ Workers schema, not Pages — verified

---

## Phase 1 — Local build verification

*Agent executes.*

```powershell
npm run build
```

- [ ] Build completes with no errors
- [ ] `dist/_worker.js` exists — confirms Workers output (not Pages output)

> **Edge case:** If build fails on `astro:env/server` — the env vars are `optional: true`, so the build never requires real values. A failure here is a lint or TypeScript error, not a missing secret. Run `npm run lint` to isolate.

---

## Phase 2 — Provision Cloudflare Worker secrets

*Human executes. Secrets set here are the **runtime** values on Cloudflare — separate from `.env` which is local dev only.*

```powershell
# Interactive (prompts for value after running):
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY

# Non-interactive alternative (pipe the value):
Write-Output "https://abcxyz.supabase.co" | npx wrangler secret put SUPABASE_URL
Write-Output "eyJh..." | npx wrangler secret put SUPABASE_KEY

# Confirm both are registered:
npx wrangler secret list
```

- [ ] `SUPABASE_URL` appears in `wrangler secret list`
- [ ] `SUPABASE_KEY` appears in `wrangler secret list`

> **Critical:** Do **not** add these to `wrangler.jsonc` under `[vars]` — `[vars]` is for non-sensitive config and its values are visible in Wrangler output. Secrets go through `wrangler secret put` only.

> **Edge case — wrong project:** `wrangler secret list` and `wrangler secret put` operate on the Worker named in `wrangler.jsonc` — which will be `"obitracker"` after Phase 0. Confirm with `npx wrangler whoami` that you're targeting the right account.

---

## Phase 3 — First deploy

*Agent executes, human verifies.*

```powershell
npx wrangler deploy
```

- [ ] Deploy succeeds — output includes a production URL (`obitracker.<subdomain>.workers.dev`)
- [ ] Root URL (`/`) loads in browser — static assets served correctly
- [ ] `/auth/signin` loads — SSR is working
- [ ] Complete sign-up flow — confirms `nodejs_compat` + Supabase secrets are wired
- [ ] `npx wrangler tail` shows no runtime errors during smoke test

> **Edge case — auth 500 after form submit:** Most likely `SUPABASE_URL`/`SUPABASE_KEY` not set in Worker secrets (Phase 2 incomplete or set to wrong project). Check `wrangler tail` for `missing env var` or `crypto.subtle` errors.

> **Edge case — 1101 CPU error:** Worker exceeded the free-tier 10 ms CPU budget. Unlikely at MVP load. If it appears during smoke test the Worker initialization path is heavier than expected — upgrade to Workers Paid ($5/month) for 30 ms CPU limit.

> **Edge case — blank response or 1042:** Build produced Pages output instead of Workers output. Confirm `wrangler.jsonc` has the `assets` binding (not `pages_build_output_dir`) and that `@astrojs/cloudflare` adapter is installed.

---

## Phase 4 — Rollback reference

*No action now — reference only.*

```powershell
# Revert to previous deployment instantly (no rebuild):
npx wrangler rollback

# Revert to a specific version:
npx wrangler deployments list        # find VERSION_ID
npx wrangler rollback <VERSION_ID>
```

> `wrangler rollback` reverts Worker code only. Supabase schema migrations applied with the bad deploy must be reverted separately via a compensating migration in `supabase/migrations/`.

---

## Future — GitHub Actions auto-deploy on merge to `master`

When ready, the `ci.yml` will gain a `deploy` job that runs after the existing `ci` job:

```yaml
deploy:
  needs: ci
  if: github.ref == 'refs/heads/master' && github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: cloudflare/wrangler-action@v3
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        command: deploy
```

GitHub repo secrets needed at that point: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
(plus `SUPABASE_URL`/`SUPABASE_KEY` already present for the build step).
