# PLAN-179 Authority mode and high-risk preflight

- **status**: draft
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker documentation is clear that executor-native capabilities and ambient
host authority are not AIWorker-owned. The product surface still needs a direct
operator-visible authority mode so users do not mistake Brain governance for a
permission boundary.

## Goal

Expose authority mode and high-risk preflight truthfully: AIWorker governs Brain
and AIWorker-brokered capabilities, but not unmanaged ambient executor authority.

## Scope

- Define authority modes:
  - `ambient`: executor may use user/host-level tools, tokens, plugins, MCP, or shell;
  - `aiworker-brokered`: action must go through an AIWorker-controlled capability;
  - `read-only`;
  - `plan-only`;
  - `dry-run`.
- Surface current mode in CLI/API/UI where tasks are run or reviewed.
- Add high-risk preflight signals for prod/db/delete/payment/PII/secret/cross-scope
  intent.
- For ambient high-risk tasks, warn truthfully and recommend plan-only/dry-run/hold.
- Keep full broker implementation out of 1.0 unless a narrow capability is explicitly
  approved later.

## Non-Goals

- No full sandbox.
- No MCP firewall.
- No cloud permission broker.
- No promise to block executor actions that bypass AIWorker.

## Acceptance Criteria

1. Operator can see whether a task is using ambient or AIWorker-brokered authority.
2. High-risk ambient tasks produce a clear warning without claiming enforcement.
3. Gate verdict can reference authority mode as a reason.
4. Docs explicitly preserve the no-false-security boundary.

## Verification

- Focused tests for authority-mode classification and warnings.
- CLI/API snapshot tests if surfaces change.
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-173
- **blocks**: PLAN-175, PLAN-180, PLAN-181
