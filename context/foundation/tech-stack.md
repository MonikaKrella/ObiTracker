---
starter_id: 10x-astro-starter
package_manager: npm
project_name: obitracker
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

ObiTracker is a solo, after-hours web app with a 3-week MVP timeline and email+password auth as the only technology-forcing feature. The 10x-astro-starter is the recommended default for (web-app, js) and delivers auth, PostgreSQL database, and Cloudflare edge deployment through Supabase and Cloudflare Pages — all wired together without manual integration work. The starter clears all four agent-friendly gates: TypeScript is project-wide (typed), Astro file-based routing and React islands follow predictable conventions (convention-based), Astro and Supabase both have strong representation in model training data (popular), and docs are current and link-able (well-documented). A short timeline and solo context favor battle-tested and batteries-included; this starter satisfies both. CI runs on GitHub Actions with auto-deploy on merge to main — the standard flow for a solo project of this scope.
