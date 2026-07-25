# CI Error Summary — "permission denied for table dogs"

All 12 integration tests fail in CI with `Unknown Error: permission denied for table dogs`.
Tests pass locally. Branch: `tests`. Latest commit with diagnostic step: `02ae461`.

---

## Root symptom

PostgREST returns HTTP 403 "permission denied for table dogs" for every query made
through `authClient` (the authenticated-user Supabase client returned by `createTestUser`).
The `anon` PostgreSQL role has no SELECT on `dogs` (explicitly revoked in migrations), so
this error pattern means PostgREST is treating the request as `anon`, not `authenticated`.

---

## What works

- Admin (service-role) seeding: `seedDog`, `seedElement`, `admin.auth.admin.createUser` — all succeed in CI. The `beforeEach` block completes; errors appear in test bodies.
- Local runs: all 49 tests pass against the local Supabase stack.
- Explicit grants migration (`20260718000001_explicit_grants.sql`) was added and verified locally via `psql`.
- Curl diagnostic (run in an earlier CI debug step): `Authorization: Bearer <userJWT>` to PostgREST returned `[]` (success), confirming PostgREST does accept user JWTs correctly when given one.

---

## Approaches tried (all failed in CI, all pass locally)

### Approach 1 — `global.fetch` override (commit `2c3406c`)

```ts
const authClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: (url, options) => {
      const headers = new Headers(options?.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      return fetch(url, { ...options, headers });
    },
  },
});
```

**Why it should work (per source):** `fetchWithAuth` in supabase-js calls `global.fetch` as its
inner transport after setting auth headers; a custom `global.fetch` that re-sets `Authorization`
should override the ANON_KEY fallback.

**Result:** Same "permission denied" in CI. Passed locally.

---

### Approach 2 — `accessToken` option (commits `fdd86e8` / `93acbb5`)

```ts
const authClient = createClient(SUPABASE_URL, ANON_KEY, {
  accessToken: () => Promise.resolve(accessToken),
});
```

**Why it should work:** `SupabaseClient._getAccessToken()` checks `this.accessToken` first
(line 524 of `index.cjs`). If set, it calls it and returns the result directly — bypassing
`auth.getSession()` entirely. `fetchWithAuth` then sets `Authorization: Bearer <userJWT>`
without ever touching the ANON_KEY fallback.

**Result:** Same "permission denied" in CI. Lint error (`require-await`) fixed in `93acbb5`.
Passed locally.

---

### Approach 3 — direct signIn, default `persistSession` (commit `c774f49`)

```ts
const authClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false }, // persistSession defaults to true
});
await authClient.auth.signInWithPassword({ email, password });
// guard: throws if getSession() returns null after signIn
const { data: gs } = await authClient.auth.getSession();
if (!gs.session) throw new Error("getSession() returned null after signIn");
```

**Why it should work:** In Node.js (no `localStorage`), GoTrueClient uses
`memoryLocalStorageAdapter` for session storage when `persistSession: true`.
After `signInWithPassword`, the session is in memory; `getSession()` returns it;
`_getAccessToken()` returns `session.access_token`; `fetchWithAuth` sets the correct
`Authorization` header — standard Supabase auth flow.

**Result:** Still failing in CI (user's latest report). Passed locally.

---

## Key difference between local and CI environments

|                             | Local                                      | CI                                                               |
| --------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `SUPABASE_KEY`              | `sb_publishable_...` (opaque, from `.env`) | `eyJ...` (JWT, from `supabase status -o json .ANON_KEY`)         |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` (opaque, from `.env`)      | `eyJ...` (JWT, from `supabase status -o json .SERVICE_ROLE_KEY`) |
| `.env` file present         | Yes                                        | No (gitignored)                                                  |
| Supabase CLI                | local version                              | `version: latest` in CI workflow                                 |

The `.env` file is **not committed** (gitignored). CI extracts keys via
`jq -r '.ANON_KEY'` / `jq -r '.SERVICE_ROLE_KEY'` from `supabase status -o json`.

---

## Diagnostic step added (commit `02ae461`)

A `node -` heredoc step runs **before** `npm run test` in CI and prints:

1. Key prefix + length (identifies format)
2. `createUser` result
3. `signInWithPassword` result + token prefix
4. `getSession()` result after signIn (`HAS SESSION` vs `NULL SESSION`)
5. Raw `fetch` to `/rest/v1/dogs` with user JWT — HTTP status + body
6. `admin.from("dogs")` query result (service-role path)
7. `authClient.from("dogs")` query result (authenticated path)

**Next step:** run CI, paste the "Diagnose auth + grants" step output. The output will
definitively identify whether the issue is:

- **(a) JWT not reaching PostgREST** — raw fetch works but authClient query fails
- **(b) JWT rejected by PostgREST** — raw fetch also returns 403
- **(c) Session not stored** — `getSession()` prints `NULL SESSION`
- **(d) Missing grants** — both raw fetch and authClient fail; admin query also fails

---

## Files changed in this investigation

- `src/lib/tests/helpers/db.ts` — `createTestUser` rewritten three times (see above)
- `supabase/migrations/20260718000001_explicit_grants.sql` — explicit `GRANT` to `authenticated`
- `.github/workflows/ci.yml` — added `supabase/setup-cli@v1`, `supabase start`, credential
  export step, and the diagnostic `node` step
- `.claude/settings.json` — prettier hook: added `--ignore-unknown` to handle `.sql` files
  (local only, gitignored)

---

## Resolution

The diagnostic step (commit `02ae461`) revealed the opposite of what approaches 1–3 assumed:

```
admin dogs query:      ERROR:permission denied for table dogs   ← service_role, FAILS
authClient dogs query: ok rows=[]                                ← user JWT, SUCCEEDS
```

`authClient` (the user-JWT path all three prior fixes targeted) was never broken. The actual
gap: `service_role` has `BYPASSRLS`, which skips row-security _policies_ only — it does not
exempt a role from ordinary Postgres table-level `GRANT`s. In a freshly-provisioned CI database,
`service_role` had no explicit `GRANT` on `dogs` / `training_elements` / `training_logs`, exactly
the same class of bug `20260718000001_explicit_grants.sql` had already fixed for `authenticated`
— that migration just didn't extend the same treatment to `service_role`.

This also resolves the earlier "seeding succeeds, test bodies fail" observation: `seedDog` /
`seedElement` use `.insert().select().single()`, satisfied by Postgres via `INSERT ... RETURNING`,
which only requires `INSERT` privilege. The genuine `admin.from(...).select(...)` count-verification
queries in `data-integrity.test.ts` and one test in `cross-account-authorization.test.ts` are where
the missing `SELECT` grant actually surfaced.

**Fix:** `supabase/migrations/20260719000001_service_role_table_grants.sql` — mirrors
`20260718000001_explicit_grants.sql` but grants `service_role` instead of `authenticated`
(`USAGE` on schema `public`; `SELECT/INSERT/UPDATE/DELETE` on `dogs`/`training_elements`;
`SELECT/INSERT/DELETE` on `training_logs`).

Verified locally via `supabase db reset` (fresh migration-only apply, matching how CI's
`supabase start` provisions the database) followed by `npm run test` — 49/49 pass.

The diagnostic step in `.github/workflows/ci.yml` was removed after use; `npm run test` is
the real verification.

**Approaches 1–3 (the `authClient`/JWT rewrites) were not wrong to try** — they were a
reasonable hypothesis given the error message — but they addressed a layer that was never
the actual fault. Left in place (`c774f49`'s direct-signIn form) since it's a correct, simpler
implementation of `createTestUser`, just not the fix for this bug.
