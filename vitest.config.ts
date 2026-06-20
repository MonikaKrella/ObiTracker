import { defineConfig } from "vitest/config";

// No Astro/Vite integration needed: the tested modules (src/lib/highlight.ts,
// src/lib/dates.ts) only ever use `import type` for `@/...` imports, which
// esbuild strips entirely during transpilation. A plain Vite config is
// sufficient — do not reach for `getViteConfig` from `astro/config`.
export default defineConfig({
  test: {
    environment: "node",
  },
});
