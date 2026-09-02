---
project: ObiTracker
checked_at: 2026-09-02T00:00:00Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 15
  moderate: 4
  low: 3
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 8
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 15 HIGH, 4 MODERATE, 3 LOW
Direct vs transitive: 2 of 15 HIGH findings are direct dependencies (astro, wrangler); the rest are transitive. All 22 findings report a fix available via npm's dependency resolver.
```

#### HIGH findings

- **astro** (direct) — HIGH advisory in current `astro@6.3.1` range. Fix: `npm audit fix` (resolves to a patched 6.x release; already available per `npm outdated`, wanted `6.4.8`).
- **wrangler** (direct) — HIGH advisory in current `wrangler@4.94.0` range. Fix: `npm audit fix` (resolves within 4.x; wanted `4.128.0`).
- **@cloudflare/vite-plugin, miniflare, ws** (transitive, via wrangler/miniflare) — `ws` memory-exhaustion DoS (CWE-400/770/1050, CVSS 7.5) in the `8.0.0–8.20.1` range. Fix: pulled in by the wrangler bump above.
- **vite, browserslist, brace-expansion, fast-uri, js-yaml, nanoid, postcss, sharp, svgo, undici** — transitive HIGH advisories, all with `fixAvailable: true`. Fix: `npm audit fix` after the direct-dependency bumps above; re-run `npm audit` to confirm no HIGH findings remain.

#### MODERATE and LOW findings

- 4 MODERATE — `yaml`, `yaml-language-server`, `@astrojs/language-server`, `volar-service-yaml` (all transitive, editor/language-server tooling, not shipped runtime code). Fix available.
- 3 LOW — `@babel/core`, `esbuild`, `postcss-selector-parser` (transitive, build tooling). Fix available.

### Outdated Dependencies

```
Packages with major version gaps (2+ majors behind): 1
```

- **typescript**: `5.9.3` → `7.0.2` (2 major versions behind: 6.x, 7.x). Not urgent — the project pins `^5.9.3` intentionally and Astro's own tsconfig presets are validated against TS 5.x; treat as a deliberate future upgrade, not a health gap.

A cluster of packages are 1 major version behind (`astro` 6→7, `@astrojs/cloudflare` 13→14, `@astrojs/react` 5→6, `eslint` 9→10, `lint-staged` 16→17) — normal drift, not flagged individually per the "don't report every minor bump" rule, but worth a periodic `npm outdated` pass.

## Test Suite

```
Test runner: Vitest (unit) + Playwright (E2E)
Tests found: 20 unit test suites / 49 unit tests (Vitest); E2E suite present under tests/e2e/ (not dry-run — Playwright needs a running dev server, out of scope for this read-only check)
Test execution: failing (locally, in this environment)
```

```
Configuration: vitest.config.ts, playwright.config.ts
Framework: Vitest 4.1.9, Playwright 1.61.1
```

**Finding, not a broken suite**: 12 of 49 unit tests fail locally with `AuthRetryableFetchError: fetch failed` inside `tests/helpers/db.ts` → `createTestUser` → `GoTrueAdminApi.createUser`. This is every test that needs a live Supabase Auth admin API — i.e., tests require `supabase start` (a local Supabase stack) running first. CI (`.github/workflows/ci.yml`) already does this correctly (`supabase start` + exported `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` before `npm run test`), so the test suite itself is healthy — this is a **local-prerequisite documentation gap**: `CLAUDE.md` doesn't tell a contributor (or an agent) that `supabase start` must run before `npm run test` locally. One test (`data-integrity.test.ts`, "userCleanup is not a function") is a knock-on `afterEach` failure from the same root cause, not a second bug.

The 37 passing tests (highlight-ranking logic, date-window math, training-grid state helpers) run with no external dependency and all pass — these cover the green/red highlight business rule and tick/untick invariants called out in `CLAUDE.md`.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                                                                                                                               |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint       | ✓      | `npm run lint` (ESLint, type-checked rules)                                                                                                         |
| Test       | ✓      | `npm run test` (Vitest), preceded by `supabase start` + credential export                                                                           |
| Build      | ✓      | `npm run build`, separate `e2e` job runs `npm run test:e2e` (Playwright)                                                                            |
| Type check | ~      | No standalone `astro check` / `tsc --noEmit` step — relies on ESLint's typed-linting plus `npx astro sync` (type generation only, not verification) |
| Security   | ✗      | No `npm audit`, Dependabot, or equivalent scan step — the 15 HIGH findings above would not be caught by CI today                                    |

## Configuration

### Medium severity

- **No CI type-check step** — `@astrojs/check` is already a dependency but has no `package.json` script or CI step invoking it (`astro check` / `tsc --noEmit`). Fix: add `"typecheck": "astro check"` to `package.json` scripts and a corresponding step in `ci.yml`'s `ci` job (after `npx astro sync`, before `npm run test`).
- **No dependency vulnerability scanning in CI** — the 15 HIGH advisories found in this check would pass CI unnoticed today. Fix: add a `npm audit --audit-level=high` step to `ci.yml`, or enable GitHub Dependabot alerts (`.github/dependabot.yml`) for automated PRs.

### Low severity

- **`.editorconfig`** — missing. Low impact given Prettier is already configured and enforced via lint-staged, but it standardizes indentation/EOL for editors that don't run Prettier on every keystroke. Fix: add a minimal `.editorconfig`.
- **`package.json` `name`** — still `"10x-astro-starter"`, left over from the starter template; the project is ObiTracker. Fix: update to `"obitracker"` (cosmetic, but shows up in `npm outdated`/`npm audit` output and any published metadata).

`.prettierrc.json`, `eslint.config.js`, `tsconfig.json` (strict), `.gitignore`, and `.env.example` are all present and populated — no gaps there.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready (4/4 quality gates passed, 0 failed)
```

No quality-gate gaps were identified in the stack assessment, so there is nothing to reinforce or mitigate on that axis. Two documentation-currency notes carry forward instead:

| Stack-Assess Finding                                                                                | Health-Check Finding                                                                                                                                                                        | Status                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` said "No test suite is configured" while a full Vitest/Playwright suite already existed | `CLAUDE.md`'s `## Commands` section now correctly lists `npm run test` and `npm run test:e2e`                                                                                               | **Resolved** — the recommended fix from stack-assess has already been applied                              |
| _(not raised by stack-assess — new finding)_                                                        | `CLAUDE.md` still doesn't mention that `npm run test` requires `supabase start` first; a contributor or agent running tests locally without it sees 12 failures that look like broken tests | **New gap** — same theme (test-tooling documentation currency), one step further than stack-assess checked |

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Patch HIGH security vulnerabilities in direct dependencies

**Impact**: `astro` and `wrangler` are the SSR framework and deploy tool this app runs on; an agent extending API routes or Cloudflare config on a vulnerable version compounds risk with every new surface it adds.
**Severity**: high
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm audit fix
npm audit --json | node -e "const a=JSON.parse(require('fs').readFileSync(0));console.log(a.metadata.vulnerabilities)"
```

Re-run `npm run test` and `npm run build` after, since `astro`/`wrangler` are load-bearing for SSR and the Cloudflare entrypoint.

### 2. Document the local Supabase prerequisite for `npm run test`

**Impact**: without this, a contributor or an agent sees 12/49 unit tests fail with an opaque `AuthRetryableFetchError` and may conclude the test suite (or their own change) is broken, when the real cause is a missing local service.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: add one line to `CLAUDE.md`'s `## Commands` section under `npm run test`:

```markdown
- `npm run test` — Vitest unit tests (`tests/unit/`). Requires a local Supabase stack: run `supabase start` first (see CI job `.github/workflows/ci.yml` for the exact env-var export pattern).
```

### 3. Add dependency vulnerability scanning to CI

**Impact**: today, HIGH-severity advisories like the ones found in this check (astro, wrangler, ws) can merge to `master` without CI ever flagging them.
**Severity**: medium
**Effort**: moderate (15–30 min)
**Fix**: add to the `ci` job in `.github/workflows/ci.yml`, after `npm ci`:

```yaml
- run: npm audit --audit-level=high
```

Optionally also add `.github/dependabot.yml` for automated update PRs.

### 4. Add an explicit type-check step

**Impact**: `@astrojs/check` is already installed but never invoked — the project relies entirely on ESLint's typed-linting to catch type errors, which doesn't cover everything `astro check` verifies across `.astro` files (e.g. unused CSS selectors, prop-type mismatches in component islands).
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: add to `package.json` scripts:

```json
"typecheck": "astro check"
```

and a step in `ci.yml`'s `ci` job after `npx astro sync`:

```yaml
- run: npm run typecheck
```

### 5. Add `.editorconfig`

**Impact**: minor — Prettier already enforces formatting via lint-staged, but `.editorconfig` covers editors/IDEs before a save-time hook fires.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add a standard `.editorconfig` (2-space indent, LF line endings, UTF-8, trim trailing whitespace) matching the existing `.prettierrc.json` settings.

### 6. Update stale `package.json` project name

**Impact**: cosmetic, but `"10x-astro-starter"` leaking into `npm audit`/`npm outdated`/build metadata is a small but visible sign of unmaintained scaffolding.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: change `"name": "10x-astro-starter"` to `"name": "obitracker"` in `package.json`.

### Addressed in upcoming lessons (Category B)

### Missing AGENTS.md

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: build a dedicated agent-onboarding document (or extend `CLAUDE.md`'s existing coverage) with the right content and structure — generating one now would be premature since `CLAUDE.md` already carries most of that role for this project.

## Summary

Health status: **needs-attention**

ObiTracker's stack foundation is strong — a clean lockfile, a working test runner with 37/49 unit tests passing on logic that has no external dependency (including the highlight-ranking business rule and tick-toggle invariants), and a CI pipeline that already covers lint, test, build, and E2E with correctly-provisioned local Supabase credentials. The gaps are all addressable in well under an hour combined: 15 HIGH (0 CRITICAL) dependency advisories with fixes already available via `npm audit fix`, no CI-level security scanning to catch the next round of these, no explicit type-check step despite the tooling being installed, and a documentation gap where `CLAUDE.md` doesn't tell a contributor that local tests need `supabase start` first — which is exactly what made 12 tests look broken during this check when they weren't.

Next step: address the Category A fixes above (start with `npm audit fix` and the `CLAUDE.md` test-prerequisite note — both are under 5 minutes), then proceed to agent onboarding.
