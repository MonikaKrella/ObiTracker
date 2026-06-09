# GitHub Issues — ObiTracker

> Generated: 2026-05-28  
> Repository: [MonikaKrella/ObiTracker](https://github.com/MonikaKrella/ObiTracker)  
> Project board: [ObiTracker MVP](https://github.com/users/MonikaKrella/projects/3)  
> Source: [`context/foundation/roadmap.md`](roadmap.md)

## Issues

| Issue                                                     | Roadmap ID                 | Title                                                       | Labels                                                 | Status |
| --------------------------------------------------------- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ | ------ |
| [#2](https://github.com/MonikaKrella/ObiTracker/issues/2) | F-01 · `db-schema`         | Set up Supabase schema: dogs, elements, training_logs + RLS | `type:foundation` `status:ready` `stream:A`            | open   |
| [#3](https://github.com/MonikaKrella/ObiTracker/issues/3) | S-01 · `auth-flow`         | Complete and verify email auth end-to-end                   | `type:slice` `status:ready` `stream:B`                 | open   |
| [#4](https://github.com/MonikaKrella/ObiTracker/issues/4) | S-02 · `dog-management`    | Add dog + dog switcher                                      | `type:slice` `status:proposed` `stream:A`              | open   |
| [#5](https://github.com/MonikaKrella/ObiTracker/issues/5) | S-03 · `training-elements` | Custom training elements CRUD                               | `type:slice` `status:proposed` `stream:A`              | open   |
| [#6](https://github.com/MonikaKrella/ObiTracker/issues/6) | S-04 · `training-grid` ⭐  | Training grid with green/red highlights and ticking         | `type:slice` `status:proposed` `stream:A` `north-star` | open   |

## Labels

| Label             | Colour                                                                 | Meaning                            |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `type:foundation` | ![#0052cc](https://via.placeholder.com/12/0052cc/0052cc.png) `#0052cc` | Horizontal enabler (schema, infra) |
| `type:slice`      | ![#0075ca](https://via.placeholder.com/12/0075ca/0075ca.png) `#0075ca` | Vertical, user-visible slice       |
| `status:ready`    | ![#0e8a16](https://via.placeholder.com/12/0e8a16/0e8a16.png) `#0e8a16` | Ready to plan and build            |
| `status:proposed` | ![#e4e669](https://via.placeholder.com/12/e4e669/e4e669.png) `#e4e669` | Waiting on prerequisites           |
| `stream:A`        | ![#d4c5f9](https://via.placeholder.com/12/d4c5f9/d4c5f9.png) `#d4c5f9` | Critical path: data + core loop    |
| `stream:B`        | ![#f9d0c4](https://via.placeholder.com/12/f9d0c4/f9d0c4.png) `#f9d0c4` | Parallel track: auth               |
| `north-star`      | ![#ee0701](https://via.placeholder.com/12/ee0701/ee0701.png) `#ee0701` | Core hypothesis slice              |

## Dependency graph

```
F-01 (#2) ──┐
             ├──► S-02 (#4) ──► S-03 (#5) ──► S-04 (#6) ⭐
S-01 (#3) ──┘
```

## Notes

- Issue #1 is a previously merged PR (`Update name in Wrangler configuration file`) — issue numbering starts at #2.
- #2 and #3 are `status:ready` and can be started in parallel (Stream A and B respectively).
- #4, #5, #6 are `status:proposed` and blocked until their prerequisites are closed.
- The project board status column is set to **Todo** for all items; manually move #2 and #3 to a **Ready** column in the [Projects UI](https://github.com/users/MonikaKrella/projects/3) to reflect their readiness.
