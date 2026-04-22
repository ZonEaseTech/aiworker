# PLAN-006 P2 batch — channel adapters (Telegram, Lark, WhatsApp) + Evolution generator

- **status**: implementing
- **createdAt**: 2026-04-21 18:55
- **approvedAt**: 2026-04-21 18:55
- **relatedTask**: FEAT-003, FEAT-004, FEAT-005, FEAT-006

## Context

PLAN-003 phase 7 landed three channel adapter stubs (`telegram.ts`, `lark.ts`, `whatsapp.ts`) that throw `ChannelNotImplementedError`, plus an evolution observer + `skill_drafts` table + approval UI with a no-op proposer (`apps/api/src/worker/evolution/proposer.ts`). All shared types (`ChannelCredentials` union, `Envelope`, `OutboundMessage`, `skillDrafts`) are already committed.

This plan finishes those four tasks in one BKD worktree dispatch. The four subtasks are independent — each touches its own adapter file (or proposer file) plus tests — so they run in parallel.

Shared-type touchpoints are identified upfront to avoid merge conflicts:

- `packages/shared/src/fleet/channel.ts` — the three channel variants' credential shapes are already frozen; adapters should **not** need to extend this file. If a subtask discovers a required field is missing, it reports back to the coordinator before editing shared types.
- `packages/shared/src/fleet/index.ts` — exports table; touched only if new types are added.
- `apps/api/src/worker/evolution/proposer.ts` — FEAT-006 only.

## Proposal

### Sub-issue matrix

| ID | Task | Files (primary) | Tests | Shared types? |
|----|------|------------------|-------|----------------|
| SUB-1 | FEAT-003 Telegram | `adapters/telegram.ts` | `adapters/telegram.test.ts` | No |
| SUB-2 | FEAT-004 Lark | `adapters/lark.ts` | `adapters/lark.test.ts` | No |
| SUB-3 | FEAT-005 WhatsApp | `adapters/whatsapp.ts` + `channels/routes.ts` (GET verify) | `adapters/whatsapp.test.ts` | No |
| SUB-4 | FEAT-006 Evolution generator | `evolution/proposer.ts` + `evolution/proposer.test.ts` + possibly `evolution/pattern-miner.ts` | `evolution/proposer.test.ts` | No |

### Per-subtask acceptance

**SUB-1 FEAT-003 Telegram**

- `verify`: if `binding.credentials.webhookSecretToken` is set, reject when `X-Telegram-Bot-Api-Secret-Token` header does not match (timing-safe). If unset, accept.
- `toEnvelopes`: parse Telegram Update JSON; emit one envelope per `message.text` (ignore non-text events); `chatId` format `{private|group|supergroup|channel}:{chat.id}`; `userId` = `from.id` when present; preserve `raw` for outbound context.
- `send`: POST `https://api.telegram.org/bot{botToken}/sendMessage` with JSON body `{chat_id, text}`. Chunk messages > 4096 chars on whitespace. No parse_mode in MVP (plain text only — rationale: MarkdownV2 escaping is error-prone; punt to a hints-driven follow-up).
- `telegram.test.ts`: one fixture-based contract test for `toEnvelopes` (recorded Update JSON), one `verify` success + mismatch test, one `send` test using `fetch` mock to assert URL + body.

**SUB-2 FEAT-004 Lark**

- `verify`: decode platform events. Lark ships two shapes — a URL-verification challenge (`{challenge, token, type: 'url_verification'}`) and regular events. For encrypted events, AES-256-CBC decrypt the `encrypt` field using `encryptKey` (SHA256 → key + IV spec per Lark docs); then verify `token === verificationToken`. URL-verification response handling is outside the adapter contract (see `routes.ts` for the echo-back path).
- `toEnvelopes`: parse decrypted `event.message` (Lark v2 event schema). Text extraction from `content` JSON string `{"text":"..."}`. `chatId` = `chat_id` when `chat_type === 'group'`, else `open_id` of sender. `userId` = `sender.sender_id.open_id` when present.
- `send`: 
  - Maintain a per-adapter tenant-access-token cache: exchange via `POST /open-apis/auth/v3/tenant_access_token/internal` with `{app_id, app_secret}`; cache until `expire` seconds before expiry.
  - `POST /open-apis/im/v1/messages?receive_id_type=open_id` (p2p) or `chat_id` (group) with body `{receive_id, msg_type: 'text', content: JSON.stringify({text})}`.
- Card messages deferred (text-only MVP per task notes; "first reply may be interactive card" is explicitly a follow-up concern).
- `lark.test.ts`: fixture test for `toEnvelopes` with decrypted payload, AES decrypt unit test, token-cache unit test, `send` with mocked fetch.

**SUB-3 FEAT-005 WhatsApp**

- `verify`:
  - Challenge (`GET /whatsapp/webhook`): not the adapter's concern — wire it in `channels/routes.ts` checking `hub.mode === 'subscribe' && hub.verify_token === verifyToken`, echo `hub.challenge` as plain text.
  - `POST` body: verify `X-Hub-Signature-256` HMAC-SHA256 of raw body using `appSecret`. Use timing-safe compare.
- `toEnvelopes`: parse Graph API webhook JSON (`entry[0].changes[0].value.messages[]`). Extract text (`text.body`, `image.caption`, etc.). `chatId` = `from` (E.164 without `+`). `userId` = `contacts[].wa_id`. Ignore non-text / non-caption messages in MVP.
- `send`: 
  - POST `https://graph.facebook.com/v21.0/{phoneNumberId}/messages` with `Authorization: Bearer {accessToken}`.
  - Body `{messaging_product: 'whatsapp', to, type: 'text', text: {body}}`.
- Template messages + media endpoint deferred (MVP is free-form text inside the 24h session window only).
- `whatsapp.test.ts`: fixture `toEnvelopes` + HMAC verify success/mismatch + `send` via mocked fetch.

**SUB-4 FEAT-006 Evolution generator**

- Replace `proposer.ts` stub with a real pattern miner:
  - Input window: last N `evolution_observations` (default 500) + their joined `conversations` + `execution_logs`. Cap via env `EVOLUTION_PROPOSER_WINDOW` (default 500).
  - Detection: slide an n-gram window (n=2..4) over `execution_logs[].toolCall.name` per conversation; a repeating tool-call sequence with `>= threshold` occurrences (default 3) across `>= minConversations` (default 2) is a candidate pattern.
  - De-dup: skip if any existing `skill_binding.skillId` or `skill_drafts` row already names the same ordered tool sequence.
  - Draft synthesis: populate `skill_drafts` with `name` (slug `auto-<first-tool>-<last-tool>-<shortHash>`), `triggerDescription` (brief natural-language summary), `allowedTools` (the n-gram), `promptTemplate` (boilerplate citing the pattern), `confidence` (occurrences / window_size), `rationale` (pattern detail), `status = 'pending'`.
  - Rate limit: loop interval is env `EVOLUTION_PROPOSER_INTERVAL_MS` (default 6h) — same as today's stub. Additionally, per-run cap: don't emit > `EVOLUTION_PROPOSER_MAX_DRAFTS_PER_RUN` drafts (default 5).
- Keep the existing `startProposerLoop` signature; `runProposerOnce` becomes the real entry point.
- New helper `apps/api/src/worker/evolution/pattern-miner.ts` for the miner itself (pure functions, unit-testable).
- `proposer.test.ts`: miner unit tests (synthetic observations) + integration test that seeds observations via the drizzle test db then asserts `skill_drafts` rows.

### BKD orchestration

- Mode: **worktree** for all four — even though file overlap is nominally zero, worktree gives each subtask its own `bkd/{issueId}` branch so review + merge is clean.
- Parallelism: 4 subtasks dispatched concurrently (available capacity = 6 at plan creation time).
- Each subtask MUST:
  1. Investigate → propose → implement under its own PMA plan (`docs/plan/PLAN-00N.md` permitted, but `.claim` the feature task `[ ] → [-]` first).
  2. Run `bun run check` + the adapter's own test suite green before self-review.
  3. Run `/pma-cr` on its own diff; fix all P0 + P1 findings before reporting.
  4. Follow-up report to the coordinator issue (spec in BKD follow-up).
- Coordinator: classifies each subtask's return via logs-filter (green/yellow/red). Greens merge immediately. Reds reopen the subtask. Yellows escalate to the human.
- Merge: worktree branches merged into `main` one at a time, each followed by `bun run check` locally.

## Risks

1. **Token-cache concurrency (Lark)**. If two concurrent `send()` calls both fetch a new access token, they double-call the token exchange endpoint. Mitigation: guard with a shared `Promise` cache (singleton promise while pending).
2. **WhatsApp 24h session window**. Free-form text outside the session window silently drops. Mitigation: documentation-only for MVP; template support is explicitly deferred in the task note.
3. **Telegram MarkdownV2 escaping**. Chose to defer MarkdownV2 to keep MVP correct by construction. Follow-up can add a `hints.parseMode` escape hatch.
4. **Evolution miner false positives**. Low-confidence drafts pollute the approval queue. Mitigation: confidence threshold in the draft, plus the cap per run. Approver UI already filters by status.
5. **Shared-type drift**. If a subtask discovers a credential field is missing from `ChannelCredentials`, the coordinator must serialise the shared-type edit to avoid parallel-merge conflicts. Mitigation: explicit pre-flight check in the subtask spec; report back before editing shared types.

## Scope

- 4 adapter / proposer implementations (~300 LOC each incl. tests)
- 0–1 new support files (pattern-miner.ts for FEAT-006)
- `channels/routes.ts` gains the WhatsApp GET-challenge handler (small delta)
- `bun run check` must stay clean across all three workspaces after each merge
- Task + plan index sync at completion time; changelog entry on final merge

## Alternatives

1. **Serial dispatch** (one subtask at a time). Rejected — four independent tasks; parallel worktree is strictly faster and BKD supports it natively.
2. **Bundle FEAT-003/004/005 into a single subtask** "channels batch". Rejected — each channel has platform-specific quirks and its own contract test; splitting gives smaller reviewable diffs.
3. **Ship Markdown/card/template support now**. Rejected — these are follow-ups per each task's Notes; MVP text-only keeps the blast radius low.
4. **Use webhook registration at deploy time**. Out of scope — operator registers webhooks manually per the deployment run book.

## Annotations

- 2026-04-21 18:55 — User approved "满配去编排" on 4 P2 tasks. Dispatching via BKD under project `lded7ogt` (aiworker), coordinator + 4 worktree subtasks.
