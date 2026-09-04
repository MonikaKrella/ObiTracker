---
change_id: training-board-refactor
title: Training board — invariant aggregate-guardian refactor
status: implementing
created: 2026-09-04
updated: 2026-09-04
archived_at: null
---

## Notes

Domain-driven refactor arising from `context/domain/02-invariant-aggregate-refactor.md` (itself
built on `context/domain/01-domain-distillation.md`). Targets the single highest-ranked gap those
documents found: the highlight classification invariant — the literal Primary Success Criterion
(`prd.md:38`) — is today computed exclusively inside `TrainingGrid.tsx`'s `useMemo`, with no
service, API route, or repository ever producing it independently ("client is sole gatekeeper").

Introduces a `TrainingBoard` aggregate (`src/lib/domain/training-board.ts`) whose `create()`
factory fails fast (`UnknownElementTickError`) instead of silently trusting an unchecked
precondition, a `loadTrainingBoard()` repository, and a new `GET /api/dog/[id]/grid` endpoint so
the SSR page, the API, and the client's optimistic-update path all route through the same guarded
object. Pure refactor — the 3-tier/tie-expansion/suppression algorithm itself (survived 5 prior
corrections, see `context/archive/2026-06-17-training-grid/research.md`) moves verbatim, zero
observable behavior change for the handler.

Scope confirmed with user during `/10x-plan` questioning on 2026-09-04: build the new API endpoint
now (not deferred), and degrade to the existing "service unavailable" overlay (not a hard 500) if
the fail-fast guard is ever tripped. `context/domain/03-anti-corruption-layer.md` (Supabase `User`
leak) and domain invariants #2-4 from `01-domain-distillation.md` (dog-name uniqueness, future-date
DB constraint, soft-delete documentation gap) are explicitly out of scope — separate refactor
targets.
