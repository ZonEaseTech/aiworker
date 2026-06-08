# BKD Three-Tier Autonomous Coordination

Cron-driven L1/L2/L3 coordination that runs entirely inside BKD. L1, L2, and L3
are all BKD processes; all coordination, state, and loops are expressed through
BKD issues, follow-ups, and cron jobs. **Never** use subagents, external team
runners, or `sleep` waits.

Use this pattern when the user wants a long-running, self-driving pipeline where
the user-facing agent (L1) only talks to the user and reports progress, while
BKD itself owns task decomposition and dispatch (L2) and execution (L3).

**Engine-agnostic by design.** L1, L2, and L3 may each run on different agent
engines (Claude Code, Codex, or anything BKD supports). Prompts in this file
deliberately avoid slash-command shorthand (`/bkd`, `/pma-cr`, etc.) because
not every engine resolves them. State requirements as capabilities; if an
engine has a matching skill, mention it as a hint, never as the only path.

## Table of Contents

- [When to Use This Pattern](#when-to-use-this-pattern)
- [Tier Map](#tier-map)
- [Campaign and DAG State](#campaign-and-dag-state)
- [Pre-Flight (every session)](#pre-flight-every-session)
- [L1 - Master Coordinator](#l1---master-coordinator-current-agent-session)
- [L2 - Scheduling Issue](#l2---scheduling-issue-singular-stays-working)
- [L3 - Subtask Issues](#l3---subtask-issues-short-lifecycle)
- [State Machine](#state-machine)
- [Loop Engine](#loop-engine)
- [Idle Termination Countdown](#idle-termination-countdown)
- [Exceptions and Escalation](#exceptions-and-escalation)
- [Key Constraints](#key-constraints)

## When to Use This Pattern

Choose this over the two-tier flow in `orchestration.md` when:

- The work spans multiple sessions or many hours and you want BKD to keep
  driving while the user-facing agent is idle or offline.
- The user wants a single human-facing "coordinator" session that only does
  context gathering and progress reporting, with all dispatch logic inside BKD.
- The pipeline must run across heterogeneous engines (e.g., L1 on Claude Code,
  L2 on Codex, L3 on whatever engine BKD assigns) without depending on
  engine-specific slash commands.
- Subtasks need a real dependency DAG (not all parallel, not all serial), with
  capacity-aware scheduling on every wake.
- You explicitly want `sleep`-free orchestration driven only by `issue-follow-up`
  cron callbacks.

If the work fits in one session and a simple "create coordinator -> dispatch
subtasks -> wait -> merge" suffices, use `orchestration.md` instead.

## Tier Map

```
L1 (current agent session, any engine)
  - talks to user, gathers context, defines goal + acceptance + scope
  - owns exactly one L2 dispatch issue
  - 60min cron pings L1's own session issue to report progress

  v   follow-up (goal + acceptance + scope)

L2 (single dispatch issue, statusId stays "working")
  - decomposes goal into L3 subtasks, builds dependency DAG
  - 15min self cron drives the dispatch loop
  - checks capacity, picks dispatchable subtasks, monitors, evaluates, merges
  - reports rollups + escalations back to L1

  v   create + follow-up (spec + acceptance + report API path)

L3 (one issue per subtask, short-lived)
  - implements one assigned task
  - mandatory diff self-review (engine's review skill if available, else manual; fix P0/P1)
  - auto-moves to review via autoMoveToReview, then follow-ups report to L2
  - never dispatches, never merges
```

## Campaign and DAG State

BKD issue status is limited to `todo`, `working`, `review`, and `done`. The
words `planned`, `dispatched`, `green`, `merged`, and `blocked` in this file are
**L2-internal DAG states**, not BKD `statusId` values. Never PATCH an issue to
`merged` or `blocked`.

Every three-tier campaign needs a stable `campaignId`.

- Generate one at L1 bootstrap before creating L2, e.g.
  `CAMPAIGN_ID="l1-${L1_SESSION_ID}-$(date +%Y%m%d%H%M%S)"`.
- Put it in L2 and L3 titles and tags when the API supports tags.
- If a tagged create request fails because tags are unsupported, retry without
  `tags` but keep the `campaignId` in the title and all follow-up prompts.
- Include it in every L1/L2/L3 follow-up prompt.
- L1 finds owned issues by this `campaignId`, not by guessing from status or
  recent activity.

L2 owns the DAG state. At the end of every L2 turn, emit a compact state block
in the final assistant message so the next cron wake can resume without an
external store:

```text
[dag-state campaignId={campaignId}]
subtasks:
- id={issueId} title="{title}" mode=worktree|simple deps=[...] state=planned|dispatched|green|merged|blocked retries=0
pendingEscalations=[]
[/dag-state]
```

State meanings:

- `planned`: L2 has designed the subtask but has not started it.
- `dispatched`: BKD issue was moved to `working`; L2 is waiting for completion.
- `green`: coordinator quality assessment passed; merge/integration is pending.
- `merged`: work is integrated into main. In simple mode this means the subtask
  passed assessment because it already worked on main; in worktree mode this
  means the branch merged and verification passed.
- `blocked`: L2 cannot continue this subtask without L1/user input. Keep the BKD
  issue in `review` when possible; if it is still active, cancel or let it
  finish before marking the internal state blocked.

## Pre-Flight (every session)

Do this every time L1 starts, before anything else:

1. Load BKD conventions: if your engine supports the `bkd` skill, load it;
   otherwise, treat this file plus `references/rest-api.md` as the authoritative
   reference and proceed via plain HTTP.
2. Auto-detect `$BKD_URL` and `projectId`. If either cannot be confirmed, ask
   the user. **Never guess.**
3. Run health and capacity checks; record `availableSlots`.
   ```bash
   curl -s "$BKD_URL/health" | jq
   curl -s "$BKD_URL/processes/capacity" | jq
   ```
4. If the scope of work is unclear, ask the user. **Never broaden scope on
   your own.**

## L1 - Master Coordinator (current agent session)

L1 **is** the current agent session, whichever engine is running it. It is
itself a BKD process running under some `issueId` (the session issue). The
engine identity does not matter; only BKD HTTP semantics do.

### L1 Responsibilities

- **Identify the session issue** at startup: confirm or obtain the `issueId`
  that backs this session, because that is the cron callback target for L1's
  own wake-ups. If it cannot be obtained, ask the user; if the user cannot
  provide one, fall back to "user manually triggers query each time" and **do
  not register the L1 cron**.
- **Gather requirements** from the user; read code and docs for context.
  Do not write code, do not split tasks.
- Package the result into `{ goal, acceptance criteria, impact scope }` and
  create **exactly one** L2 dispatch issue. Deliver the package via follow-up.
  Include the generated `campaignId`.
- **Register a 60-minute cron** of action `issue-follow-up` targeting L1's own
  session issue. On each wake:
  - Query BKD for issues matching the campaignId (L2 plus its subtasks) and
    summarize progress to the user.
  - Handle yellow / blocked decisions escalated from L2.
  - If the user is absent, log the snapshot and wait for the next wake.
- L1 **does not** create subtasks, build the DAG, write code, or perform merges.
- **Termination conditions:**
  - User explicitly stops -> **delete both L1 and L2 cron jobs** immediately and
    exit (no countdown).
  - Steady-state idle: L2 is in `review`, every L3 issue is in `review` and its
    L2-internal state is `merged` or `blocked`, no `todo`/`working` left, and
    no pending yellow/blocked escalation. Enter the idle countdown (see
    [Idle Termination Countdown](#idle-termination-countdown)).
    On the 3rd consecutive idle wake, produce the final report to the user,
    delete the L1 cron, and exit. The L2 cron should already be gone (L2
    deleted its own cron when it idled out).

### Creating the L2 Dispatch Issue

```bash
L2=$(curl -s -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d '{"title":"[L2] dispatch: {short goal} [{campaignId}]","statusId":"todo","tags":["l2","campaign:{campaignId}"]}')
L2_ID=$(echo "$L2" | jq -r '.data.id')

curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$L2_ID/follow-up" \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "## Role\nYou are the L2 dispatch issue in a three-tier BKD coordination pattern. Your job is to decompose, dispatch, monitor, evaluate, and merge L3 subtasks. Stay in BKD statusId=working. Drive yourself via a 15-minute issue-follow-up cron. Never use sleep.\n\n## Required BKD References\nIf your engine can load repository skills or files, load bkd plus references/three-tier-coordination.md, references/rest-api.md, references/quality-review.md, and references/merge-strategy.md before decomposing. If it cannot, follow the HTTP API and the rules in this prompt.\n\n## Campaign\ncampaignId: {campaignId}\nUse this campaignId in every L3 title, tag, and follow-up.\n\n## DAG State Rules\nBKD statusId values are only todo|working|review|done. Treat planned/dispatched/green/merged/blocked as your own DAG states only; never PATCH an issue to merged or blocked. Emit a [dag-state campaignId={campaignId}] block at the end of every turn with id/title/mode/deps/state/retries for every subtask.\n\n## Goal\n{full goal description}\n\n## Acceptance Criteria\n- {criterion 1}\n- {criterion 2}\n\n## Scope\n- In scope: {paths/modules}\n- Out of scope: {paths/modules}\n\n## L1 Report API\nWhen you need to escalate (yellow/blocked/done), use:\nPOST '"$BKD_URL"'/projects/{projectId}/issues/'"$L1_SESSION_ID"'/follow-up\n\n## Bootstrap\n1. Register a 15-minute cron of action issue-follow-up targeting yourself ('"$L2_ID"').\n2. Decompose the goal into L3 subtasks. Build a dependency DAG using subtask issue ids. Do not parallelize everything.\n3. End this turn with an initial [dag-state campaignId={campaignId}] block. The cron will wake you to start dispatching."
  }' | jq

curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/$L2_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | jq
```

### Registering L1's 60-minute Cron

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "l1-progress-'"$L1_SESSION_ID"'",
    "cron": "0 * * * *",
    "action": "issue-follow-up",
    "config": {
      "projectId": "{projectId}",
      "issueId": "'"$L1_SESSION_ID"'",
      "prompt": "Hourly L1 wake-up for campaignId={campaignId}. Query progress of L2 ('"$L2_ID"') and all campaign subtasks. Summarize for the user. Handle any pending yellow/blocked escalations from L2. End the turn; the next cron will wake you in 60 minutes."
    }
  }' | jq
```

## L2 - Scheduling Issue (singular, stays "working")

The L2 issue is the dispatcher. Every wake of L2 is driven by its 15-minute
self cron. Each wake performs **one decision round**, then ends the turn.
**No `sleep`, ever.**

### L2 Responsibilities

- On bootstrap, register the 15-minute self cron (`issue-follow-up` targeting
  itself) as the loop engine.
- On receiving L1's goal, **autonomously decompose into subtasks and plan
  dependencies.** Use subtask issue ids to form a DAG; decide serial vs parallel
  edges per dependency and per file-overlap risk. Do not parallelize everything.
- **Before every dispatch**: check `/processes/capacity`. If
  `availableSlots == 0`, skip this round; wait for the next cron.
- **Dispatch eligibility**: a subtask may be dispatched only when **all its
  upstream dependencies have L2-internal DAG state `merged`**. Same-stage
  subtasks may run in parallel subject to capacity and file-overlap constraints.
- **Mode selection per subtask:**
  - File overlap likely or parallel work on the same module -> `useWorktree: true`
  - Independent small fix, doc-only, or config change -> simple (`useWorktree: false`)
  - In simple mode, parallel subtasks **must not** touch the same file; if a
    conflict surfaces, switch that subtask to worktree mode.
- **Create L3**: `todo` -> follow-up (spec + acceptance + mandatory self-review
  + full report API path + campaignId) -> move to `working`.
- **Monitoring per subtask** (do not batch — evaluate each completion immediately):
  - Use `logs/filter` to read `error-message`, `assistant-message/turn/last`,
    `tool-use/turn/last3`, and execution scale.
  - Classify result as green / yellow / red (see `quality-review.md`).
  - **green** -> proceed to merge phase.
  - **red** -> follow-up the subtask with the issue, move it back to `working`
    for rework. Retry limit: `N = 2` by default; on exceeding, set the
    L2-internal DAG state to `blocked` and follow-up L1. Do not PATCH BKD
    `statusId` to `blocked`.
  - **yellow** -> follow-up L1 for a human decision. Do not guess.
- **Merge phase (no PR, local main):**
  - Simple mode: subtasks already ran on `main`, no merge needed.
  - Worktree mode: before merging, ensure `git status` is clean (commit or
    stash coordinator-side work). Record `MERGE_BASE`. Merge in dependency
    order with `git merge bkd/{subId} --no-ff`. On conflict: `git merge
    --abort` and escalate to L1. After merge: run build/test. On failure:
    `git revert -m 1 HEAD --no-edit` and send the subtask back to `working`
    with the error details.
- After merging to `main`, leave each subtask in `review`. **Do not move to
  `done`.** `done` is human-only and triggers BKD worktree auto-cleanup.
- After each batch, follow-up L1 with a progress rollup.
- **Termination**: when every subtask has L2-internal DAG state `merged` or
  `blocked`, nothing is `todo`/`working`, and no pending evaluations/merges
  remain, enter the idle countdown (see [Idle Termination Countdown](#idle-termination-countdown)).
  On the 3rd consecutive idle wake:
  1. Follow-up L1 with "all subtasks done; please verify per docs and move
     issues to `done` to trigger worktree auto-cleanup".
  2. Delete the L2 self-cron (`l2-dispatch-{L2_ID}`).
  3. Move L2 itself to `review`.
  4. End turn. L2 will not wake again.

### L2 15-minute Self Cron (bootstrap)

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "l2-dispatch-'"$L2_ID"'",
    "cron": "*/15 * * * *",
    "action": "issue-follow-up",
    "config": {
      "projectId": "{projectId}",
      "issueId": "'"$L2_ID"'",
      "prompt": "L2 dispatch wake-up for campaignId={campaignId}. Run one round: (1) check capacity, (2) dispatch eligible subtasks, (3) evaluate any completed subtasks (green/yellow/red), (4) merge greens in dependency order, (5) escalate yellows/blocks to L1, (6) end with an updated [dag-state campaignId={campaignId}] block. End the turn; the next cron fires in 15 minutes."
    }
  }' | jq
```

## L3 - Subtask Issues (short lifecycle)

Each L3 issue is one short-lived process. It does exactly one assigned task and
exits.

### L3 Responsibilities

- Implement only the assigned task; respect the acceptance criteria.
- **Mandatory self-review** after implementation. The dispatch payload from L2
  describes the required review dimensions; perform the review using whatever
  capability your engine provides:
  - If your engine exposes a code-review skill (for example a `pma-cr`
    equivalent, a Codex review action, or any other registered reviewer),
    invoke it.
  - Otherwise, perform the review manually: walk the diff and check correctness,
    regressions, security/trust boundaries, error handling, concurrency,
    performance, and tests.
  - Either way, fix **all P0 and P1** findings before reporting.
- On completion, BKD `autoMoveToReview` moves the issue `working` -> `review`
  automatically. **Do not manually change status.**
- Send a completion follow-up to L2 using the **full HTTP endpoint provided in
  the dispatch follow-up** (do not invent endpoints, do not rely on
  engine-local shorthands). Include:
  `status / changed files / key decisions / self-review tool used / self-review
  result / remaining issues`.
- L3 **must not** merge, create other issues, or dispatch further work. After
  reporting, exit.

### L3 Dispatch Payload (sent by L2)

```bash
SUB_TITLE="[L3] {subtask title} [{campaignId}]"
USE_WORKTREE=true  # set false for simple-mode subtasks

SUB=$(jq -n \
  --arg title "$SUB_TITLE" \
  --arg campaign "campaign:{campaignId}" \
  --argjson useWorktree "$USE_WORKTREE" \
  '{title:$title,statusId:"todo",useWorktree:$useWorktree,tags:["l3",$campaign]}' \
  | curl -s -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d @-)
SUB_ID=$(echo "$SUB" | jq -r '.data.id')

curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$SUB_ID/follow-up" \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "## Campaign\ncampaignId: {campaignId}\n\n## Requirements\n{detailed implementation spec}\n\n## Acceptance Criteria\n- {criterion 1}\n- {criterion 2}\n\n## Mandatory Self-Review (before reporting)\nAfter implementation:\n1. Review your diff against the acceptance criteria.\n2. Run a code-review pass over the diff. If your engine has a registered review skill (for example a pma-cr-equivalent, a Codex review action, or any other reviewer), invoke it; otherwise perform the review manually.\n3. Review dimensions (priority order): correctness/regressions, security/trust boundaries, data integrity/error handling, concurrency/cancellation/resource lifecycle, performance, maintainability/tests.\n4. Fix ALL P0 and P1 findings.\n5. Only then report.\n\n## Report Endpoint (use exactly this URL)\nPOST '"$BKD_URL"'/projects/{projectId}/issues/'"$L2_ID"'/follow-up\n\nReport JSON shape:\n{\n  \"prompt\": \"campaignId: {campaignId}\\nSubtask '"$SUB_ID"' ({title}) complete\\nStatus: success|failure|partial\\nChanged files: ...\\nKey decisions: ...\\nSelf-review tool: {skill name | manual}\\nSelf-review result: passed | {P0/P1 fixes made}\\nRemaining issues: ...\"\n}\n\n## Strict Rules\n- Self-review and first-round fixes MUST complete before reporting.\n- Use ONLY the /follow-up HTTP endpoint above for inter-issue communication. Do not assume any engine-local slash command is available.\n- Do not merge, do not create other issues, do not dispatch.\n- After reporting, exit."
  }' | jq

curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/$SUB_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | jq
```

## State Machine

Aligned with BKD's built-in flow:

```
todo -> working -> (autoMoveToReview) review -> done   <- done is human-only
                                              ^
                                              |
                          L2 red evaluation pulls back:
                          review/working -> working (rework)
```

- L2 stays `working` for the whole campaign (its 15-min cron keeps waking it).
- L3 subtasks land in `review` and stay there until the user verifies and
  moves them to `done`. `done` triggers BKD worktree auto-cleanup.

## Loop Engine

- **The only driver is the BKD `issue-follow-up` cron.** L1 cron: 60 min.
  L2 cron: 15 min.
- Every wake performs **one round of decisions** and then **ends the turn**.
  The next round waits for the next cron fire.
- **Never** use `sleep`. **Never** poll inside a turn.
- `follow-up` to a `working` + idle issue triggers its next turn immediately.
- If the process has exited, follow-up auto-restarts a new process.

## Idle Termination Countdown

Both L1 and L2 cron loops self-terminate after **3 consecutive idle wakes**.
No external state store is required — the count lives in the issue's own log.

### Idle Definition

A wake is **idle** when, after running its normal decision round, the tier
finds nothing actionable:

- **L2 idle**: zero subtasks in BKD `todo` or `working`, no pending
  green/yellow/red evaluation, no pending merges, no pending escalations, and
  every subtask has L2-internal DAG state `merged` or `blocked`.
- **L1 idle**: L2 is in `review`, every campaign subtask is in BKD `review` and
  has L2-internal DAG state `merged` or `blocked`, no yellow/blocked escalation
  queued, no user input waiting.

Any non-idle action (dispatch, evaluate, merge, escalate, report progress to
user) **resets the counter to 0** for that tier.

### Counting Mechanism

At the end of each idle wake, emit a final assistant message containing a
recognizable marker on its own line:

```
[idle-tick N/3]
```

Where `N` is the count produced by this wake. To compute `N`, the tier reads
its own last 3 assistant-message turns via `logs/filter` and counts only the
consecutive idle markers at the end of that turn list. Non-idle assistant
messages break the streak.

```bash
# Count the trailing consecutive idle-tick markers in the last 3 assistant
# turns (run by L1 or L2 against its own issue id). Assumes the API returns the
# last3 turn slice in chronological order.
PRIOR=$(curl -s "$BKD_URL/projects/{projectId}/issues/{selfIssueId}/logs/filter/types/assistant-message/turn/last3" \
  | jq '[.data[].content] | reverse | reduce .[] as $content ({n:0, stop:false}; if .stop then . elif (($content // "") | contains("[idle-tick")) then .n += 1 else .stop = true end) | .n')
N=$((PRIOR + 1))
```

If the immediately previous assistant turn lacks `[idle-tick`, the streak is
broken; treat this wake as `N=1` and start over. Do not count older idle markers
that are separated from the latest turn by non-idle activity.

### Termination Action (N == 3)

When this wake would be the 3rd consecutive idle tick:

**L2 (idle for 3 rounds):**

```bash
# 1. Final escalation to L1
curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$L1_SESSION_ID/follow-up" \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "[L2 terminating] All subtasks done; nothing to dispatch for 3 consecutive rounds. Please verify per docs and move issues to done to trigger worktree auto-cleanup."}' | jq

# 2. Delete L2 self-cron
curl -s -X DELETE "$BKD_URL/cron/l2-dispatch-$L2_ID" | jq

# 3. Move L2 to review
curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/$L2_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"review"}' | jq

# 4. Emit the terminal marker, then end turn
echo "[idle-tick 3/3 -> L2 terminated]"
```

**L1 (idle for 3 rounds):**

```bash
# 1. Produce final report to user (assistant message in this turn)

# 2. Delete L1 cron
curl -s -X DELETE "$BKD_URL/cron/l1-progress-$L1_SESSION_ID" | jq

# 3. (Defensive) Ensure L2 cron is also gone; safe to call even if already deleted
curl -s -X DELETE "$BKD_URL/cron/l2-dispatch-$L2_ID" | jq

# 4. Emit the terminal marker, then end turn
echo "[idle-tick 3/3 -> L1 terminated]"
```

### Rules

- **Reset on activity**: any non-idle action this wake (even a single subtask
  dispatched or evaluated) makes the wake non-idle. Do NOT emit `[idle-tick]`;
  the next idle wake will start counting from 1.
- **Marker must be the last assistant message of the turn** so `logs/filter
  /turn/lastN` reliably picks it up.
- **3 wakes ~= 45 min for L2, 3 hours for L1.** If you need a different window,
  adjust the cron interval, not the countdown — keep the countdown at 3 so the
  termination logic stays uniform.
- **User explicit stop overrides countdown** — delete crons immediately, do not
  wait for 3 idle ticks.
- **Restart safety**: if L1/L2 is restarted (new process), the new run reads
  the same last-3 turns and continues the count — restarts do not reset the
  streak, only new actionable work does.

## Exceptions and Escalation

- Subtask failure / timeout / red: retry up to `N` (default 2). On exceed:
  set L2-internal DAG state `blocked` and follow-up L1.
- Merge conflict, ambiguous acceptance criteria, or scope changes: L2 does not
  guess. Set L2-internal DAG state `blocked` or classify the result as `yellow`
  and escalate to L1. L1 aggregates and asks the user.
- BKD unreachable / capacity exhausted long term: pause dispatch; L1 notifies
  the user.

## Key Constraints

1. **Inter-issue communication is follow-up only** -
   `POST /projects/{pid}/issues/{iid}/follow-up`.
2. **Check capacity before every dispatch** - `/processes/capacity`.
3. **`review` != `done`** - `done` is human-only and triggers worktree
   auto-cleanup.
4. **Soft delete** - project and issue deletions are soft-delete by default.
5. **No `sleep`, ever** - all waiting is expressed as cron callbacks plus
   ending the current turn.
6. **L1 owns exactly one L2** - never spawn parallel L2 issues for the same
   campaign.
7. **L2 owns the DAG** - dependencies, mode selection, capacity, monitoring,
   evaluation, and merging all live in L2. L1 only handles user-facing
   progress and yellow/blocked decisions.
8. **L3 never dispatches, never merges** - one task in, one report out, exit.
9. **Idle cron self-termination** - L1 and L2 cron loops self-terminate after
   3 consecutive idle wakes; any actionable work resets the streak. See
   [Idle Termination Countdown](#idle-termination-countdown). User explicit
   stop bypasses the countdown.
