# PLAN-167 Refresh README from current CLI onboarding and product narrative

- **status**: completed
- **createdAt**: 2026-05-08 02:17
- **approvedAt**: 2026-05-08 02:17
- **completedAt**: 2026-05-08 02:44
- **relatedTask**: TODO-042

## Current State

The current CLI behavior after PLAN-165 / PLAN-166:

- `aiworker --help` is a short first-run surface.
- `aiworker commands` is the full command index.
- `aiworker env gateway-url` and `aiworker env display-name` write
  worker-local startup env.
- `aiworker init` / bootstrap reserve commented gateway enrollment examples in
  `.env`.
- `aiworker doctor` reports gateway enrollment as standalone/configured with
  INFO/PASS guidance.

The README has partially adopted the env shortcuts, but still carries older
quickstart/status wording and does not describe the discovery model.

## Proposal

1. Add a compact CLI discovery note to both READMEs.
2. Correct worker quickstart wording so `up` initializes, validates, checks
   readiness, and serves, but does not claim to select an executor.
3. Add a short paragraph explaining that new `.env` files reserve gateway
   enrollment comments and `doctor` shows optional gateway next steps.
4. Align English and Chinese status/version lines.
5. Add a user-facing "who needs AIWorker" section.
6. Replace the compact topology diagram with a wider layout that separates the
   optional gateway control plane from the single-worker data plane.
7. Remove README phrasing that exposes internal workflow/process rather than
   user-facing product behavior.

## Risks

- README should not become a full CLI manual.
- Gateway enrollment should remain optional; missing gateway config should not
  read as a warning or required setup.
- Do not expose implementation details beyond user-facing commands.

## Scope

- `README.md`
- `README.zh-CN.md`
- PMA task/plan/changelog

## Verification

- `rg` checks for stale wording.
- `git diff --check`.

## Progress

- 2026-05-08 02:17: Plan opened after refreshing against current CLI help,
  `runUp`, README, and changelog.
- 2026-05-08 02:31: Updated English and Chinese README onboarding, CLI
  discovery, worker-local `.env`, doctor gateway guidance, Chinese executor
  timeout note, and status facts.
- 2026-05-08 02:44: Added target-audience framing, widened the topology
  diagram, and replaced internal-process README wording with user-facing
  development guidance.
- 2026-05-08 02:44: Removed README links and status wording that exposed
  regression implementation details, and localized the Chinese topology section.

## Result

- README quickstart no longer says `aiworker up` selects an executor.
- README now routes first-time users through short help / full command index /
  scoped worker/fleet/gateway help.
- README now explains worker-local `.env` placement, commented gateway
  enrollment examples, and doctor gateway INFO guidance.
- Chinese README status now matches the current 0.10.2 and 800+ harness-check
  baseline.
- README now includes "Who needs AIWorker" / "谁会需要 AIWorker" sections.
- The topology diagram now reads as two spacious views: optional fleet gateway
  control plane and standalone worker data plane.
- Development/status wording no longer exposes internal agent workflow names.
- Public README links no longer expose internal regression scripts as a primary
  user entry, and the status table now describes capability readiness rather
  than harness matrix internals.
- Chinese README headings, topology copy, and status table labels are more
  consistently user-facing.

## Validation Result

- `git pull --ff-only` — already up to date.
- `bun apps/cli/src/aiworker.ts --help` — inspected current first-run help.
- `rg` stale-wording checks across README.md / README.zh-CN.md — pass for the
  targeted drift terms.
- `git diff --check` — pass.
