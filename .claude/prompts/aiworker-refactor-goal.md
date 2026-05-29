/goal Use the Claude Code skill named `aiworker-refactor-dev-loop`.

Continue the AIWorker destructive refactor as long-running implementation work
toward canonical architecture release readiness. Freeform v1 is the first strong
acceptance vertical, not the end of the refactor.

Worktree:

```text
/Users/ben/projects/aiworker
```

Before selecting work, do one zero-trust progress calibration because the prior
round may have drifted or misread the refactor as complete.

This `/goal` authorizes:

- standard Superpowers workflow use;
- short-lived subagents as sidecars;
- strict Subagent Reclamation Contract: record each spawned subagent, collect its
  result, immediately close it, and keep owned open subagents at 0 before final
  response, phase commit, or the next slice;
- Phase Commit Contract with conventional commits after verified progress;
- Zero-Trust Review Contract at startup and completion.

Hard constraints:

- Canonical authority is only `AGENTS.md`, `docs/architecture.md`,
  `docs/protocol.md`, `docs/runtime.md`, `docs/soul-authoring.md`, and
  `docs/testing.md`.
- Do not use `tmp/refactor`, old E2E, old changelog, or old project-local skills
  as architecture authority.
- The work is development progress, not an audit report.
- If there is no P0/P1 drift, each round must complete one smallest verifiable
  development slice.
- Do not treat one completed slice as goal completion.
- Complete only when the skill Exit Criteria are satisfied.
- Block only after the same blocker repeats across multiple rounds and no
  alternate slice can make meaningful progress.

Every round starts by:

1. Reading `AGENTS.md`, the five canonical docs, and the
   `aiworker-refactor-dev-loop` skill.
2. Re-checking current git state, canonical contracts, and P0/P1 drift from a
   zero-trust posture.
3. Reconciling any known owned subagents before considering new subagents.
4. Running `bun run docs:check` and `bun run test:contracts`.
5. Choosing the next smallest verifiable slice from current code evidence.

Every round executes by:

- following the skill slice priority;
- using the relevant Superpowers workflow for design, planning, TDD, debugging,
  or completion verification;
- keeping subagents as independent sidecars while the main agent stays on the
  critical path;
- adding or updating focused contract tests first for behavior changes;
- running completion review from a zero-trust posture;
- ensuring all owned subagents are joined and closed;
- committing verified progress with a conventional commit;
- staging only current-slice files and never using `git add .`.

End each round with:

```text
Preflight
Slice
Zero-Trust
Superpowers/Subagents
Changes
Verification
Drift
Commit
Next
```
