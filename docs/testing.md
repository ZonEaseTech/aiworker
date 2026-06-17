# AIWorker Testing

Tests now protect the thin Paseo distribution boundary.

## Required gates

```bash
bun run docs:check
bun run test:contracts
bun run test:protocol
bun run typecheck
bun run lint
bun run build
```

## Contract coverage

- Canonical docs must say AIWorker is assignment ledger + aissh provisioner + Soul filesystem projector.
- Canonical docs must say Paseo owns Project/workspace/runtime/UI/session/provider orchestration.
- Package ownership tests must reject deleted legacy Worker packages/apps.
- AIWorker-control tests must cover assignment lifecycle, user authorization, handoff metadata, explicit target ownership/dedication assertions, owner/dedication mismatch rejection, structured aissh provisioning args, command redaction, Soul file projection, remote HOME-derived `PASEO_HOME`/Project workdir paths, explicit project-workdir/endpoint/readiness policy records, `PASEO_HOST` neutralization, `paseo-provider-json-v1` readiness gates, and instruction-only pairing handoff.
- AIWorker CLI tests must cover `plan` preview, required `--target-owner`/`--dedicated-target-user` ownership assertions, pair preflight validation before `aissh`, interactive and explicit `apply --yes` execution approval, `doctor` local diagnostics, human-vs-`--json` output, actionable redacted errors that do not dump the generated script or standalone projected base64 payloads, aissh invocation resolution, neutral cwd execution, mocked provision execution without contacting a real target, and scrubbing of provider JSON/model payloads plus Paseo pairing URLs/QRs across non-app relay domains.
- AIWorker Web tests must cover framework choice, shadcn/token invariants, admin-only product boundary, Bun build/serve packaging, and absence of employee-side Worker/Paseo runtime surfaces.
- AIWorker Web bootstrap tests must cover fixture-vs-control-plane mode, Logto complete/partial auth gates, optional `AIWORKER_WEB_ADMIN_TOKEN` mutation/API fallback, browser token storage behavior, structured redacted remediation payloads, and apply/pair precondition guidance.
- Soul descriptor/SDK tests must prove Souls build into Project workdir templates only.

## Real environment E2E gate

The Web approval-to-device acceptance path is external-gated. It can only pass
when the run uses all of the following:

- real `AISSH_TOKEN` plus a target ref, with `AISSH_SERVER` only when the aissh control plane requires it;
- explicit `AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET=1`, proving the control-plane/target pair is dedicated or disposable;
- a control-plane `PaseoEnvironment.dedication` matching the assignment user so Web passes `--dedicated-target-user`;
- a real target user HOME and HOME-derived `PASEO_HOME`;
- a real Paseo CLI and reachable Paseo daemon under that same identity;
- a real built Soul descriptor such as `souls/<name>/dist/soul.descriptor.json`;
- authority to generate one transient Paseo pairing response for the prepared Project workdir.

Fixture mode, fake CLI scripts, mocked `aissh`, or static page tests may prove
readiness and redaction behavior, but they must not be reported as a passed live
E2E. The pass signal for the live run is:

```bash
AIWORKER_WEB_LIVE_E2E=1 \
AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET=1 \
AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane \
AIWORKER_WEB_ADMIN_TOKEN=<admin-token> \
AIWORKER_WEB_E2E_ASSIGNMENT_ID=<assignment-id> \
AISSH_TOKEN=<aissh-token> \
bun run e2e:aiworker-web:live
```

Set `AIWORKER_WEB_LIVE_E2E_PROJECT_SMOKE=1` only when the target may safely run an extra headless check. That optional smoke can claim only that `paseo run --host <owner-loopback-host> --cwd <project-workdir>` accepted the prepared Project workdir; it is not daemon pairing, desktop Project registration, or session-log evidence.

```text
Web approval -> aiworker apply through real aissh -> applied receipt and handoff-ready metadata -> transient daemon pair response displayed only in the current page
```

The run fails if pairing URLs/QRs, raw provider output, stdout/stderr transcripts,
generated shell scripts, or literal secrets are persisted in approvals, receipts,
audit records, control-plane snapshots, fixtures, docs, or logs.
The live gate must not parse `.aissh.yaml` secrets; pass real `AISSH_TOKEN`
through the process environment.

## Explicitly retired gates

The following old gates are invalid because AIWorker no longer owns employee runtime:

- Worker daemon API tests;
- Workbench/browser chat tests;
- engine bridge real-run tests;
- session invocation/follow-up tests;
- Worker Web build or UI component gates for the retired employee-side Workbench. This does not forbid the AIWorker Web admin/control surface, which has its own thin-layer gates above.
