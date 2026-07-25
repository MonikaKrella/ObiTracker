<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing: Data Integrity at the API Layer

- **Plan**: context/changes/testing-data-integrity-at-the-api-layer/plan.md
- **Scope**: All Phases (2 of 2)
- **Date**: 2026-06-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical | 4 warnings | 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — createTestUser can permanently orphan auth users

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/tests/helpers/db.ts:28–62
- **Detail**: Two related gaps. First: the function calls admin.auth.admin.createUser() at line 28 but has no try/finally guard around the subsequent signIn and client construction steps. If signInWithPassword fails (network error, auth misconfiguration), the function throws before returning a cleanup handle — the created auth.users row is permanently orphaned with no way for the test runner to delete it. Second: line 48 reads signInData.session.access_token without a null check. Supabase can return session: null on a successful signInWithPassword call (e.g., if email confirmation is required). This crashes with a TypeError and again leaves the user orphaned.
- **Fix**: Wrap lines 39–62 in a try/catch that deletes the newly created user before re-throwing. Add a null-guard on session before reading access_token.
  - Strength: Eliminates the orphan class entirely. Pattern already used — admin.auth.admin.deleteUser is already called in the returned cleanup, same call.
  - Tradeoff: ~6 lines added to createTestUser; no functional change on the happy path.
  - Confidence: HIGH — the gap is structural: createUser succeeds → subsequent step throws → no cleanup handle ever returned.
  - Blind spot: Supabase's local emulator may auto-expire test users; verify whether that applies to auth.users rows too.
- **Decision**: FIXED — try/catch guard added around post-createUser steps (db.ts:39–68); session null-checked (db.ts:47–49).

### F2 — Silent empty-string fallback hides missing env vars

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/tests/helpers/db.ts:5–6
- **Detail**: SERVICE_ROLE_KEY and ANON_KEY both fall back to "" when the env var is unset. createAdminClient() silently creates a Supabase client that fails every call with an opaque "Invalid API key" / 401 error rather than a clear startup failure.
- **Fix**: Replace `?? ""` with explicit throws: `if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required — run npx supabase status to get the value");`
- **Decision**: FIXED — explicit throws added at module level (db.ts:7–12).

### F3 — No guard against running integration tests on a remote Supabase

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/tests/helpers/db.ts:4 / vitest.config.ts:14
- **Detail**: SUPABASE_URL defaults to "http://127.0.0.1:54321" only when the env var is absent. loadEnv in vitest.config.ts loads whatever SUPABASE_URL is in .env. If a developer has .env pointed at a staging or production URL, npm run test silently creates and deletes real users in that remote environment. The service-role key gives full RLS bypass.
- **Fix A ⭐ Recommended**: Assert the URL is local in db.ts on startup: `const url = new URL(SUPABASE_URL); if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new Error(\`Integration tests must target local Supabase — got ${SUPABASE_URL}\`);`
  - Strength: One-liner guard catches the mistake at module load; no config changes needed. Plan explicitly says "Local Supabase must be running" — this makes that constraint machine-enforced.
  - Tradeoff: Prevents running intentionally against a remote test env. But that use case would require a separate CI runner, not npm run test.
  - Confidence: HIGH
  - Blind spot: Doesn't catch a remote URL served via a localhost tunnel.
- **Fix B**: Add a separate vitest project config for integration tests
  - Strength: Cleaner separation; integration tests could have their own setup file.
  - Tradeoff: More infrastructure; overkill for 3 test files.
  - Confidence: LOW — introduces complexity the plan deferred.
  - Blind spot: Still needs the URL assertion from Fix A internally.
- **Decision**: SKIPPED

### F4 — Promise.all in concurrent test conflates thrown errors with "unticked"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/tests/data-integrity.test.ts:60–65
- **Detail**: Promise.all rejects if either toggleTrainingLog throws. The test asserts results.sort() equals ["ticked","unticked"], which implicitly requires the service to always return a string and never throw — even on a unique-constraint collision. If the service ever propagates a DB error, Promise.all rejects with a non-descriptive error rather than a useful assertion failure.
- **Fix**: Replace Promise.all with Promise.allSettled and assert on status + value: both should have status "fulfilled" and values sorted to ["ticked","unticked"]. A rejection surfaces as status "rejected" and an explicit, readable failure.
- **Decision**: FIXED — replaced with Promise.allSettled; explicit status + values assertions added (data-integrity.test.ts:60–66).

### F5 — cleanup() throws on deleteUser error, masking original test failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/tests/helpers/db.ts:55–59
- **Detail**: cleanup() throws if admin.auth.admin.deleteUser returns an error. When a test fails and afterEach runs cleanup(), a secondary deleteUser failure causes Vitest to report two errors — masking the original failure. Accumulated orphan users can also cause confusing behavior in later runs.
- **Fix**: Change the throw to a console.warn so cleanup is best-effort: `if (error) console.warn("[test cleanup] Failed to delete test user ${userId}:", error.message);`
- **Decision**: SKIPPED — user prefers throw to keep cleanup failures visible as hard errors.

### F6 — Risk tag in test name deviates from existing naming pattern

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/tests/data-integrity.test.ts:56
- **Detail**: `it("Risk #3: concurrent duplicate toggles…")` embeds a risk-register tag in the test name. highlight.test.ts and training-grid.test.ts use pure behavior descriptions with no traceability tags. Risk tags in it() strings cause churn when the risk numbering changes.
- **Fix**: Move the tag to a comment above the it() block: `// Covers Risk #3 (test-plan.md §3)` then `it("concurrent duplicate toggles never produce two log rows...")`
- **Decision**: FIXED — tag moved to comment above it() block (data-integrity.test.ts:56–57).

### F7 — CLAUDE.md bundled into Phase 1 commit (unrelated course-module update)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit 31f1459 — CLAUDE.md (88 insertions, 27 deletions)
- **Detail**: CLAUDE.md was updated from Lesson 4 (E2E/Playwright) content to Lesson 3 (Hooks) content and bundled into the Phase 1 data-integrity commit. Unrelated to the testing plan, not in the commit message's touched-file set.
- **Fix**: No code change needed. Awareness only: future course-module CLAUDE.md updates should be their own commit (`chore: update CLAUDE.md for Lesson N`) rather than bundled with feature work.
- **Decision**: SKIPPED — acknowledged, no action needed.

### F8 — not.toBe(2) less expressive than toBeLessThanOrEqual(1)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/tests/data-integrity.test.ts:75
- **Detail**: `expect(count).not.toBe(2)` is technically correct for 2 concurrent callers but doesn't communicate the intent (no more than 1 row for a given cell) and wouldn't catch a corrupted count ≥ 3.
- **Fix**: `expect(count).toBeLessThanOrEqual(1)` — makes the constraint and intent self-documenting.
- **Decision**: FIXED — replaced not.toBe(2) with toBeLessThanOrEqual(1) (data-integrity.test.ts:78).
