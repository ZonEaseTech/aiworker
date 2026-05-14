# Gateway and fleet removal design

## Decision

Remove the historical remote gateway/fleet control plane from active source,
build, storage and deployment surfaces. The current product path is local Host /
Soul App autonomy, not operator-to-gateway-to-node remote control.

## Shape

The removal is destructive because this is pre-1.0 architecture convergence:

- delete `packages/gateway` and `packages/gateway-proto`;
- delete dead gateway smoke scripts and manifest dependencies;
- delete fleet DB schema, migrations and generation commands;
- stop copying or publishing fleet web/migration assets;
- delete Docker/GHCR/compose/Caddy/aissh gateway deployment surfaces that would
  be broken after package removal;
- keep only current local Host primitives by moving worker id constants to
  `lib/ids` and `EngineKind` to the providers availability contract.

Historical PMA task/plan/changelog records remain as history. Active operator
docs and README surfaces are updated so they no longer send users toward deleted
gateway/fleet paths.

## Success Criteria

- No workspace package named `@zonease/aiworker-gateway` or
  `@zonease/aiworker-gateway-proto` remains.
- No active source, manifest, script or docs outside historical PMA records
  refers to the deleted packages or gateway deployment scripts.
- Worker DB migrations and Worker Web packaging still build.
- Root verification and code-review-graph pass.
