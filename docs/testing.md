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
- Canonical docs must say Paseo owns workspace/runtime/UI/session/provider orchestration.
- Package ownership tests must reject deleted legacy Worker packages/apps.
- AIWorker-control tests must cover assignment lifecycle, user authorization, handoff metadata, structured aissh provisioning args, command redaction, Soul file projection, remote HOME-derived `PASEO_HOME`/workspace paths, explicit workspace/endpoint/readiness policy records, `PASEO_HOST` neutralization, `paseo-provider-json-v1` readiness gates, and instruction-only pairing handoff.
- AIWorker CLI tests must cover `plan` preview, interactive and explicit `apply --yes` execution approval, `doctor` local diagnostics, human-vs-`--json` output, actionable redacted errors that do not dump the generated script or standalone projected base64 payloads, aissh invocation resolution, neutral cwd execution, mocked provision execution without contacting a real target, and scrubbing of provider JSON/model payloads plus Paseo pairing URLs/QRs across non-app relay domains.
- AIWorker Web tests must cover framework choice, shadcn/token invariants, admin-only product boundary, Bun build/serve packaging, and absence of employee-side Worker/Paseo runtime surfaces.
- Soul descriptor/SDK tests must prove Souls build into workspace templates only.

## Explicitly retired gates

The following old gates are invalid because AIWorker no longer owns employee runtime:

- Worker daemon API tests;
- Workbench/browser chat tests;
- engine bridge real-run tests;
- session invocation/follow-up tests;
- Worker Web build or UI component gates for the retired employee-side Workbench. This does not forbid the AIWorker Web admin/control surface, which has its own thin-layer gates above.
