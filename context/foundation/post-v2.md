# Post-V2 Features

1. Global error page — the app has no custom error page today; an unhandled SSR exception falls
   through to Astro/Cloudflare Workers' default error response rather than anything on-brand.
   Surfaced during the training-board-refactor plan review (F3): `grid.astro`'s new try/catch
   degrades pre-existing Supabase fetch failures to the app's own "service unavailable" overlay
   instead, which is an improvement for that one page, but a proper global/custom error page would
   close this gap application-wide instead of route-by-route.
