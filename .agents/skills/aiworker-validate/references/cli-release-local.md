# CLI Release Local Mode

Use `cli-release-local` for local black-box validation of an already-published
`@zonease/aiworker-cli` package.

## Inputs

- Exact published version, or latest after verifying with `npm view`.
- Debug root outside the source repo.
- Executor engines available in the real user `HOME`.
- Soul matrix and prompt depth.
- Whether to file findings only or also retest existing BUG/TODO tasks.

## Workflow

1. Create an isolated debug root outside the source repo.
2. Install the published CLI into an isolated prefix:

   ```bash
   npm install --prefix "$DEBUG_ROOT/bin" @zonease/aiworker-cli@<version>
   AIW="$DEBUG_ROOT/bin/node_modules/.bin/aiworker"
   "$AIW" --version
   ```

3. Do not run repo source builds, source dev servers, or local workspace CLI as
   the product-under-test.
4. For a compact run, cover at least developer/general-assistant across the
   requested executor. For a governance release campaign, default to:
   - developer;
   - hr-recruiting;
   - finance-ops;
   - qa-reviewer;
   - general-assistant;
   across codex/default and claude-code/default when both are available.
5. For each scope:
   - run init;
   - select executor;
   - run executor doctor, doctor, and initial brain status;
   - run 8-12 turns with one stable chat id.
6. Prompt coverage should include:
   - identity and scope;
   - normal work;
   - file create/read/modify;
   - marker recall;
   - out-of-scope request;
   - high-risk request;
   - admission proposal;
   - follow-up modification;
   - ambiguous prompt;
   - final consistency recap.
7. For REST/SSE evidence, start `serve` on loopback with the same published CLI
   and capture:
   - `/health`;
   - auth boundary;
   - `/api/worker/info`;
   - `/api/worker/brain/summary`;
   - event stream;
   - current task/conversation routes.
8. Verify claims with DB/filesystem evidence. Do not trust LLM self-report for
   admission, memory, artifact, cron, or persisted state.
9. Keep raw logs under the debug root. Publish only sanitized reports and PMA
   entries with evidence paths.

## Repeatable Governance Kernel Harness

For a compact repeatable regression run against a published CLI version, use
the repository harness:

```bash
PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts \
  --mode cli-release-local \
  --version <version> \
  --matrix compact \
  --debug-root /home/ben/projects/debug-aiworker/qa-<date>-governance-harness-<version>
```

The harness installs the published package into the debug root, runs
developer/codex and general-assistant/claude-code when available, records
worker.db/filesystem/event/REST/SSE evidence, and writes:

- `reports/governance-kernel-report.md`;
- `reports/governance-kernel-summary.json`.

Use `--matrix full` only for a deeper campaign.

## Historical Deep-Campaign Resources

Load these only when needed:

- [release-debug-recipes.md](release-debug-recipes.md);
- [release-debug-prompt-suite.md](release-debug-prompt-suite.md);
- [release-debug-findings.md](release-debug-findings.md);
- `../templates/claude-shim.sh`;
- `../templates/codex-shim.sh`;
- `../templates/run-one.sh`;
- `../templates/run-multi-turn.sh`;
- `../templates/admission-fixture.sql`.

## Evidence

Capture isolated install path, CLI version, executor availability, per-scope
commands, DB/filesystem assertions, event streams, REST/SSE results, cleanup,
and PMA task ids for confirmed findings.

## Boundaries

- Do not use the source checkout as the product-under-test.
- Do not treat published CLI validation as fleet validation unless the user
  explicitly asks to attach a worker to the shared fleet.
