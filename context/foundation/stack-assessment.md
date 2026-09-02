---
project: ObiTracker
assessed_at: 2026-09-02T00:00:00Z
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript (strict)
  framework: Astro 6 (SSR) + React 19 islands
  build_tool: Vite (via Astro) + Tailwind 4
  test_runner: Vitest (unit) + Playwright (E2E)
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: Cloudflare Workers
gates_passed: 4
gates_failed: 0
---

## Stack Components

**Language**: TypeScript, in strict mode via `astro/tsconfigs/strict` (`tsconfig.json`). Path alias `@/*` → `./src/*`.

**Framework**: Astro 6 (`astro: ^6.3.1`) running in `output: "server"` (SSR) mode, deployed via `@astrojs/cloudflare`. React 19 (`react: ^19.2.6`) is used only for interactive islands, per project convention (no `"use client"` directives — Astro's own island model handles this).

**Build tool**: Vite, wrapped by Astro's own build pipeline (no standalone `vite.config.*` — Astro owns it via `astro.config.mjs`). Tailwind 4 (`tailwindcss: ^4.2.4`) integrates through the official `@tailwindcss/vite` plugin.

**Test runner**: Vitest 4 for unit tests (`vitest.config.ts`, `tests/unit/`) and Playwright 1.61 for E2E (`playwright.config.ts`, `tests/e2e/`, `tests/helpers/`). Both are wired into `package.json` scripts (`test`, `test:e2e`).

**Package manager**: npm, evidenced by `package-lock.json` (no `yarn.lock`, `pnpm-lock.yaml`, or `bun.lockb` present).

**CI/CD**: GitHub Actions (`.github/workflows/ci.yml`).

**Deployment**: Cloudflare Workers via `wrangler.jsonc` (`wrangler: ^4.90.0`), with SSR entrypoint `@astrojs/cloudflare/entrypoints/server` and `nodejs_compat` enabled.

**Instruction files**: `CLAUDE.md` at the repo root — detailed, with commands, architecture notes, conventions, and a project-specific skill workflow section.

## Quality Gate Assessment

| Component   | Typed | Convention | Training Data | Documented | Verdict |
| ----------- | ----- | ---------- | ------------- | ---------- | ------- |
| Language    | ✓     | —          | —             | —          | pass    |
| Framework   | —     | ✓          | ✓             | ✓          | pass    |
| Build tool  | —     | ✓          | ✓             | ✓          | pass    |
| Test runner | —     | —          | ✓             | ✓          | pass    |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Language — Typed: pass.** `tsconfig.json` extends `astro/tsconfigs/strict`, the strictest of Astro's three bundled configs. TypeScript is used end-to-end (`.ts`/`.tsx`/`.astro` files), and the project convention already mandates zod validation at API boundaries (`CLAUDE.md`: "validate input with zod"), which reinforces typed contracts even across the network boundary. No gaps.

**Framework — Convention-based: pass.** Astro is a file-based-routing, island-architecture framework — one of the explicit "passes" examples in the agent-friendly criteria doc. The project layers its own conventions on top (documented in `CLAUDE.md`): `src/lib/` and `src/lib/services/` for business logic, `src/components/ui/` for shadcn "new-york" components, `src/components/hooks/` for React hooks, `src/types.ts` for shared types, uppercase named exports (`GET`/`POST`) for API routes. This is a convention-rich codebase both at the framework level and the project level.

**Framework — Popular in training data: pass.** Astro and React are both named directly in the criteria doc's pass examples, assessed within the JS/TS language family. React 19 is at the top tier of any language family's training-data volume; Astro is a well-established, frequently-documented meta-framework (multiple major versions, large plugin ecosystem).

**Framework — Well-documented: pass.** Astro (docs.astro.build) and React (react.dev) both ship current, versioned official docs with runnable examples that track the installed major version (Astro 6, React 19).

**Build tool — Convention-based: pass.** Vite's configuration surface is absorbed into `astro.config.mjs` rather than hand-assembled — there is no separate `vite.config.*` to keep in sync, which removes a common source of config drift. Tailwind 4 is wired through its official first-party Vite plugin rather than a custom PostCSS pipeline.

**Build tool — Popular in training data / Well-documented: pass.** Vite is the dominant JS/TS build tool in current training data and has versioned docs at vite.dev; Tailwind 4 has versioned docs at tailwindcss.com, including its v4 migration notes.

**Test runner — Popular in training data / Well-documented: pass.** Vitest and Playwright are both mainstream, heavily-documented choices in the JS/TS ecosystem, each with versioned official docs (vitest.dev, playwright.dev) and large public example corpora.

## Gaps & Compensation

No quality gate failed for any detected component — this is a fully agent-friendly stack by the four criteria, and no CLAUDE.md/AGENTS.md compensation entries are required on that basis.

One documentation-currency gap was found during detection, worth flagging even though it sits outside the four gates: **`CLAUDE.md` states "No test suite is configured — do not add one unless asked,"** but the repository already has a configured, populated test suite — `vitest.config.ts`, `tests/unit/`, `playwright.config.ts`, `tests/e2e/`, `tests/helpers/`, and `npm run test` / `npm run test:e2e` scripts — added in recent commits (per git history: Playwright bootstrap and E2E hardening work). A stale instruction file that says a test suite doesn't exist is worse than no instruction at all — it actively steers an agent away from running or extending real tests that are already there.

### Recommended Instruction File Additions

Replace the current testing line in `CLAUDE.md`'s `## Commands` section:

```markdown
## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run test` — Vitest unit tests (`tests/unit/`)
- `npm run test:e2e` — Playwright E2E tests (`tests/e2e/`; see the `/10x-e2e` skill for the authoring workflow)

Pre-commit hooks (husky + lint-staged) run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

Unit tests (Vitest) and E2E tests (Playwright) are both configured and populated under `tests/`. Follow existing patterns in `tests/unit/` and `tests/e2e/` rather than introducing a new test runner or convention.
```

This removes the contradiction and points the agent at the real locations (`tests/unit/`, `tests/e2e/`, `tests/helpers/`) instead of leaving it to infer them from scratch.

## Summary

**Verdict: ready.** Every detected component — TypeScript (strict), Astro 6 SSR + React 19 islands, Vite/Tailwind 4, and Vitest/Playwright — passes all four agent-friendly quality gates with no compensation needed. This is a strong foundation for the brownfield change scoped in `context/foundation/prd-v2.md` (password reset, competition-results tracking, dog rename, a `TrainingBoard` domain service, and training-element-to-exercise linking): the typed, convention-heavy stack gives an agent clear boundaries to extend (new API routes under the existing uppercase-export + zod pattern, new domain logic under `src/lib/services/`, new Supabase migrations following the existing RLS-per-operation convention) without needing new scaffolding conventions invented mid-change.

The one real finding is not a stack gap but a documentation gap: `CLAUDE.md` is out of date about test tooling that already exists in the repo. Fixing that (see the ready-to-paste block above) costs one edit and removes a standing source of confusion for any agent — including this one — working on the FR-017/FR-018 highlight-service refactor, which is exactly the kind of change a real test suite should be guarding.

**Next step**: `/10x-health-check` — with the stack itself scoring clean, the health check can focus on dependency freshness, security posture, and whether the existing CI pipeline actually runs the Vitest/Playwright suites now confirmed to exist.
