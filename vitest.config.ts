import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

// No Astro/Vite integration needed: the tested modules (src/lib/highlight.ts,
// src/lib/dates.ts, src/lib/training-grid-helpers.ts) only ever use
// `import type` for `@/...` imports, which esbuild strips entirely during
// transpilation. A plain Vite config is sufficient — do not reach for
// `getViteConfig` from `astro/config`.
//
// loadEnv with an empty prefix loads ALL vars from .env (not just VITE_*),
// making SUPABASE_URL, SUPABASE_KEY, and SUPABASE_SERVICE_ROLE_KEY available
// via process.env in integration tests.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    test: {
      environment: "node",
      env,
    },
  };
});
