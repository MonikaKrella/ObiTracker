// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      dedupe: ["react", "react-dom", "react-dom/server"],
    },
    ssr: {
      // Bundle Radix UI packages into the SSR output instead of externalizing
      // them. When externalized, each Radix sub-package resolves React through
      // its own node_modules traversal, producing a second React copy that has
      // a null fiber context — causing "Cannot read properties of null
      // (reading 'useState')" during SSR. Bundling them ensures one shared
      // React instance across the entire SSR render.
      noExternal: [/^@radix-ui\//, "radix-ui"],
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
