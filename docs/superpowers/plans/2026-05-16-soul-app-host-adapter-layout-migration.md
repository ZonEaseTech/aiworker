# Soul App Host Adapter Layout Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move official HR and QA Host adapter code into `host-adapter/` without changing protocol behavior.

**Architecture:** `host-adapter/` owns the app boundary with Host: app definition, protocol exports, API entry, mounted service and standalone service. `product/` remains domain meaning; `engine-assets/` remains engine-facing projection source.

---

## Task 1: Contract Tests

- [x] Update shared manifest tests to expect `./host-adapter/...` refs for API,
  exports and modes.
- [x] Run `bun test packages/shared/src/soul-app/manifest.test.ts` and verify RED.

## Task 2: Move Adapter Files

- [x] Move HR and QA `src/index.ts` to `host-adapter/index.ts`.
- [x] Move HR and QA `src/index.test.ts` to `host-adapter/index.test.ts`.
- [x] Move HR and QA `src/api.ts` to `host-adapter/api.ts`.
- [x] Move HR and QA `src/protocol/*.ts` to `host-adapter/protocol/*.ts`.
- [x] Move HR and QA `src/host-mounted.ts` to `host-adapter/mounted/host-mounted.ts`.
- [x] Move HR and QA `src/standalone.ts` to `host-adapter/standalone/standalone.ts`.
- [x] Update relative imports after the move.

## Task 3: Update References

- [x] Update HR/QA manifests.
- [x] Update HR/QA package exports, main/types and scripts.
- [x] Update shared fixtures and manifest tests.
- [x] Update `docs/soul-app-developer.md`.
- [x] Run `rg -n "\\./src|src/" apps/aiworker-hr apps/aiworker-qa packages/shared/src/soul-app docs/soul-app-developer.md` and verify remaining hits are historical or intentional non-official examples.

## Task 4: Verification And PMA Closeout

- [x] Run the FEAT-090 verification commands.
- [x] Mark FEAT-090 and PLAN-331 completed and update the changelog.

## Execution Notes

- Do not add compatibility aliases for old `src/` paths.
- Keep mounted route behavior and standalone HTML behavior unchanged.
