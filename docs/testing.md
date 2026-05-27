# AIWorker Testing

This document defines the canonical verification contract.

## Testing Model

Contract tests are the primary guardrail for this destructive refactor. Old E2E
volume is not architecture proof.

The baseline favors focused static, unit, package, CLI, and browser proof over
large historical flows.

## Required Test Areas

Architecture tests:

```text
tests/architecture/
  monorepo-boundary.test.ts
  forbidden-host-domain-schema.test.ts
  package-ownership.test.ts
```

Protocol tests:

```text
packages/soul-protocol/src/
  descriptor-v1.test.ts
  mounted-routing-contract.test.ts
```

SDK tests:

```text
packages/soul-app-sdk/src/
  authoring-conventions.test.ts
  descriptor-build.test.ts
  common-workbench-fallback.test.ts
```

Host runtime tests:

```text
packages/host-runtime/src/
  descriptor-only-install.test.ts
  worker-config-scope.test.ts
  archive-delete-lifecycle.test.ts
```

Engine projection tests:

```text
packages/engine-projection/src/
  workspace-assets-projection.test.ts
  skills-projection.test.ts
  native-mcp-projection.test.ts
  receipt-cleanup.test.ts
```

Engine bridge tests:

```text
packages/engine-bridge/src/
  adapter-contract.test.ts
  invocation-state.test.ts
  native-resume.test.ts
  cancel-reconciler.test.ts
  event-redaction.test.ts
```

CLI and browser tests:

```text
apps/cli/src/freeform-golden-path.test.ts
tests/browser/freeform-cli-golden-path.spec.ts
tests/browser/freeform-mounted-workbench.spec.ts
```

## Current Bootstrap Gate

The first guardrail is:

```text
bun run test:contracts
```

It verifies that canonical docs exist, root workspaces include `souls/*`,
`AGENTS.md` is a short bootstrap, session lifecycle is separate from invocation
state, protocol/authoring remain descriptor-only and native-MCP based, and broad
replacement buckets such as `core-v2` and `shared-v2` do not appear.

## Future Gates

As packages land, add:

```text
bun run test:protocol
bun run test:sdk
bun run test:host
bun run test:engine
bun run test:cli
bun run test:browser:freeform
bun run check
```

## Browser Proof Scope

The v1 browser proof is Freeform-only:

```text
Host Web opens worker/workspace/session locator
-> resolves Freeform workbench
-> mounts via micro-app router-mode=search
-> SDK common workbench renders
-> bridge event refs are visible to the mounted surface
```

Do not modify the new architecture to satisfy old E2E assumptions. Delete or
rewrite tests that require Host to import Soul source, expect old daemon product
backend behavior, or encode `router-mode="pure"` as production behavior.
