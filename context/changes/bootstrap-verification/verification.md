---
bootstrapped_at: 2026-05-23T14:47:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: obitracker
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: obitracker
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

ObiTracker is a solo, after-hours web app with a 3-week MVP timeline and email+password auth as the only technology-forcing feature. The 10x-astro-starter is the recommended default for (web-app, js) and delivers auth, PostgreSQL database, and Cloudflare edge deployment through Supabase and Cloudflare Pages — all wired together without manual integration work. The starter clears all four agent-friendly gates: TypeScript is project-wide (typed), Astro file-based routing and React islands follow predictable conventions (convention-based), Astro and Supabase both have strong representation in model training data (popular), and docs are current and link-able (well-documented). A short timeline and solo context favor battle-tested and batteries-included; this starter satisfies both. CI runs on GitHub Actions with auto-deploy on merge to main — the standard flow for a solo project of this scope.

## Pre-scaffold verification

| Signal      | Value                                                     | Severity | Notes                                |
| ----------- | --------------------------------------------------------- | -------- | ------------------------------------ |
| npm package | not run (cmd_template uses git clone, not npm create)     | n/a      | git-clone strategy; npm step skipped |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | 6 days ago; from card docs_url       |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: clone starter repo without keeping its git history, then move files up
**Exit code**: 0
**Files moved**: 19
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (existing root CLAUDE.md wins; scaffold copy sidelined)
**.gitignore handling**: moved silently (no .gitignore existed in root)
**.bootstrap-scaffold cleanup**: deleted (empty after move-up)

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0

#### HIGH findings

- **devalue** (transitive, via Svelte ecosystem)
  - Advisory: GHSA-77vg-94rm-hx3p — Svelte devalue: DoS via sparse array deserialization
  - Version range affected: 5.6.3 – 5.8.0
  - CVSS: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H), CWE-770
  - Fix available: yes (`npm audit fix`)

#### MODERATE findings (log only)

- **@astrojs/check** (direct) — via @astrojs/language-server → volar-service-yaml
- **@astrojs/language-server** (transitive) — via volar-service-yaml → yaml-language-server
- **@cloudflare/vite-plugin** (transitive) — via miniflare, wrangler, ws
- **miniflare** (transitive) — via ws (uninitialized memory disclosure)
- **volar-service-yaml** (transitive) — via yaml-language-server → yaml
- **wrangler** (direct) — via miniflare → ws
- **ws** (transitive) — GHSA-58qx-3vcg-4xpx: Uninitialized memory disclosure (CVSS 4.4)
- **yaml** (transitive) — GHSA-48c2-rrv3-qjmp: Stack overflow via deeply nested YAML (CVSS 4.3)
- **yaml-language-server** (transitive) — via yaml

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` — the starter shipped its own CLAUDE.md; your existing lesson CLAUDE.md was preserved. Merge anything useful from the scaffold copy.
- Run `npm audit fix` to resolve the fixable findings (9 moderate, 1 high). The `devalue` HIGH and most MODERATs are dev-tooling transitive deps; low runtime risk but worth patching.
- Add your Supabase project credentials to `.env.example` → rename to `.env` and fill in the values.
