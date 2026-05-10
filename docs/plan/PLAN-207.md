# PLAN-207 Vertical Soul product north star reset

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 10:03
- **completedAt**: 2026-05-10 10:03
- **relatedTask**: DOC-008

## Current State

The current implementation and docs still carry mixed signals:

- Recent Web work copied pieces of Open Design too literally.
- Existing GOALS/README kept `work order -> run -> artifact -> review ->
  lesson` as the dominant product loop.
- Developer was still presented as a peer default role even though developer
  workflows are already well served by first-tier engines.
- AGENTS still described AIWorker primarily as Project Brain plus
  Worker/Fleet aggregation runtime.

## Proposal

Reset the repo-level guidance:

1. Define AIWorker as a vertical Soul workspace for HR/PM/QA/DevOps and other
   team/org roles.
2. Treat Open Design as a product-grammar reference: skill/system/template/case
   and artifact flow, not desktop chrome, brand, pet, or image/video domain.
3. Reframe developer as a supporting Soul for review, release evidence, repo
   reports, handoff, and risk audit.
4. Move target nouns from work order/lesson to Soul, domain system, capability
   template, case, business artifact, review, and durable org memory.
5. Record the new anti-drift rules in `AGENTS.md` so future code work starts
   from the same assumptions.

## Implementation Status

| Batch | Status | Scope | Evidence |
| --- | --- | --- | --- |
| N1 north star | completed | `GOALS.md` | Vertical Soul workspace, HR/PM/QA/DevOps priority, OD mapping, decision tests |
| N2 architecture | completed | `docs/architecture.md` | Target objects, daemon/API/runtime/Web/storage boundaries |
| N3 agent and README guardrails | completed | `AGENTS.md`, `README.md` | Anti-drift instructions and user-facing positioning |
| N4 PMA record | completed | task/plan/changelog | DOC-008 / PLAN-207 created and closed |

## Verification Result

- `git diff --check` passed.
- Code review graph was skipped because this slice only changes documentation
  and instruction files.
