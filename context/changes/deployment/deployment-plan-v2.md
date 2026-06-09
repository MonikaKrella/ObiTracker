# Deploy ObiTracker to Cloudflare Workers

## Context

ObiTracker's `wrangler.jsonc` already targets Cloudflare Workers (not Pages) with `nodejs_compat`
and `@astrojs/cloudflare` v13. Three gaps remain before production is live:

1. **Worker name** is the template default (`10x-astro-starter`) — must be renamed to `obitracker`
   before the Worker is created on Cloudflare (renaming after creates a second orphaned Worker).
2. **Supabase credentials** are not yet set as Cloudflare Workers Secrets — the app deploys
   but auth returns `null` silently until they are.
3. **Auto-deploy on merge** is wired through Cloudflare's native GitHub integration (no
   GitHub Actions changes needed).

Sequence: fix config → provision accounts → configure Supabase → deploy manually → verify →
wire auto-deploy.

---

## Prerequisites (human gates — nothing to code yet)

### A. Cloudflare account

1. Go to [cloudflare.com](https://cloudflare.com) → **Sign up** (free) or log in
2. From the dashboard sidebar, open **Workers & Pages**
3. Note your **Account ID** — shown in the right sidebar on the Workers & Pages overview page

> If you belong to multiple Cloudflare accounts, confirm the Account ID matches the account you'll deploy to. Run `npx wrangler whoami` after authenticating (section B below) to verify.

### B. Wrangler CLI authentication

Wrangler is already installed via `devDependencies`. Authenticate it:

```powershell
# Option 1 — browser login (easiest for local dev):
npx wrangler login

# Option 2 — API token (no browser, works in any terminal):
$env:CLOUDFLARE_API_TOKEN = "paste-your-token-here"

# Verify:
npx wrangler whoami
# Expected: "You are logged in as <email> [Account: <name>, ID: <account-id>]"
```

> The API token is created in Phase 2. If using Option 2, complete Phase 2 first, then return here to authenticate.

> `wrangler login` opens a browser tab for OAuth. In WSL or headless environments use Option 2.

### C. Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier: 2 projects, 500 MB)
   - **Name:** `obitracker`
   - **Region:** closest to your users — `eu-central-1` (Frankfurt) or `eu-west-2` (London) for Poland
   - **Database password:** generate a strong one and save it
2. Wait for provisioning (~2 min), then go to **Settings → API**
3. Copy:
   - **Project URL** → this is `SUPABASE_URL` (e.g. `https://abcxyz.supabase.co`)
   - **`anon` public** key → this is `SUPABASE_KEY` (the long JWT)
4. Enable email auth: **Authentication → Providers → Email → toggle on**
5. Set them in a local `.env` for dev:
   ```
   SUPABASE_URL=https://abcxyz.supabase.co
   SUPABASE_KEY=eyJh...
   ```

> ⚠️ Use the `anon` key, NOT `service_role`. The `service_role` key bypasses Row Level Security.
> Both appear on the same Settings → API page — the anon key is labelled "anon public".

> Values in `.env` are for local `astro dev` only. The deployed Worker uses secrets set via
> `wrangler secret put` in Phase 4 — `.env` is never read at runtime on Cloudflare.

### Pre-flight checklist

- [x] Cloudflare account exists at dash.cloudflare.com (free tier is sufficient)
- [x] Account ID noted from Workers & Pages overview sidebar
- [x] `npx wrangler whoami` confirms the correct account
- [x] Supabase project `obitracker` exists and is fully provisioned
- [x] Supabase Email auth is enabled (Authentication → Providers → Email)
- [x] `SUPABASE_URL` and `SUPABASE_KEY` values are in hand

---

## Phase 1 — Config fixes `[x]`

**Files:** `wrangler.jsonc`, `package.json`

### 1a. Rename Worker

In `wrangler.jsonc`, change:

```jsonc
"name": "10x-astro-starter"
```

to:

```jsonc
"name": "obitracker"
```

Do this before any `wrangler deploy`. If deployed under the old name first, a new Worker named
`obitracker` is created on the next deploy and the old `10x-astro-starter` Worker persists,
consuming quota and causing confusion.

### 1b. Add deploy script

In `package.json`, add to `scripts`:

```json
"deploy": "wrangler deploy"
```

Used for local deploys and readable as `npm run deploy`.

### 1c. Rename local Supabase project_id

In `supabase/config.toml`, change:

```toml
project_id = "10x-astro-starter"
```

to:

```toml
project_id = "obitracker"
```

Needed if you ever run `supabase` CLI commands locally (`supabase db push`, `supabase migration`) — a mismatched `project_id` targets the wrong cloud project.

---

## Phase 2 — Cloudflare API token `[x]`

1. Cloudflare dashboard → My Profile → API Tokens → **Create Token**
2. Choose **Custom token** (the "Edit Cloudflare Workers" preset includes unnecessary KV/R2
   permissions — use custom to keep the token minimal)
3. Set permissions:
   - **Account**: `Workers Scripts` → Edit
   - **Account**: `Account Settings` → Read
   - **Zone**: `Workers Routes` → Edit (scope to your zone or "All zones")
4. **Account Resources**: select your specific account, not "All Accounts"
5. **Name the token** `obitracker-deploy` for auditability
6. Copy the token value — shown only once
7. Note your **Account ID** (Cloudflare dashboard right sidebar, Workers & Pages overview page)

> ⚠️ If `wrangler deploy` fails with `10000 (Authentication error)`, the token is missing
> `Workers Scripts: Edit`. Create a new custom token with the scopes above.

---

## Phase 3 — Supabase URL configuration `[x]`

**Must be done before the first deploy.** Email confirmation callbacks fail silently if
missing — users can sign up but the verification link in the email does not redirect back.

1. Supabase → Authentication → **URL Configuration**
2. Run `wrangler whoami` first to confirm your account subdomain, or use a placeholder now
   and update after Phase 5 once you know the URL.
3. Set **Site URL** to `https://obitracker.<account>.workers.dev`
4. Add the same URL to **Redirect URLs**

> ⚠️ If you forget this step, sign-in works but email confirmation links redirect to
> `localhost:4321`. Fix: update Supabase URL Configuration after deploy — no redeployment
> needed, it takes effect immediately.

---

## Phase 4 — Set Cloudflare Workers Secrets `[x]`

Run these from the project root (interactive — each prompts for the value):

```bash
wrangler secret put SUPABASE_URL
# Paste your Supabase Project URL, press Enter

wrangler secret put SUPABASE_KEY
# Paste your Supabase anon key, press Enter
```

Verify both are stored:

```bash
wrangler secret list
# Should show: SUPABASE_URL, SUPABASE_KEY
```

> ⚠️ Do NOT add these to `wrangler.jsonc` under `[vars]` — that section is for non-sensitive
> values and is committed to git. Secrets must go through `wrangler secret put` or the
> Cloudflare dashboard.

> ⚠️ Setting values in a local `.env` file does nothing for the deployed Worker at runtime.
> `.env` is only read by `astro dev` locally.

---

## Phase 5 — First manual deploy `[x]`

```bash
npm run build          # produces dist/ — the Astro SSR bundle for Workers
npm run deploy         # wrangler deploy — uploads to Cloudflare Workers
```

Expected output from `wrangler deploy`:

```
Total Upload: XX KiB / gzip: XX KiB
Uploaded obitracker (X sec)
Deployed obitracker triggers (X sec)
  https://obitracker.<account>.workers.dev
Current Version ID: <version-id>
```

If this is your first deploy, the Worker is created automatically — no dashboard setup needed.

> ⚠️ **`dist/ not found`**: The `astro build` step did not complete. Check for build errors
> (usually a TypeScript error or missing env var declaration) before retrying `wrangler deploy`.

> ⚠️ **`Error 1101` on any request after deploy**: CPU time limit hit or `nodejs_compat`
> missing. Check `wrangler.jsonc` — `"compatibility_flags": ["nodejs_compat"]` must be present.
> It is already there in the current config; if removed accidentally, add it back and redeploy.

---

## Phase 6 — Verification `[x]`

- [x] Open `https://obitracker.monika-krella.workers.dev` — confirm app loads
- [x] Navigate to `/auth/signin` — confirm page renders without errors
- [x] Create a test account via sign-up — confirm confirmation email arrives
- [x] Click the confirmation link in the email — confirm redirect lands back on the app
      (Phase 3 Supabase Site URL corrected to `https://obitracker.monika-krella.workers.dev`)
- [x] Sign in with the confirmed account — confirm redirect to `/dashboard`
- [x] Run `wrangler tail` and reproduce a sign-in to confirm no runtime errors in the stream

> ⚠️ **Auth works locally but fails in production (sign-in page loads but login fails):**
> Supabase secrets are not set or have wrong values. Run `wrangler secret list` — both
> `SUPABASE_URL` and `SUPABASE_KEY` must appear. If missing, re-run Phase 4.

> ⚠️ **Supabase email redirect loops or goes to localhost:** Phase 3 was skipped or has a
> typo in the Workers URL. Update Authentication → URL Configuration in Supabase.

---

## Phase 7 — Auto-deploy on merge to master `[ ]`

Wire Cloudflare's native GitHub integration so every merge to `master` deploys automatically
without any GitHub Actions changes.

1. Cloudflare dashboard → Workers & Pages → **obitracker** → Settings → **Git**
2. Click **Connect repository** → authorise GitHub → select the ObiTracker repo
3. Set **Production branch**: `master`
4. Set **Build command**: `npm run build`
5. Set **Deploy command**: `wrangler deploy` (or leave blank — Cloudflare infers it from
   `wrangler.jsonc`)
6. Under **Environment variables**, add:
   - `SUPABASE_URL` = your Supabase Project URL (mark as **Encrypted**)
   - `SUPABASE_KEY` = your Supabase anon key (mark as **Encrypted**)

From this point, every push to `master` triggers a build + deploy on Cloudflare's
infrastructure. The existing `.github/workflows/ci.yml` continues to run lint and build checks
on every push and PR — it is untouched.

> ⚠️ The Cloudflare Git integration and the existing CI workflow are independent. CI validates;
> Cloudflare deploys. They do not interfere.

> ⚠️ If a deploy fails in the Cloudflare dashboard, `wrangler rollback` (run locally) still
> works and is faster than re-pushing a revert commit.

---

## Rollback procedure

If a bad deploy reaches production:

```bash
wrangler deployments list           # list deployments with version IDs
wrangler rollback <VERSION_ID>      # revert in ~30 seconds, no rebuild needed
```

Or revert the commit and push to `master` — the Cloudflare Git integration redeploys.

> Note: `wrangler rollback` does NOT revert Cloudflare Workers Secrets. If a secret rotation
> was part of the bad deploy, re-run `wrangler secret put <KEY>` with the previous value.

---

## Verification checklist (all phases complete)

- [ ] `wrangler tail` streams live logs with no persistent errors
- [ ] `wrangler secret list` shows `SUPABASE_URL` and `SUPABASE_KEY`
- [ ] Cloudflare dashboard → Workers → obitracker → Metrics shows request activity
- [ ] Supabase → Authentication → Users shows at least one confirmed test user
- [ ] A push to `master` triggers an auto-deploy via Cloudflare Git integration

---

## Out of scope

- GitHub Actions changes
- Custom domain setup
- Supabase database migrations (no custom tables exist yet)
- Multi-region deployment
