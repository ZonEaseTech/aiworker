# PLAN-014 Envelope upgrade + per-tool approvals + provider fallback + cron

- **status**: draft
- **createdAt**: 2026-04-24 15:45
- **relatedTask**: REFACTOR-003
- **dependsOn**: PLAN-012 (brain fs layout) — can land in parallel with PLAN-013

## Summary

Four independent but related small features batched for review economy.

### F1 — Envelope upgrade (from research Q5)

Add `accountId` (per-channel credential identity — matters for N bots on one platform) + structured `richMetadata` (attachments, replies, quotes, isEdit, isDelete) to the `Envelope` type. Retro-fit all channel adapters (telegram / whatsapp / lark / line / web). Update `messages` schema to store raw `richMetadata` alongside normalised `text`.

### F2 — Per-tool approvals (from research Q4)

Extend `WorkerConfig` with `toolPolicy: { <toolName>: 'auto' | 'ask' | 'deny' }`. In the orchestrator tool-call path, before executing, consult policy. When `ask`, block on an approval promise resolved either by an operator event (WS `approval.grant` from PLAN-013) or a CLI prompt (`aiw approve <taskId>`). When `deny`, short-circuit with a synthetic assistant message. Skills declare required capabilities in SKILL.md frontmatter (`requires.capabilities: [read_fs, network_read, ...]`) which can gate `auto`.

### F3 — Provider fallback chains (from research Q7)

`ExecutorConfig` gains optional `fallbacks: ExecutorConfig[]`. Factory builds a composite `FallbackExecutor` that tries primary, catches on error classes, retries against fallbacks. Per-error-class config: `onErrorKinds: ['rate-limit' | 'timeout' | 'auth' | 'network']`.

### F4 — Cron scheduling (from research Q8)

New `cron_jobs` table (id, expression, prompt, channel, chatId, enabled, lastRun, nextRun). Orchestrator owns a 60s tick loop that fires due jobs by synthesising an envelope. `aiw schedule list/add/remove` + WS `cron.*` methods for operators. Natural-language cron via an internal LLM call is out of scope for phase 1 (let the operator write the expression).

## Out of scope

- WS gateway itself → PLAN-013 is a prerequisite for F2 operator-approval flow.
- `packages/core` extraction → PLAN-015.
- Formal capability verification (RFC #6275-style) → future.
