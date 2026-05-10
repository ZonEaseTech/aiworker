# PLAN-213 OD-style vertical Soul MVP correction validation

- **status**: superseded
- **owner**: local
- **createdAt**: 2026-05-10 11:28
- **relatedTask**: QA-027

## Current State

PLAN-212 will change the Web first screen, run metadata, and local artifact
generation. The user-facing acceptance depends on an actual local preview, not
only unit tests.

## Proposal

1. Run focused tests and type/build gates for changed packages.
2. Start the local daemon and Web preview from a disposable workspace.
3. Exercise Soul selection, capability selection, project/run creation, artifact
   preview, Settings save/close/reload persistence, Rescan, and Test.
4. Capture browser evidence and console status.
5. Run code-review-graph update/review and record results.

## Implementation Status

Superseded by PLAN-215 because validation must include the project semantic
rewrite and initialization artifact purge from PLAN-214.
