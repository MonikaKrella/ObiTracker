---
title: ObiTracker — Anti-Corruption Layer Refactor Plan (Supabase Auth `User`)
created: 2026-08-17
type: refactor-plan
---

# ObiTracker — Anti-Corruption Layer Refactor Plan

This is a **plan only**. No production code is modified by this document.

## Step 0 — Context

**Documents consulted**: `context/foundation/prd.md` (locked, `status: draft`), `context/foundation/tech-stack.md`,
`CLAUDE.md`. No document declares Supabase (or any sub-package of it) as intentionally interchangeable — grepping
`context/foundation/**` for `replac|interchang|swap|vendor|lock-in|abstract|decoupl` returns no hit that discusses
vendor swap-ability. `tech-stack.md:24` instead argues the **opposite** intent: Supabase was picked because it
"delivers auth, PostgreSQL database, and Cloudflare edge deployment... all wired together without manual
integration work" — the stated goal is integration convenience for a solo, 3-week MVP, not replaceability.
Because no document promises interchangeability, Step 2's classification below is argued from structural leak
signals (blast radius, usage/surface mismatch, invisibility of the coupling) rather than a broken documented
promise.

**Stack** (`package.json`): Astro 6 SSR (`output: "server"`, deployed to Cloudflare Workers), React 19 islands,
`@supabase/supabase-js` 2.99.1 + `@supabase/ssr` 0.10.3 for auth/data, Zod for input validation, Tailwind 4 /
shadcn/ui for UI. No test suite configured.

**Layers** (by inspection of `src/`):

- **Pages** (`src/pages/**/*.astro`) — SSR route shells, read `Astro.locals`.
- **API routes** (`src/pages/api/**/*.ts`) — `APIRoute` handlers, read `context.locals`, call services.
- **Middleware** (`src/middleware.ts`) — runs on every request, resolves the Supabase client and the session user,
  populates `context.locals`.
- **Services** (`src/lib/services/*.ts`) — thin data-access functions, each takes a `SupabaseClient` param.
- **React islands** (`src/components/**/*.tsx`) — client-side interactivity; confirmed to contain **zero**
  `@supabase/*` imports (checked below).
- **Domain types** (`src/types.ts`) — plain interfaces (`Dog`, `TrainingElement`, `TrainingLog`), no library types.
- **Ambient types** (`src/env.d.ts`) — global `App.Locals` declaration, read implicitly by every page/route.

## Step 1 — Identified leaky dependencies

Grep for `from "@supabase` / `import("@supabase` across `src/` returns exactly these five lines:

```
src/env.d.ts:3:    user: import("@supabase/supabase-js").User | null;
src/lib/supabase.ts:1:import { createServerClient, parseCookieHeader } from "@supabase/ssr";
src/lib/services/training-logs.ts:1:import type { SupabaseClient } from "@supabase/supabase-js";
src/lib/services/dogs.ts:1:import type { SupabaseClient } from "@supabase/supabase-js";
src/lib/services/training-elements.ts:1:import type { SupabaseClient } from "@supabase/supabase-js";
```

Two distinct leaks follow from this:

### Leak A — `SupabaseClient` threaded through the service layer

`src/lib/services/dogs.ts:1`, `src/lib/services/training-elements.ts:1`, `src/lib/services/training-logs.ts:1` each
`import type { SupabaseClient } from "@supabase/supabase-js"` and take it as the first parameter of every exported
function (14 call sites total: `dogs.ts:8,24,35,54,72`; `training-elements.ts:10,32,60,97,124,150,177`;
`training-logs.ts:13,41`). The concrete Postgrest query-builder chain (`.from().select().eq().ilike().insert().rpc()`)
is called directly inside these functions — e.g. `dogs.ts:9-13`, `training-elements.ts:64-70`,
`training-logs.ts:47-52`. `src/middleware.ts:12,47` and every API route under `src/pages/api/dog/**` construct the
client via `createClient()` (`src/lib/supabase.ts:5`) and pass it into these service functions untyped-at-the-call-site
(inferred from `createClient`'s return type).

### Leak B — vendor `User` type in the global `App.Locals` ambient contract

`src/env.d.ts:3` declares:

```ts
declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    selectedDog: import("./types").Dog | null;
  }
}
```

This is an **ambient global type augmentation** — every `.astro` page and every `APIRoute` handler in the app is
typed against `Astro.locals.user` / `context.locals.user` as `@supabase/supabase-js`'s `User`, **without any of
them writing an import statement for the package**. `src/middleware.ts:14-21` is the sole place that populates it:

```ts
const supabase = createClient(context.request.headers, context.cookies);
if (supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  context.locals.user = user ?? null;
} else {
  context.locals.user = null;
}
```

The raw GoTrue `User` object — is assigned straight into `Locals` with no mapping step.

**Files that read `context.locals.user` / `Astro.locals.user` today** (file:line):

- `src/middleware.ts:26,36,45` — truthiness only
- `src/pages/api/dog/index.ts:13,38` — truthiness, then `.id`
- `src/pages/api/dog/[id]/index.ts:9` — truthiness only
- `src/pages/api/dog/[id]/logs/index.ts:20,54` — truthiness, then `.id`
- `src/pages/api/dog/[id]/elements/index.ts:14` — truthiness only
- `src/pages/api/dog/[id]/elements/reorder.ts:14` — truthiness only
- `src/pages/api/dog/[id]/elements/[elementId]/index.ts:14,68` — truthiness only (both `PATCH` and `DELETE`)

Confirmed by grep (`user\.\w+|user\?\.\w+` under `src/pages`): the **only** field ever dereferenced anywhere in the
codebase is `.id` (`src/pages/api/dog/index.ts:38`, `src/pages/api/dog/[id]/logs/index.ts:54`). No file reads
`.email`, `.app_metadata`, `.user_metadata`, `.aud`, `.confirmed_at`, `.identities`, `.factors`, `.role`, or any of
the other ~20 fields on GoTrue's `User` type.

## Step 2 — Classification and choice of #1

| Leak                                 | (a) Files/layers affected                                                                                                                                          | (b) Cost to replace today                                                                                   | (c) Doc-declared interchangeability |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A — `SupabaseClient` in services     | 3 service files own the type; ~10 API routes + middleware construct/thread the client. Confined to server-side.                                                    | Very high — every function body calls the concrete Postgrest builder API directly, not just the param type. | Not declared.                       |
| B — `User` in `App.Locals` (ambient) | 2 files declare/populate it (`env.d.ts`, `middleware.ts`), but **every** route in the app inherits the typed contract implicitly — no import needed to be coupled. | Very low — only `.id` is ever read anywhere.                                                                | Not declared.                       |

**Leak B is the worst leak and is chosen as #1.** Reasoning:

- **It is the more dangerous kind of leak.** Leak A is a concrete, visible, _threaded_ dependency — every consumer
  explicitly imports the type or receives it as a function argument; it is loud and easy to find. Leak B is
  **invisible**: it lives in a global ambient declaration (`env.d.ts`), so `src/pages/dogs/[id]/dashboard.astro`,
  `src/pages/index.astro`, and every future page automatically inherit a dependency on `@supabase/supabase-js`'s
  `User` shape merely by referencing `Astro.locals` — the textbook definition of "library type in a domain
  signature," except the signature here is the application's own global request-context contract.
- **Extreme surface/usage mismatch.** GoTrue's `User` type exposes ~20 fields (`aud`, `app_metadata`,
  `user_metadata`, `email`, `phone`, `role`, `confirmed_at`, `identities`, `factors`, `is_anonymous`, …); the
  codebase uses exactly one (`.id`) plus truthiness checks. Almost the entire type surface crossing this boundary
  is dead coupling.
- **Cost asymmetry favors fixing it now.** Leak A cannot be meaningfully decoupled without either adopting a full
  data-access abstraction (a large, arguably premature investment for a solo 3-week MVP that explicitly chose
  Supabase for integration convenience per `tech-stack.md:24`) or accepting that the concrete Postgrest API is the
  service layer's real contract. Leak B, by contrast, costs one small value object and one adapter method to fix
  outright — high leverage, low risk, no change to any call site's behavior.
- Both leaks lack a documented interchangeability promise, so neither is a violation of a stated contract; Leak B
  is chosen purely on structural severity and fix leverage, per the tie-break in the task's own axis (c) not being
  decisive here.

Leak A is **not fixed by this plan** — see Step 6 for the explicit decision to defer it.

## Step 3 — Diagnosis

**Duplication of the "unwrap or null" pattern** — the same shape is reconstructed at every site that resolves the
session, though only one such site exists today, which is precisely the problem: it exists _once_, but the type it
produces is trusted verbatim by seven downstream files listed in Step 1 with no intermediate translation.

**Boundary leak, concretely**: `src/middleware.ts:16-18`

```ts
const {
  data: { user },
} = await supabase.auth.getUser();
context.locals.user = user ?? null;
```

assigns the SDK's `User` object directly to `context.locals.user`, whose declared type (`src/env.d.ts:3`) _is_ that
SDK type. There is no ACL boundary between "what GoTrue returns" and "what the rest of the app is typed against" —
they are the same object, the same type, by construction.

**No documented interchangeability claim is violated** (see Step 0) — this is a structural/invisibility diagnosis,
not a broken promise.

## Step 4 — ACL design

### Domain value object

`src/lib/auth/authenticated-account.ts` (new file):

```ts
export interface AuthenticatedAccount {
  readonly id: string;
}
```

This is the **only** place in the domain that defines what "the current authenticated caller" means to the rest
of the app. It intentionally carries nothing beyond `id`, matching the one field ever consumed (Step 1). Extending
it (e.g. adding `email`) is a deliberate, explicit decision made in this file and in the adapter below — never an
incidental side effect of a service or route reading a raw vendor field.

### Port

Same file, or `src/lib/auth/session-port.ts`:

```ts
export interface SessionPort {
  getCurrentAccount(): Promise<AuthenticatedAccount | null>;
}
```

Narrow by design: one method, one return shape. Nothing about cookies, headers, JWTs, or GoTrue leaks into the
signature.

### Adapter

`src/lib/auth/supabase-session-adapter.ts` (new file) — the **only** file permitted to know that `SessionPort` is
backed by Supabase:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedAccount, SessionPort } from "./session-port";

export class SupabaseSessionAdapter implements SessionPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async getCurrentAccount(): Promise<AuthenticatedAccount | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    return user ? { id: user.id } : null;
  }
}
```

The mapping from GoTrue `User` → `AuthenticatedAccount` (currently: keep `id`, discard everything else) is coded
exactly once, here.

### Wiring (middleware)

`src/middleware.ts:11-21` becomes:

```ts
const supabase = createClient(context.request.headers, context.cookies);
const session = supabase ? new SupabaseSessionAdapter(supabase) : null;
context.locals.user = session ? await session.getCurrentAccount() : null;
```

Note: `supabase` (the `SupabaseClient`) is still constructed here and still passed on to `getDogById` at
`middleware.ts:47` and to services from API routes — that is Leak A, explicitly out of scope (Step 6).

### Ambient contract

`src/env.d.ts` becomes:

```ts
declare namespace App {
  interface Locals {
    user: import("./lib/auth/session-port").AuthenticatedAccount | null;
    selectedDog: import("./types").Dog | null;
  }
}
```

`@supabase/supabase-js` no longer appears in `env.d.ts` at all.

## Step 5 — Proof of isolation + before/after

**Vendor swap only touches the adapter.** If Supabase Auth were ever replaced (e.g. with a different auth
provider), the change set is:

1. `src/lib/auth/supabase-session-adapter.ts` — rewrite the single method body.
2. `src/lib/auth/session-port.ts` / `authenticated-account.ts` — unchanged.
3. `src/middleware.ts` — unchanged (still calls `session.getCurrentAccount()`).
4. `src/env.d.ts` — unchanged.
5. All seven consumer files listed in Step 1 (`dashboard`/API routes) — **unchanged**, because they only ever read
   `.id` and truthiness, both of which `AuthenticatedAccount` still provides.

No table, no API route contract (the JSON shapes returned by `pages/api/**`), and no `.astro` page markup changes.

**Before/after for the duplicated-knowledge point:**

|                                                       | Before                                                            | After                                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/env.d.ts:3`                                      | `import("@supabase/supabase-js").User \| null`                    | `import("./lib/auth/session-port").AuthenticatedAccount \| null`                                                    |
| `src/middleware.ts:14-21`                             | Destructures GoTrue's `{ data: { user } }` directly into `Locals` | Delegates to `SessionPort.getCurrentAccount()`; adapter does the unwrapping                                         |
| Files importing `@supabase/supabase-js`'s `User` type | 1 (`env.d.ts`)                                                    | 0 outside `src/lib/auth/` (the adapter references `SupabaseClient`, not `User`, and only to call `.auth.getUser()`) |

**UI receives ready-made domain data, not a raw library object**: `src/pages/api/dog/index.ts:38` and
`src/pages/api/dog/[id]/logs/index.ts:54` call `context.locals.user.id` today and will continue to after the
change — the value flowing through is now sourced from `AuthenticatedAccount`, a domain type, not GoTrue's `User`.

**Open question resolved here, not in the API layer**: what subset of GoTrue's `User` the domain is allowed to see.
Per GoTrue's contract (`auth.getUser()` returns `{ data: { user: User | null }, error }`), the `User.id` is the
stable, non-null (when `user` is non-null) UUID identity — the correct and sufficient field for `account_id`
throughout `src/types.ts` (`Dog.account_id`, `TrainingLog.account_id`). This decision — "only `id` crosses the
boundary" — is coded in `SupabaseSessionAdapter.getCurrentAccount()`, not decided ad hoc by each API route.

## Step 6 — Verify and plan

**Success criteria**:

- `grep -rn "@supabase/supabase-js" src` returns only:
  - `src/lib/services/dogs.ts:1`, `training-elements.ts:1`, `training-logs.ts:1` (Leak A, explicitly deferred —
    see below)
  - `src/lib/auth/supabase-session-adapter.ts` (new — the ACL adapter, permitted)
  - It must **not** return `src/env.d.ts`.
- Files that currently know the vendor `User` shape: `src/env.d.ts`, `src/middleware.ts` (2 files). After: 0 files
  outside `src/lib/auth/supabase-session-adapter.ts`.
- `npm run lint` and `npm run build` (which runs `astro check`/`tsc` per `CLAUDE.md`) pass with no type errors in
  any of the seven consumer files in Step 1 — they should require **zero** source changes.

**Phase plan** (consistent with `src/lib/services/` convention of small, single-purpose files under `src/lib/`):

1. **Add, don't wire.** Create `src/lib/auth/session-port.ts` (`AuthenticatedAccount`, `SessionPort`) and
   `src/lib/auth/supabase-session-adapter.ts` (`SupabaseSessionAdapter`). No existing file changes. Purely
   additive — safe to land on its own.
2. **Wire into middleware.** Update `src/middleware.ts:11-21` to construct `SupabaseSessionAdapter` and call
   `getCurrentAccount()` instead of calling `supabase.auth.getUser()` inline.
3. **Flip the ambient contract.** Update `src/env.d.ts:3` to reference `AuthenticatedAccount` instead of
   `@supabase/supabase-js`'s `User`. This is the change that actually closes the leak; doing it last (after Phase
   2 is in place) means `tsc` will fail loudly in Phase 3 if any consumer secretly relied on a field other than
   `.id` — a built-in regression check.
4. **Verify.** Run the grep success criteria above, `npm run lint`, `npm run build`.

**Explicitly deferred**: Leak A (`SupabaseClient` threaded through `src/lib/services/*.ts`). Applying the same ACL
pattern would mean designing a repository-style port per aggregate (`DogRepository`, `TrainingElementRepository`,
`TrainingLogRepository`) with Postgrest-specific adapters — a substantially larger effort with no current driver
(no second backend under consideration, no documented interchangeability requirement, and `tech-stack.md:24`
explicitly favors Supabase's integration convenience for this solo 3-week MVP). Recommend revisiting only if a
concrete second-backend or heavy-testing driver emerges.
