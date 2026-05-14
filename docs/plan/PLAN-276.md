# PLAN-276 HR Role Search Cockpit workbench

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 10:26
- **approvedAt**: 2026-05-12 10:34
- **completedAt**: 2026-05-12 12:23
- **relatedTask**: REFACTOR-069

## Current State

HR is the best first Soul for domain-specific workbench validation because it has
clear high-value artifacts and obvious boundaries:

- current HR templates already include candidate screen, interview brief, role
  rubric, and hiring risk;
- current HR Soul already states key guardrails: no discriminatory screening, no
  unconfirmed employment commitments, and no exposure of sensitive candidate data;
- current worker pack describes candidate screening, interview preparation, and
  recruiting evidence summaries;
- current Web still treats HR mostly as generic worker + capability templates.

The missing product shape is not another chat surface. HR needs a role-search
workspace where evidence, candidates, interviews, comparison, roundup, review,
and memory promotion remain connected.

## Product Decision

The HR specialized workbench should be a **Role Search Cockpit**.

Primary loop:

```text
Role Search
  -> role rubric
  -> candidate evidence dossier
  -> interview kit / scorecard summary
  -> evidence matrix
  -> roundup packet
  -> human review
  -> redacted reusable HR lesson
```

The Agent helps by producing evidence-grounded artifact patches and review
proposals. It does not make final hiring decisions.

## Proposed IA

### HR Home

HR home remains a light entry surface:

- active role searches;
- candidates needing review;
- upcoming interviews;
- memory/playbook shortcuts;
- create role search / import candidate packet actions.

### Role Search Cockpit

The main HR route is a three-region cockpit:

```text
Pipeline rail | Role/candidate/pool work surface | Agent task tray
```

Left rail:

- role search status;
- pipeline stages and counts;
- candidate list with status flags;
- interview schedule summary.

Center surface:

- role rubric view;
- selected candidate dossier;
- evidence claims with source references;
- rubric coverage;
- evidence matrix across candidates;
- interview loop and debrief summary;
- roundup packet preview.

Right task tray:

- current scope: role / candidate / pool / interview / artifact;
- suggested actions;
- patch/proposal preview;
- apply/edit/reject/follow-up controls;
- privacy/compliance notices.

### Evidence Matrix

Evidence Matrix is the HR flagship view:

- rows: candidates;
- columns: role signals / rubric criteria;
- cells: covered / weak / missing / conflict, with source references;
- actions: find missing signals, compare candidates, generate roundup packet,
  check risky wording.

This is the HR equivalent of Open Design generating an inspectable set of visual
outputs: it gives the hiring team a structured, reviewable group artifact.

### Candidate Dossier

Candidate details should be a selected-object surface inside the cockpit, not a
separate product center:

- evidence claims;
- source map;
- rubric coverage;
- interview plan;
- scorecard status;
- communication drafts;
- decision support memo.

Every AI-derived claim should preserve source, confidence, decision-use status,
and privacy classification.

### Roundup Packet

Roundup Packet is the core review artifact:

- role rubric snapshot;
- candidate comparison summary;
- missing signals;
- conflicting feedback;
- risks and assumptions;
- source references;
- explicit human decision placeholders.

## Agent Actions

Initial task tray actions:

- `extractEvidence`: extract candidate facts from supplied materials.
- `matchRubric`: map evidence to role rubric criteria.
- `draftInterviewKit`: create structured interviewer brief and question set.
- `summarizeScorecards`: normalize and summarize interview feedback.
- `findMissingSignals`: identify gaps in candidate or pool evidence.
- `buildEvidenceMatrix`: generate or update pool-level matrix.
- `draftRoundupPacket`: produce decision-support memo for hiring review.
- `checkRiskyWording`: flag protected-class inference, unsupported judgments,
  privacy leakage, or unreviewed commitments.

All actions should output artifact patches/proposals. Human apply/edit/reject is
required before the artifact is treated as accepted.

## Scope

In scope:

- HR-only specialized workbench behind the PLAN-275 descriptor resolution path.
- Role Search Cockpit layout and routing.
- File-first evidence packet ingestion or selection for local workspace files.
- HR artifact previews for role rubric, candidate screen, interview kit,
  evidence matrix, and roundup packet.
- HR Agent task tray with proposal/patch interaction.
- HR review panel for quality, privacy/compliance, and memory candidates.
- Browser validation for HR cockpit plus generic fallback Souls.

Out of scope:

- Real ATS/HRIS connector implementation.
- Automated hiring ranking or final selection.
- Offer/rejection automation without explicit human review.
- Payroll, benefits, employee relations, performance management, or succession
  planning.
- Specialized PM/QA/DevOps workbenches.

## Data and Artifact Model

Prefer a file-first portable evidence packet:

```text
role-search/
  role-rubric.md
  evidence/
  candidates/
    candidate-a/
      source-map.json
      candidate-screen.md
      interview-kit.md
      scorecard-summary.md
  evidence-matrix.md
  roundup-packet.md
  reviews/
  lessons/
```

SQLite stores metadata, source pointers, session/turn/events, artifact index,
review status, and lesson proposal state. Candidate source material and generated
business artifacts remain in the workspace folder or external source systems.

## Risks

- **Privacy leakage**：candidate information is sensitive.
  Mitigation: source maps, redaction by default for durable lessons, and explicit
  privacy/compliance review before memory promotion.
- **Automated decision perception**：users may treat matrix output as ranking.
  Mitigation: avoid score/rank-first UI; present evidence coverage, gaps, and
  review packets with human decision placeholders.
- **Overbuilding HRIS**：trying to cover employee lifecycle too early would dilute
  the first win.
  Mitigation: keep MVP to recruiting role search and file-first evidence.
- **Generic fallback regression**：HR specialization could destabilize other Souls.
  Mitigation: PM/QA/DevOps stay on current implementation and become fallback
  regression cases.

## Verification Plan

- Focused Web tests for HR route rendering Role Search Cockpit.
- Focused tests for HR task tray actions producing patch/proposal records.
- Artifact preview tests for role rubric, candidate screen, interview kit,
  evidence matrix, and roundup packet.
- Regression tests confirming PM/QA/DevOps still render current generic worker
  implementation.
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-shared' test`
- `git diff --check`
- Browser desktop/mobile smoke for HR cockpit and one non-HR Soul fallback.
- code-review-graph review after code changes.

## Approval Gate

Approved by operator on 2026-05-12 through the direct development handoff request.
The implementation must treat Playwright/browser validation as product UX review:
inspect layout, hierarchy, interaction consistency, and flow smoothness, not just
whether DOM elements appear.

## Progress

- 2026-05-12 10:26: Drafted from the HR Soul product discussion. No code
  changes yet.
- 2026-05-12 10:34: Approved and claimed for implementation.
- 2026-05-12 12:23: Completed HR Role Search Cockpit implementation. Playwright
  UX review validated desktop/mobile layout, HR action-to-composer flow,
  workspace/session handoff, and PM fallback; mobile header overflow and task
  tray composer visibility were fixed before final verification.
