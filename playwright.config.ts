import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // Serialized: the dev server runs on Cloudflare's local Miniflare/workerd
  // emulation (via @cloudflare/vite-plugin, used by both `astro dev` and
  // `astro preview`), which is unreliable under concurrent requests — observed
  // as intermittent flakes across specs under default multi-worker parallelism,
  // and as outright request failures (miniflare dispatchFetch "fetch failed")
  // when tried against a built+preview server instead. Single worker avoids
  // that concurrency entirely.
  workers: 1,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4321",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"], storageState: "playwright/.auth/user.json" },
    },
  ],
});
