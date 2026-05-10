# REFACTOR-044 OD-style vertical Soul workspace correction

- **status**: superseded
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 11:28
- **claimedAt**: 2026-05-10 11:28
- **plan**: PLAN-212
- **relatesTo**: apps/web, apps/api, packages/core, Open Design IA reference

## Background

The previous vertical Soul MVP moved the product language away from work orders,
but it also drifted into a self-invented catalog/dashboard shell and left the
project/run output feeling demo-like. The desired direction is to keep the Open
Design-style information architecture that worked better, while replacing all
domain, copy, and workflow semantics with AIWorker Soul / template / project /
artifact concepts.

## Goal

Restore the OD-style first-screen structure for Worker Web and make the local
Soul flow genuinely usable:

- left-side creation surface for Soul, capability template, and project context;
- center project/artifact workspace with real local API state;
- right-side business artifact preview and review context;
- Settings dialog with AIWorker configuration semantics;
- local run output that produces structured business artifacts instead of an
  echo/demo artifact.

## Acceptance Criteria

- Web first screen visually follows the OD-style IA skeleton without copying
  Open Design brand, design-generation domain, desktop chrome, or import entry.
- No Import ZIP / Import file / Import Claude Design / work-order-first path is
  present.
- HR, PM, QA, and DevOps Souls are selectable and drive scoped capability
  templates.
- Creating a project starts a run with selected Soul/Skill metadata and produces a
  business artifact that can be previewed in the Web.
- Settings remains explicit-open, persists, rescans/tests engines, and uses
  AIWorker execution/configuration copy.
- Focused code gates, browser validation, and code-review-graph review are run
  before closeout.

## Evidence

Superseded on 2026-05-10 after user review clarified that `project` is not the
desired default product object. Follow-up implementation moved to
REFACTOR-045 / PLAN-214 so the rewrite can destructively converge on
Soul / template / project / run / artifact and remove stale initialization
artifacts instead of polishing the previous project-based surface.
