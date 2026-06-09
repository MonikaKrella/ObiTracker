---
project: ObiTracker
researched_at: 2026-05-24
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 SSR + React 19 islands
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external PostgreSQL)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The stack already uses `@astrojs/cloudflare` and targets the `workerd` runtime — no adapter swap, no migration cost. At ObiTracker's expected traffic (well under 100k requests/day), the free tier costs $0/month, satisfying the top-priority constraint of minimizing cost. Cloudflare scores Pass on all five agent-friendly criteria: `wrangler` covers every operational loop from CLI, docs are best-in-class for agents (`llms.txt` + Markdown-for-Agents), `wrangler rollback` is a single command (unlike all three competing shortlisted options), and the MCP server is GA. The key operational decision is to target **Workers** via `wrangler deploy`, not Pages via `wrangler pages deploy` — Pages is maintenance-mode and the distinction must be made explicit in the deploy plan.

## Platform Comparison

| Platform               | CLI-first | Managed/Serverless | Agent docs | Stable deploy API | MCP/Integration | Total      |
| ---------------------- | --------- | ------------------ | ---------- | ----------------- | --------------- | ---------- |
| **Cloudflare Workers** | Pass      | Pass               | Pass       | Pass              | Pass            | **5/5**    |
| Netlify                | Partial   | Pass               | Pass       | Pass              | Pass            | **4.5/5**  |
| Vercel                 | Pass†     | Pass               | Pass       | Pass              | Pass            | **4.5/5**† |
| Render                 | Partial   | Partial            | Pass       | Pass              | Pass            | **4/5**    |
| Railway                | Partial   | Partial            | Partial    | Pass              | Partial         | **3/5**    |
| Fly.io                 | Partial   | Partial            | **Fail**   | Pass              | Partial         | **2.5/5**  |

† Vercel scores a nominal 5/5 but carries two material penalties: an open untriaged Astro 6 esbuild build failure (issue #16258, 2026-05-24) and a Hobby-plan commercial-use prohibition. On the cost constraint alone it is disqualified from production use without the $20/user/month Pro plan.

**Partial scores explained:**

- _CLI-first Partial_: Netlify, Render, Railway, Fly.io all lack a one-command CLI rollback. Rollback requires dashboard interaction or a scripted multi-step workaround.
- _Managed/Serverless Partial_: Fly.io and Railway deploy containers, not pure serverless — they abstract OS management but require Dockerfiles, `fly.toml`/`railway.json`, and operator knowledge of persistent process lifecycle.
- _Agent docs Partial (Railway)_: Docs are accessible via `.md` URL suffix and GitHub source but no root `llms.txt` file. Functional for agents but requires knowing the URL pattern.
- _Agent docs Fail (Fly.io)_: No `llms.txt`, no GitHub-hosted markdown docs. Documentation lives in a rendered HTML site only.
- _MCP Partial (Fly.io)_: `fly mcp server` is explicitly `--experimental` as of 2026-05-24.
- _MCP Partial (Railway)_: MCP server is documented as "a work in progress" by Railway's own team.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Zero migration cost — the adapter, dev server, and build pipeline are already configured for `workerd`. The free tier (100k requests/day, ~3M/month) covers ObiTracker's entire expected MVP lifetime at $0/month. `wrangler` provides `wrangler deploy`, `wrangler tail`, and `wrangler rollback` — the only platform in the shortlist with a one-command rollback. MCP is GA with 2,500+ API endpoints and a dedicated Claude Code integration guide (`developers.cloudflare.com/agent-setup/claude-code/`). Documentation is best-in-class with `llms.txt`, `workers/llms.txt`, and every page servable as Markdown via `Accept: text/markdown`. The two open Astro 6 bugs (prerender + Wasm, env import + prerendered routes) are non-blocking for ObiTracker's current `output: "server"` configuration.

#### 2. Netlify

Netlify would be a strong choice if Cloudflare were not already in the stack. The MCP server (`@netlify/mcp`) is GA since June 2025 with nine structured tools, docs are the most agent-readable of any platform (Markdown header streaming), and the free tier covers ObiTracker's load. The gaps: no CLI rollback command (dashboard/API only), a mandatory `@astrojs/netlify` adapter swap, a 10-second function timeout on the free tier (relevant if cold Supabase connections are slow), and the free tier pauses the entire site when the 125k monthly invocation cap is hit rather than gracefully throttling. Total migration effort from the current stack: adapter swap + `astro:env/server` binding migration + CI/CD reconfiguration.

#### 3. Render

Render lands in third place on cost grounds. The free tier's 60-second cold start is disqualifying for any SSR app — the $7/month Starter is the practical minimum. Render's MCP server has been GA since August 2025 and offers 20+ tools including read-only SQL queries against Postgres (useful even though Supabase is external). `render.com/llms.txt` is GA. The main concerns: workspace-wide API keys for the MCP server (no per-project scoping as of 2026-05-24), no CLI rollback, and the same mandatory `@astrojs/node` adapter swap required by Netlify, Fly.io, and Railway.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Pages vs. Workers split will mislead the deploy plan**: `tech-stack.md` declares `deployment_target: cloudflare-pages` and all Astro community tutorials reference `wrangler pages deploy`. Pages is maintenance-mode — no Cron Triggers, no Workers Secrets Store, no Durable Objects. The project must consciously target Workers (`wrangler deploy`) from the start; drifting onto the Pages path requires a migration later and produces a CI pipeline that accumulates Pages-specific config that will need to be unwound.

2. **`nodejs_compat` flag is non-obvious and silently fatal at runtime**: `@supabase/ssr` uses Node.js crypto APIs. Without `"compatibility_flags": ["nodejs_compat"]` in `wrangler.jsonc`, production auth breaks with a cryptic runtime error rather than a build error. Local dev with `workerd` via the Vite plugin also requires the flag — a mismatch between local and production compat scope means the bug only surfaces in production.

3. **`wrangler secret put` is interactive — agents cannot set secrets non-interactively without piping**: First-time secret provisioning (SUPABASE_URL, SUPABASE_KEY) requires manual terminal interaction or a CI/CD secret binding. There is no `wrangler deploy --secret KEY=VALUE` flag. This is the one routine operation that cannot be fully automated from an agent session.

4. **Open Astro 6 bugs become load-bearing on the next feature**: Bug #16553 (`cloudflare:workers` env import + any prerendered route) silently fails builds. The current `output: "server"` config is safe, but adding a static marketing page or a prerendered error boundary triggers it with no fix ETA as of 2026-05-24.

5. **Free tier CPU cap (10ms/request) resets daily not monthly**: Hitting the cap returns opaque 1101 errors until midnight UTC — no graceful maintenance page. At expected ObiTracker scale this is safe, but a traffic spike from a viral dog-training forum post could exhaust the daily budget and take the app offline for hours.

### Pre-Mortem — How This Could Fail

Six months after launch, ObiTracker has quietly stalled on Cloudflare. The initial deploy was fast — `wrangler deploy` worked on the second try after adding `nodejs_compat`. But things unraveled gradually. The GitHub Actions CI was wired using a top-ranked community tutorial that used `wrangler pages deploy`; the mismatch went unnoticed until a background cron feature was prototyped and silently failed — Pages doesn't support Cron Triggers. Refactoring to Workers required rewriting the CI pipeline and re-binding all environment variables, which had been set in the Pages dashboard (a different UI section than Workers). That weekend was lost. Then a `@supabase/ssr` package upgrade introduced a new crypto API call not covered by the existing `nodejs_compat` scope; the error only affected unauthenticated users hitting `/auth/signup` and was invisible in dev because the local wrangler Vite plugin had a slightly different compat date. Tracing it required reading Cloudflare's Workers compatibility changelog — knowledge only discovered after an hour of opaque 500 errors in `wrangler tail`. The cumulative effect: two lost weekends, loss of confidence in the deploy pipeline, and the developer briefly considering migrating to Railway to "start clean."

### Unknown Unknowns

- **`deployment_target: cloudflare-pages` in `tech-stack.md` will route the deploy plan to the wrong command**: `wrangler pages deploy` and `wrangler deploy` produce different build artifacts, use different `wrangler.jsonc` schemas, and write to different Cloudflare products. The deploy plan must explicitly specify Workers, not Pages.

- **`astro:env/server` env vars on Cloudflare are Workers _bindings_, not process env**: Setting `SUPABASE_URL` in a `.env` file does nothing at runtime on Workers. Variables must be declared in `wrangler.jsonc` under `[vars]` (non-secret) or set via `wrangler secret put` (secret). A first deploy commonly fails silently because the developer expected `.env` to work at runtime as it does locally.

- **Preview deployments on Workers are publicly accessible by default**: Workers preview URLs (`*.workers.dev` preview builds) have no authentication. Protecting them requires Cloudflare Access (a separate Zero Trust product), not a simple per-URL password like Vercel/Netlify offer on free tiers.

- **`wrangler rollback` targets Workers deployment history only**: If the project was ever deployed via Pages before the Workers migration, `wrangler rollback` will not find or revert those deployments. The two deployment histories are completely isolated.

- **The free 10ms CPU cap is per-invocation, and the error mode is invisible to users**: A Worker that exceeds its CPU budget returns a Cloudflare 1101 error — a generic "Worker threw an exception" page, not a custom error boundary. The first time it happens in production it will look like a bug in the app, not a resource exhaustion event.

## Operational Story

- **Preview deploys**: Workers preview deployments use `wrangler deploy --env preview` (requires a `[env.preview]` block in `wrangler.jsonc`). Preview URLs are on `*.workers.dev` and are publicly accessible by default — no authentication unless Cloudflare Access is configured separately. Branch-based preview automation requires a GitHub Action that calls `wrangler deploy --env preview` on non-main pushes.

- **Secrets**: `SUPABASE_URL` and `SUPABASE_KEY` live in Cloudflare Workers Secrets, set via `wrangler secret put SUPABASE_URL` (interactive) or pre-seeded in the dashboard under Workers → obitracker → Settings → Variables and Secrets. Non-sensitive env vars (`PUBLIC_*`) go in `wrangler.jsonc` under `[vars]`. Secret rotation: `wrangler secret put <KEY>` prompts for the new value and deploys it; the running Worker picks up new secrets on the next cold start. Secrets are never in `.env` files at runtime.

- **Rollback**: `wrangler rollback` reverts to the immediately previous Workers deployment in under 30 seconds — no rebuild required, it promotes a cached artifact. For a specific version: `wrangler rollback <VERSION_ID>` (get the ID from `wrangler deployments list`). Database migrations (Supabase) do not roll back automatically — a schema migration that shipped with a bad deploy requires a separate Supabase migration revert.

- **Approval**: The following actions require a human in the Cloudflare dashboard: deleting a Workers project, rotating the Cloudflare API token, binding Cloudflare Access policies, and changing the custom domain. The agent may perform unattended: `wrangler deploy`, `wrangler rollback`, `wrangler tail`, `wrangler secret put` (with piped value in CI), and all Cloudflare MCP tools scoped to the Workers project token.

- **Logs**: `wrangler tail` streams live runtime logs in real time from the terminal. Filter by status: `wrangler tail --status=error`. MCP alternative: the Cloudflare MCP server (`mcp.cloudflare.com/mcp`) exposes log-reading tools in structured JSON. For CI log inspection: `wrangler deployments list` shows deploy history with status; per-deploy logs require `wrangler tail` or the dashboard.

## Risk Register

| Risk                                                                               | Source           | Likelihood | Impact | Mitigation                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Deploy wired to `wrangler pages deploy` instead of `wrangler deploy`               | Unknown unknowns | High       | Medium | Deploy plan must explicitly specify `wrangler deploy`; confirm `wrangler.jsonc` uses Workers schema before first deploy                    |
| `@supabase/ssr` auth breaks without `nodejs_compat` flag                           | Devil's advocate | High       | High   | Add `"compatibility_flags": ["nodejs_compat"]` to `wrangler.jsonc` before first deploy; validate in `astro dev` (workerd) not just Node.js |
| `astro:env/server` vars undefined at runtime because dev set them in `.env`        | Unknown unknowns | High       | High   | Document in deploy plan: runtime secrets go in Cloudflare Workers Secrets (`wrangler secret put`), not `.env`                              |
| Astro 6 bug #16553 blocks builds if a prerendered route is added                   | Devil's advocate | Medium     | High   | Keep all routes dynamic (`prerender = false` or `output: "server"`); check issue status before adding any prerendered page                 |
| CPU time limit (10ms/req) causes silent 1101 errors on complex queries             | Devil's advocate | Low        | Medium | Profile training-grid sort/rank logic locally; upgrade to Workers Paid ($5/month) if CPU usage approaches 10ms                             |
| `wrangler secret put` cannot be run non-interactively by agent                     | Devil's advocate | Medium     | Low    | Pre-seed secrets in the Cloudflare dashboard before agent-driven deploys; use `echo "VALUE" \| wrangler secret put KEY` for CI pipelines   |
| Preview URLs are publicly accessible without Cloudflare Access                     | Unknown unknowns | Medium     | Low    | Accept for MVP (no sensitive data in preview builds); add Cloudflare Access if preview builds contain auth-gated data                      |
| Pages vs Workers deployment history isolated — rollback may miss Pages-era deploys | Unknown unknowns | Low        | Low    | Ensure project is Workers-only from day one; never use `wrangler pages deploy`                                                             |
| Free tier daily cap (100k req/day) causes 1101 errors on traffic spike             | Devil's advocate | Low        | Medium | Monitor via Cloudflare Analytics; upgrade to Workers Paid ($5/month) if daily request count approaches 80k                                 |
| Astro 6 bug #15684 crashes builds if Wasm-dependent library is added               | Research finding | Low        | Medium | Avoid Wasm-dependent packages (e.g., Satori for OG images) until bug is resolved; mark affected routes `prerender = false` as workaround   |

## Getting Started

The stack already targets Cloudflare Workers via `@astrojs/cloudflare`. Before the first deploy:

1. **Confirm `nodejs_compat` in `wrangler.jsonc`** — verify `"compatibility_flags": ["nodejs_compat"]` is present. Without it, `@supabase/ssr` auth fails at runtime with a cryptic error.

2. **Target Workers, not Pages** — `wrangler.jsonc` must use the Workers schema (with `[assets]` binding for static files), not the Pages schema (`pages_build_output_dir`). Run `npm run build` and confirm the output is a `_worker.js` bundle under `dist/`, then `wrangler deploy` (not `wrangler pages deploy`).

3. **Set secrets via Wrangler** — `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY` (interactive prompts), or pre-seed them in the Cloudflare dashboard. Do not rely on `.env` at runtime.

4. **Verify the first deploy** — `wrangler deploy` emits a production URL. Hit `/auth/signin` to confirm the Supabase client initializes (validates `nodejs_compat` + secret binding). Check `wrangler tail` for any runtime errors.

5. **Wire GitHub Actions CI** — use `wrangler/action` (the official GitHub Actions wrapper) with `command: deploy` and `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` as repository secrets. Scope the API token to "Workers Scripts: Edit" for the ObiTracker project only — not a global token.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (covered in the deploy plan)
- Production-scale architecture (multi-region, HA, DR)
