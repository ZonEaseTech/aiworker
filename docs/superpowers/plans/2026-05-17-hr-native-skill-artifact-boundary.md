# HR Native Skill Artifact Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make HR native skills clearly produce artifacts while HR product-owned instructions define how those artifacts are interpreted, reviewed and promoted into the accepted People Profile.

**Architecture:** Keep the boundary instruction-level and HR-owned. Native skill files describe artifact duties only; HR workspace/product files describe the artifact taxonomy, review gate and README promotion policy. Host, manifest, protocol, runtime and shared schemas stay unchanged.

**Tech Stack:** Markdown workspace templates, Codex/Claude native skill Markdown, AIWorker Soul App engine assets, PMA docs, Bun validation scripts.

---

## File Structure

- Modify `apps/aiworker-hr/engine-assets/workspace/AGENTS.md`: clarify the product-owned artifact-to-profile review loop without making each skill own README promotion.
- Modify `apps/aiworker-hr/engine-assets/skills/candidate-profile/SKILL.md`: state that the skill creates candidate-focused profile artifacts, not accepted profile state.
- Modify `apps/aiworker-hr/engine-assets/skills/evidence-screening/SKILL.md`: state that the skill creates supporting evidence matrix artifacts.
- Modify `apps/aiworker-hr/engine-assets/skills/interview-brief/SKILL.md`: state that the skill creates supporting interview-planning artifacts.
- Modify `apps/aiworker-hr/engine-assets/skills/hiring-risk-review/SKILL.md`: state that the skill creates risk review artifacts used by product review gates.
- Modify `apps/aiworker-hr/engine-assets/skills/profile-update-proposal/SKILL.md`: state that the skill creates profile update proposal artifacts that HR product review may promote.
- Create `apps/aiworker-hr/product/artifacts/README.md`: define HR product-owned artifact taxonomy and promotion policy.
- Modify `docs/task/FEAT-094.md`, `docs/task/index.md`, `docs/plan/PLAN-343.md`, `docs/plan/index.md`, and `docs/changelog.md`: PMA tracking and closeout.

No runtime code, manifest schema, shared protocol, Host code or Web code should change in this slice.

### Task 1: Create PMA Tracking

**Files:**
- Create: `docs/task/FEAT-094.md`
- Create: `docs/plan/PLAN-343.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [x] **Step 1: Add FEAT-094 task detail**

Create `docs/task/FEAT-094.md`:

```markdown
# FEAT-094 HR native skill artifact boundary

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-17 10:26
- **plan**: PLAN-343
- **spec**: docs/superpowers/specs/2026-05-17-hr-native-skill-artifact-boundary-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-17-hr-native-skill-artifact-boundary.md
- **relatesTo**: apps/aiworker-hr/engine-assets, apps/aiworker-hr/product/artifacts

## Context

HR already has a profile ledger where `README.md` is the accepted People Profile,
session outputs are artifacts, and reviewed artifacts can be promoted. The
native skills still read as independent task templates and do not clearly
separate artifact production from HR product-owned interpretation and promotion.

## Goals

- Keep native skills focused on producing reviewable artifacts.
- Keep HR product logic responsible for artifact taxonomy, validation and
  promotion into the accepted People Profile.
- Make the workspace instruction explain the artifact-first loop without
  leaking README promotion duties into every skill.
- Preserve Host, runtime, manifest and shared protocol behavior.

## Non-Goals

- Do not change shared manifest or protocol schema.
- Do not change Host runtime or promotion plumbing.
- Do not make README a generic Soul App assumption.
- Do not add Web UI behavior in this slice.

## Acceptance Criteria

- HR workspace instructions describe artifact-first execution and product-owned
  promotion.
- All five HR native skills describe artifact output duties and avoid owning
  accepted profile state.
- HR product-owned material documents artifact taxonomy and promotion meaning.
- Focused validation passes for HR app instructions and projection-sensitive
  files.

## Verification

- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-core' test src/worker/engine-assets.test.ts src/worker/runtime.test.ts`
- `git diff --check`

## ActiveForm

- 2026-05-17 10:26: Claimed for implementation from the approved
  Superpowers design spec.
```

- [x] **Step 2: Add task index line**

Append to `docs/task/index.md`:

```markdown
- [-] [**FEAT-094 HR native skill artifact boundary**](FEAT-094.md) `P0`
```

- [x] **Step 3: Add PLAN-343 detail**

Create `docs/plan/PLAN-343.md`:

```markdown
# PLAN-343 HR native skill artifact boundary

- **status**: implementing
- **owner**: codex
- **createdAt**: 2026-05-17 10:26
- **approvedAt**: 2026-05-17 10:26
- **relatedTask**: FEAT-094

## Current State

HR workspace instructions already say `README.md` is accepted profile state and
session outputs should be reviewable artifacts. The five projected HR native
skills each define useful output shapes, but their wording does not make the
layering explicit: native skills produce artifacts, while HR product logic owns
artifact interpretation, validation and promotion into the accepted People
Profile.

## Proposal

1. Update HR workspace `AGENTS.md` so it names the artifact-first loop and
   keeps promotion decisions in HR product review.
2. Update the five HR native skills so each skill names its produced artifact
   and avoids claiming responsibility for accepted profile writes.
3. Add `apps/aiworker-hr/product/artifacts/README.md` as the HR-owned taxonomy
   and promotion policy for product maintainers.
4. Run focused HR app validation and projection-sensitive core tests.

## Risks

- Over-specifying native skills could reintroduce product-state coupling. Keep
  README references in workspace/product guidance, not generic skill duties.
- Under-specifying promotion policy could leave the loop subjective. Keep the
  taxonomy explicit in HR product-owned docs.
- Because engine assets project into real workspaces, wording mistakes can
  directly shape executor behavior. Run HR validation and projection-sensitive
  tests.

## Scope

- `apps/aiworker-hr/engine-assets/workspace/AGENTS.md`
- `apps/aiworker-hr/engine-assets/skills/*.md`
- `apps/aiworker-hr/product/artifacts/README.md`
- PMA task, plan and changelog docs

## Alternatives

- HR-only skill README wording was rejected because it would make skills appear
  responsible for accepted profile state.
- Shared manifest/protocol descriptors were deferred because this slice does not
  require framework changes and other Soul Apps can already define product logic
  in app-owned material.

## Verification

- Run `bun run --filter '@zonease/aiworker-hr' validate`.
- Run `bun run --filter '@zonease/aiworker-hr' typecheck`.
- Run `bun run --filter '@zonease/aiworker-hr' test`.
- Run `bun run --filter '@zonease/aiworker-core' test src/worker/engine-assets.test.ts src/worker/runtime.test.ts`.
- Run `git diff --check`.

## Annotations

- 2026-05-17 10:26: User approved the boundary that native skills produce
  artifacts and Soul App product logic owns artifact use, validation and
  promotion.
```

- [x] **Step 4: Add plan index line**

Append to `docs/plan/index.md`:

```markdown
- [-] [**PLAN-343 HR native skill artifact boundary**](PLAN-343.md) `2026-05-17`
```

### Task 2: Update HR Workspace Product Loop

**Files:**
- Modify: `apps/aiworker-hr/engine-assets/workspace/AGENTS.md`

- [x] **Step 1: Add product-owned artifact loop**

In `apps/aiworker-hr/engine-assets/workspace/AGENTS.md`, keep the existing
workspace identity and accepted-state sections, then add a new section after
`## Accepted State`:

```markdown
## Product Artifact Loop

- Native skills produce reviewable artifacts; they do not own accepted profile state.
- HR product logic decides how an artifact is interpreted, reviewed, referenced, or promoted.
- `README.md` is the accepted People Profile for this HR product, not a generic Soul App assumption.
- Supporting artifacts may inform future profile proposals without becoming accepted profile state.
- Profile promotion requires HR product review and may only update `README.md` through the reviewed promotion path.
```

- [x] **Step 2: Tighten action and skill binding**

Adjust the existing `Action and Skill Binding` bullets so they say selected
skills should be followed for artifact production, while promotion stays with HR
product review:

```markdown
- Follow the selected skill purpose, expected inputs, artifact output shape, and review boundary.
- Do not silently switch to another skill or turn a supporting artifact into accepted profile state.
- If the request appears to require a different skill or a product promotion decision, explain the mismatch and ask the user to confirm whether to continue, switch, or start a review path.
```

- [x] **Step 3: Verify AGENTS wording**

Run:

```bash
rg -n "Product Artifact Loop|Native skills produce reviewable artifacts|generic Soul App assumption|accepted profile state" apps/aiworker-hr/engine-assets/workspace/AGENTS.md
```

Expected: four matching lines in `AGENTS.md`.

### Task 3: Update HR Native Skills As Artifact Producers

**Files:**
- Modify: `apps/aiworker-hr/engine-assets/skills/candidate-profile/SKILL.md`
- Modify: `apps/aiworker-hr/engine-assets/skills/evidence-screening/SKILL.md`
- Modify: `apps/aiworker-hr/engine-assets/skills/interview-brief/SKILL.md`
- Modify: `apps/aiworker-hr/engine-assets/skills/hiring-risk-review/SKILL.md`
- Modify: `apps/aiworker-hr/engine-assets/skills/profile-update-proposal/SKILL.md`

- [x] **Step 1: Update candidate-profile wording**

Change `Candidate Profile` so the contract says:

```markdown
## Artifact Contract

- Produce a candidate-focused People Profile artifact for HR review.
- Read the accepted profile surface when available to avoid contradicting reviewed state.
- Treat files under `artifacts/` as proposed or supporting work products until HR product review.
- Keep confirmed facts, missing evidence, weak signals, and next HR actions separate.
- Do not infer protected-class attributes, personal judgments, or employment commitments.
- Do not update accepted profile state directly.
```

- [x] **Step 2: Update evidence-screening wording**

Add this paragraph before `## Screening Standard`:

```markdown
This skill produces an evidence matrix artifact. HR product logic may later
reference that artifact from a profile update proposal, but the matrix itself is
supporting material until reviewed.
```

- [x] **Step 3: Update interview-brief wording**

Add this paragraph before `## Interview Guidance`:

```markdown
This skill produces an interview brief artifact for human panels. It can inform
future People Profile proposals, but it does not directly change accepted
profile state or make a hiring decision.
```

- [x] **Step 4: Update hiring-risk-review wording**

Change the intro to:

```markdown
Use this skill to produce a hiring risk review artifact for a proposed HR
artifact before HR product review promotes or references it.
```

Keep the verdict output shape, but add:

```markdown
The verdict is a recommendation for HR product review; it is not the promotion
operation itself.
```

- [x] **Step 5: Update profile-update-proposal wording**

Change `Rules` to:

```markdown
- Read the accepted profile surface first when available to understand the reviewed baseline.
- Write proposed changes under `artifacts/<sessionId>/`.
- Produce a complete reviewable proposal with source references, open questions, risks, and exact requested review decision.
- Do not update `README.md` or any accepted profile surface directly.
- Preserve human decision ownership for promotion.
```

- [x] **Step 6: Verify skill boundary terms**

Run:

```bash
rg -n "artifact|accepted profile state|product review|Do not update|supporting material" apps/aiworker-hr/engine-assets/skills
```

Expected: each of the five skills has at least one artifact-boundary match.

### Task 4: Add HR Product Artifact Taxonomy

**Files:**
- Create: `apps/aiworker-hr/product/artifacts/README.md`

- [x] **Step 1: Create taxonomy doc**

Create `apps/aiworker-hr/product/artifacts/README.md`:

```markdown
# HR Artifact Product Policy

AIWorker HR treats native skills as artifact producers. HR product logic owns
how artifacts are interpreted, reviewed, referenced, or promoted into accepted
People Profile state.

## Accepted State

- Accepted state: People Profile.
- Accepted state surface: workspace `README.md`.
- Proposal location: `artifacts/<sessionId>/`.
- Review record location: `reviews/*.md`.
- Promotion gate: HR product review with `pass` or `warn`.

This README convention belongs to AIWorker HR. Other Soul Apps may use different
accepted state surfaces.

## Artifact Taxonomy

| Artifact | Native skill | Product meaning |
| --- | --- | --- |
| Candidate profile artifact | `candidate-profile` | Candidate-focused profile work product. May propose profile section changes after review. |
| Evidence matrix | `evidence-screening` | Supporting evidence artifact. May be referenced by profile proposals. |
| Interview brief | `interview-brief` | Supporting artifact for interview planning. May feed profile next actions only after review. |
| Hiring risk review | `hiring-risk-review` | Promotion guard artifact. Reviews whether another artifact is safe to promote or reference. |
| Profile update proposal | `profile-update-proposal` | Direct candidate for People Profile promotion when HR product review passes or warns. |

## Promotion Rules

- Unknown artifact kinds remain session artifacts.
- Supporting artifacts do not update accepted profile state directly.
- A profile update proposal must preserve source references, open questions,
  risks, and the requested human decision.
- Protected-class inference, unsupported personal judgment, copied sensitive
  evidence, or unapproved employment commitments block promotion.
- Host records metadata and review events, but HR owns profile meaning.
```

- [x] **Step 2: Verify taxonomy doc**

Run:

```bash
rg -n "Native skill|Artifact Taxonomy|Promotion Rules|Other Soul Apps" apps/aiworker-hr/product/artifacts/README.md
```

Expected: four matching lines in the taxonomy doc.

### Task 5: Validate And Record

**Files:**
- Modify: `docs/task/FEAT-094.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-343.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run focused validation**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' validate
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-core' test src/worker/engine-assets.test.ts src/worker/runtime.test.ts
git diff --check
```

Expected: all commands pass.

- [x] **Step 2: Update PMA completion state**

Update `docs/task/FEAT-094.md`:

```markdown
- **status**: completed
```

Append to `## ActiveForm`:

```markdown
- 2026-05-17: Completed HR native skill artifact boundary landing. Workspace
  instructions now explain the product-owned artifact loop, five HR native
  skills are artifact-producer focused, and HR product material owns taxonomy
  and promotion policy.
- 2026-05-17: Verification passed: HR app validate/typecheck/test, focused core
  engine-assets/runtime tests, and `git diff --check`.
```

Update `docs/task/index.md`:

```markdown
- [x] [**FEAT-094 HR native skill artifact boundary**](FEAT-094.md) `P0`
```

Update `docs/plan/PLAN-343.md`:

```markdown
- **status**: completed
- **completedAt**: 2026-05-17
```

Replace `## Verification` content with the command results.

Update `docs/plan/index.md`:

```markdown
- [x] [**PLAN-343 HR native skill artifact boundary**](PLAN-343.md) `2026-05-17`
```

- [x] **Step 3: Update changelog**

Prepend to `docs/changelog.md`:

```markdown
## 2026-05-17 [completed] FEAT-094 / PLAN-343 — HR native skill artifact boundary

Landed the HR native skill artifact boundary from the approved Superpowers
design. HR native skills now read as artifact producers, while HR product-owned
material defines artifact taxonomy, review gates and promotion meaning.

- Updated HR workspace instructions to keep durable session output
  artifact-first and make accepted People Profile promotion a product review
  decision.
- Reworded the five HR native skills around artifact output, evidence, risk and
  human decision boundaries instead of accepted profile writes.
- Added HR product artifact policy under `apps/aiworker-hr/product/artifacts/`.

Verification passed: HR app validate/typecheck/test, focused core
engine-assets/runtime tests, and `git diff --check`.
```

- [x] **Step 4: Decide code-review-graph**

Because this slice changes only Markdown instructions, product docs and PMA
docs, skip code-review-graph and record that skip in the final response.

- [x] **Step 5: Commit**

Run:

```bash
git add apps/aiworker-hr/engine-assets/workspace/AGENTS.md \
  apps/aiworker-hr/engine-assets/skills/candidate-profile/SKILL.md \
  apps/aiworker-hr/engine-assets/skills/evidence-screening/SKILL.md \
  apps/aiworker-hr/engine-assets/skills/hiring-risk-review/SKILL.md \
  apps/aiworker-hr/engine-assets/skills/interview-brief/SKILL.md \
  apps/aiworker-hr/engine-assets/skills/profile-update-proposal/SKILL.md \
  apps/aiworker-hr/product/artifacts/README.md \
  docs/task/FEAT-094.md docs/task/index.md \
  docs/plan/PLAN-343.md docs/plan/index.md \
  docs/changelog.md \
  docs/superpowers/plans/2026-05-17-hr-native-skill-artifact-boundary.md
git commit -m "docs: 收敛 HR native skill artifact 边界"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: plan covers native skill artifact producer wording, HR
  product-owned taxonomy and promotion policy, workspace instruction loop, Host
  non-change, validation and PMA tracking.
- Placeholder scan: no pending placeholders are intentionally left.
- Scope check: one implementation slice, instruction-level and HR-owned.
- Type consistency: no runtime types or shared schemas are introduced.
