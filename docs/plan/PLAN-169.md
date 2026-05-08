# PLAN-169 Native executor skill placement for Project Brain skills

- **status**: completed
- **createdAt**: 2026-05-08 17:30
- **approvedAt**: 2026-05-08 17:30
- **completedAt**: 2026-05-08 17:53
- **relatedTask**: REFACTOR-024

## Current State

AIWorker currently treats `.aiworker/skills/<id>/SKILL.md` as the default
project-scope skill surface:

- `apps/cli/src/commands/worker/init.ts` builds Soul/kernel skill seed files
  with `brainSkillPackSeedFiles(...)` and reports `.aiworker/skills/...` in
  preflight output.
- `packages/fs-layout/src/index.ts::ensureProjectAiworker()` creates
  `.aiworker/skills/` and writes seeded skill files there.
- `apps/cli/src/capabilities/validation.ts` validates `.aiworker/skills/` as
  a Brain capability check.
- `packages/core/src/worker/brain/providers/filesystem/*` scans
  `<brainHome>/skills/**/SKILL.md`.
- `ContextManager.buildSystemPrompt()` lists Brain skill summaries, and
  `ContextManager.loadSkillBodies()` loads selected bodies for prompt
  injection.
- `packages/core/src/worker/orchestrator/service.ts` wires `skill_load` into
  task prompt assembly.
- `packages/core/src/worker/brain/admission/service.ts` materializes
  `brain-skill-add` to `<brainHome>/skills/<skillId>/SKILL.md`.
- README, CLI docs, architecture docs, and tests describe `.aiworker/skills` as
  the default skill path.

That implementation is internally consistent, but it keeps AIWorker in the
business of selecting and injecting prompt skills even when the selected
executor already supports project-native skills. The new direction is
native-first: AIWorker should place skills where the executor natively loads
them, and `.aiworker` should remain governance/memory/state.

## Proposal

Make one coordinated pre-1.0 refactor:

1. Introduce a small native skill target resolver:
   - `codex` -> `.agents/skills/<skillSlug>/SKILL.md`
   - `claude-code` -> `.claude/skills/<skillSlug>/SKILL.md`
   - unsupported engines -> explicit fallback path, not the default.
2. Change `aiworker init --soul <preset>` so default kernel/Soul skills are
   written to the native target for the selected executor path.
3. Remove default project-scope `.aiworker/skills/` creation and preflight
   reporting for native-supported engines.
4. Make runtime Brain skill loading fallback-only. For supported native-skill
   engines, the orchestrator should stop listing/loading `.aiworker/skills`
   into task prompts by default.
5. Change `brain-skill-add` admission materialization so approved skill
   proposals write to the configured native skill target for supported engines.
6. Add conflict guards: never overwrite a user-owned native skill file silently.
   Existing non-matching files should fail the apply/init step with an explicit
   message and remediation.
7. Update doctor/up validation and `aiworker brain status/skills` wording so
   users can see whether skills are native executor skills or fallback Brain
   prompt skills.
8. Update README, CLI docs, architecture docs, and changelog to make the
   boundary unambiguous.

## Risks

- Existing pre-1.0 projects with `.aiworker/skills/` will need manual cleanup
  or re-init. This is acceptable before 1.0.0, but docs must be explicit.
- Engine-native directory conventions may diverge. Keep the resolver narrow and
  tested for Codex and Claude Code first.
- Admission materialization must not overwrite user-maintained executor-native
  skills. Conflict detection must be conservative.
- Unsupported engines still need a fallback story; otherwise HTTP/ACP/MCP users
  lose the ability to receive AIWorker-provided prompt skills.
- If runtime prompt injection remains enabled for native-skill engines, users
  could see duplicate instructions. The refactor must remove that duplication.

## Scope

- `packages/fs-layout`: skill target path helpers and project init layout.
- `packages/shared`: skill pack naming/target helpers if needed.
- `apps/cli`: init preflight, init write path, doctor/up validation, brain
  status/skills output, focused CLI tests.
- `packages/core`: filesystem Brain provider usage, orchestrator skill context
  loading, admission materializer, focused core tests.
- `docs/architecture.md`, `docs/cli.md`, `README.md`, `README.zh-CN.md`,
  `docs/changelog.md`.

## Alternatives

- Keep `.aiworker/skills` as canonical and copy/project to executor-native
  directories. Rejected as the default because it keeps a duplicate source of
  truth and preserves an AIWorker-managed skill runtime surface.
- Add an LLM skill selector in the Brain layer. Rejected for now because Soul
  active skills should be small, and Codex/Claude Code already provide native
  skill discovery and activation.
- Keep current prompt injection as-is. Rejected because it teaches the wrong
  boundary and risks context bloat or duplicated executor instructions.

## Verification

- `bun run --filter '@zonease/aiworker-fs-layout' test src/index.test.ts`
- `bun run --filter '@zonease/aiworker-shared' test src/brain/skill-pack.test.ts src/soul/pack.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/orchestrator/service.history.test.ts src/worker/brain/admission/service.test.ts src/worker/brain/providers/filesystem/scanner.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/init.integration.test.ts src/commands/worker/doctor.test.ts src/capabilities/validation.test.ts src/commands/worker/brain-admission.test.ts src/commands/worker/brain.ts`
- `bun run typecheck`
- `bun run lint`
- `git diff --check`

## Progress

- 2026-05-08 17:30: Investigation completed. The old `.aiworker/skills` model
  is coupled across init, fs layout, validation, runtime prompt assembly,
  admission materialization, docs, and tests; implementation must be coordinated
  rather than local.
- 2026-05-08 17:30: Approved for long-task implementation. Initial constraint:
  `aiworker init` has no executor-selection step, so native skill seeding must
  avoid adding a blocking prompt and should target supported native project
  directories with no-overwrite conflict handling.
- 2026-05-08 17:53: Implementation completed. Default Project Brain skills now
  materialize to `.agents/skills/` and `.claude/skills/`; native-skill engines
  suppress fallback prompt-skill injection; admission, doctor, brain status,
  README, CLI docs, architecture, governance status, and tests are aligned.

## Result

Completed. Native executor project skill placement is now the default for
Codex and Claude Code. `.aiworker/skills/` remains an explicit fallback path
for engines without native project skill support, not the primary Project Brain
skill surface.

Validation passed:

- `bun run --filter '@zonease/aiworker-fs-layout' test src/index.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/capabilities/validation.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/brain/admission/service.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/orchestrator/service.history.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/doctor.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/brain-admission.test.ts`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
