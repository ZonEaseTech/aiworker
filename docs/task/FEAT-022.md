# FEAT-022 Auth mount recipe + Register dialog hint

- **status**: in_progress
- **priority**: P2
- **owner**: ben
- **createdAt**: 2026-04-23 06:05
- **startedAt**: 2026-04-23 06:35

## Description

Even after FEAT-020 / FEAT-021 bake the binaries, the worker still can't
call the CLIs without being logged in. Document the two supported ways
to seed auth files and surface a reminder in the Register dialog:

1. **One-shot `docker exec` login** — for workers the operator owns on a
   dedicated host: `docker exec -it <worker> claude login`, etc. Writes
   to a volume-backed home directory inside the container.
2. **Mount host auth** — for workers that should inherit an existing
   logged-in CLI on the host: `-v ~/.claude.json:/root/.claude.json:ro`.

Acceptance:

- `ops/compose/docker-compose.worker.example.yml` (new) — minimal worker
  compose template demonstrating the full-image tag, slot env budget, and
  the commented-out auth mount block.
- `docs/executor-engines.md` gets an `### Auth recipes` section per
  engine with both approaches and the trade-offs (security / portability /
  multi-worker).
- `apps/web/src/features/workers/components/register-wizard.tsx` — after
  the `Generate` token helper, shows a second collapsible note card:
  "Don't forget to seed CLI auth — see `/docs/executor-engines.md`",
  collapsed by default so the main flow stays tight.
- Changelog entry + PLAN-009 close.

Explicitly out of scope:

- Dashboard-mediated login proxy (future; tracked in PLAN-009 alternatives).
- Rotating CLI credentials without restarting the worker.

## ActiveForm

Documenting auth mount recipes and surfacing a Register dialog reminder.

## Dependencies

- **blocked by**: FEAT-020 (the compose template depends on the full image
  being a tag that exists)
- **blocks**: (none — closes PLAN-009)

## Notes

- Related plan: `docs/plan/PLAN-009.md`.
- Keep the dialog note cosmetic: a <details>-style collapsible, no
  mandatory checkbox. Operators who don't need CLI auth (e.g. running
  http-only) shouldn't have extra clicks.
