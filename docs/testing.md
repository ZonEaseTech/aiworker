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
- AIWorker-control tests must cover assignment lifecycle, user authorization, handoff metadata, aissh provisioning command redaction, and Soul file projection.
- Soul descriptor/SDK tests must prove Souls build into workspace templates only.

## Explicitly retired gates

The following old gates are invalid because AIWorker no longer owns employee runtime:

- Worker daemon API tests;
- Workbench/browser chat tests;
- engine bridge real-run tests;
- session invocation/follow-up tests;
- Worker Web build or UI component gates.
