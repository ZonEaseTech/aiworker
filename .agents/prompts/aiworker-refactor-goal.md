/goal Use the Claude Code skill named `aiworker-refactor-dev-loop`.

Continue the AIWorker destructive refactor as a standing release objective, not
as a one-off development task. The objective remains active until the Exit
Criteria are met, the user explicitly stops it, or a repeated unsafe/blocking
condition prevents any meaningful slice from progressing.

The skill owns the loop. Do not let outer runner mechanics, ordinary chat turns,
or resumed compacted context change the loop contract. Each invocation advances
exactly one bounded verified slice and leaves `Next` as the next bounded
implementation target to execute, not as advice for the user.

Mainline:

- read `AGENTS.md` and canonical docs;
- run `git status --short`, `bun run docs:check`, and `bun run test:contracts`;
- fix P0/P1 drift before ordinary progress;
- choose exactly one bounded implementation target;
- implement or remove old architecture residue;
- run fresh verification;
- run code-review-graph for code changes unless unavailable;
- stage only current-slice files, never `git add .`;
- create a conventional commit for verified progress;
- continue to the next bounded target while Exit Criteria are not met.

Do not stop with only discovery, audit, verification, synthesis, status, or
next-step advice when implementation is safe. Tests are gates, not the product.
Dynamic workflow is allowed only for inherently parallel work, not by default.

Each invocation must end with these evaluator-visible labels:

- Preflight
- Slice
- Changes
- Verification
- Drift
- Commit
- Next

The objective is complete only when Claude has surfaced fresh evidence that
canonical docs match implementation, Freeform v1 works through CLI, Web,
host-daemon, mounted workbench, and engine bridge, descriptor-only and monorepo
boundaries are tested, old authority cannot return without failing guardrails,
required verification passes, and no P0/P1 drift remains.
