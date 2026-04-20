# BKD REST API Reference

Use this file when the `bkd` skill needs exact BKD routes, payload shapes, or
operational examples.

## Setup

```bash
BKD_URL="http://your-host:port/api"
```

BKD responses use one of these envelopes:

- Success: `{ "success": true, "data": ... }`
- Failure: `{ "success": false, "error": "..." }`

## Health

```bash
curl -s "$BKD_URL/health" | jq
```

## Capacity Check

Use this before starting more issue executions.

```bash
curl -s "$BKD_URL/processes/capacity" | jq
```

Response fields:

- `summary.totalActive`
- `summary.byState`
- `summary.byEngine`
- `summary.byProject`
- `maxConcurrent`
- `availableSlots`
- `canStartNewExecution`

## Projects

### List projects

```bash
curl -s "$BKD_URL/projects" | jq
```

### Get project

```bash
curl -s "$BKD_URL/projects/{projectId}" | jq
```

### Create project

```bash
curl -s -X POST "$BKD_URL/projects" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my-project",
    "description": "Optional description",
    "directory": "/path/to/workspace",
    "repositoryUrl": "https://github.com/example/repo"
  }' | jq
```

Useful fields:

- `name`
- `alias`
- `description`
- `directory`
- `repositoryUrl`
- `systemPrompt`
- `envVars`

## Issues

All issue routes are project-scoped:

`/api/projects/{projectId}/issues/...`

### Create issue

Prefer the safe flow: create in `todo`, then follow up, then move to `working`.

```bash
curl -s -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "fix auth bug",
    "statusId": "todo",
    "useWorktree": true
  }' | jq
```

Useful fields:

- `title`
- `statusId`: `todo|working|review|done`
- `engineType`
- `model`
- `useWorktree`
- `keepAlive`
- `tags`
- `permissionMode`

### List or get issues

```bash
curl -s "$BKD_URL/projects/{projectId}/issues" | jq
curl -s "$BKD_URL/projects/{projectId}/issues/{issueId}" | jq
```

### Update issue

```bash
curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/{issueId}" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | jq
```

Common fields:

- `title`
- `statusId`
- `tags` with `null` to clear tags
- `keepAlive`
- `isPinned`
- `sortOrder`

### Delete issue

```bash
curl -s -X DELETE "$BKD_URL/projects/{projectId}/issues/{issueId}" | jq
```

## Issue Execution

The normal BKD execution trigger is moving the issue to `working`.

```bash
curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/{issueId}" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | jq
```

Recommended sequence:

1. Create the issue in `todo`
2. Send details with `follow-up`
3. Move the issue to `working`

### Follow-up issue

```bash
curl -s -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/follow-up" \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Also fix the logout flow and add tests."
  }' | jq
```

Fields:

- `prompt`
- `model`
- `permissionMode`
- `busyAction`
- `meta`
- `displayPrompt`

Behavior:

- `todo` or `done`: queued, waits for status change
- `review`: queued, waits for status change
- `working` during an active turn: queued, processed after current turn ends
- `working` when idle: immediate, triggers next turn

### Restart or cancel

```bash
curl -s -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/restart" | jq
curl -s -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/cancel" | jq
```

## Issue Changes

Get files changed by an issue (useful before merging worktree branches):

```bash
curl -s "$BKD_URL/projects/{projectId}/issues/{issueId}/changes" | jq
```

## Issue Logs

### Get logs

```bash
curl -s "$BKD_URL/projects/{projectId}/issues/{issueId}/logs?limit=50" | jq
```

Useful query params:

- `cursor`
- `before`
- `limit`

### Filtered logs

Use the filter API to pull specific log slices without fetching full logs.

```
GET /projects/{projectId}/issues/{issueId}/logs/filter/{filter_path}
```

#### Filter path syntax

| Dimension | Format | Example |
|-----------|--------|---------|
| Entry types | `types/{type1,type2}` | `types/tool-use` |
| Single turn | `turn/{n}` | `turn/3` |
| Turn range | `turn/{start-end}` | `turn/2-5` |
| Last turn | `turn/last` | `turn/last` |
| Last N turns | `turn/last{N}` | `turn/last3` |
| Combined | concatenate | `types/tool-use/turn/last3` |

Available entry types: `user-message` `assistant-message` `tool-use` `system-message` `thinking` `error-message` `token-usage`

## Worktrees

### Delete worktree

```bash
curl -s -X DELETE "$BKD_URL/projects/{projectId}/worktrees/{issueId}" | jq
```

BKD auto-cleans worktrees 1 day after an issue enters `done`. The cleanup cycle runs every 30 minutes and is controlled by the `worktree:autoCleanup` application setting.

## Cron Jobs

Use `GET /cron/actions` when you need the current server help text.

### List cron jobs

```bash
curl -s "$BKD_URL/cron" | jq
```

Useful query params:

- `limit`
- `cursor`
- `deleted=false|true|only`

### List cron actions

```bash
curl -s "$BKD_URL/cron/actions" | jq
```

### Create cron job

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "daily-cleanup",
    "cron": "@daily",
    "action": "upload-cleanup",
    "config": {}
  }' | jq
```

Generic fields:

- `name`
- `cron`
- `action`
- `config`

### Issue cron actions

#### `issue-execute`

Required config: `projectId`, `issueId`, `prompt`
Optional config: `engineType`, `model`

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "nightly-issue-execute",
    "cron": "@daily",
    "action": "issue-execute",
    "config": {
      "projectId": "my-project",
      "issueId": "abc12345",
      "prompt": "Run the nightly maintenance task and report the result.",
      "engineType": "claude-code"
    }
  }' | jq
```

#### `issue-follow-up`

Required config: `projectId`, `issueId`, `prompt`
Optional config: `model`

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "morning-follow-up",
    "cron": "@hourly",
    "action": "issue-follow-up",
    "config": {
      "projectId": "my-project",
      "issueId": "abc12345",
      "prompt": "Post a status check-in and ask for the next step."
    }
  }' | jq
```

#### `issue-close`

Required config: `projectId`, `issueId`
Optional config: `targetStatus` (default `done`)

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "close-stale-review-item",
    "cron": "@weekly",
    "action": "issue-close",
    "config": {
      "projectId": "my-project",
      "issueId": "abc12345",
      "targetStatus": "done"
    }
  }' | jq
```

#### `issue-check-status`

Required config: `projectId`, `issueId`

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "check-issue-status",
    "cron": "@every_minute",
    "action": "issue-check-status",
    "config": {
      "projectId": "my-project",
      "issueId": "abc12345"
    }
  }' | jq
```

### Trigger, pause, resume, delete

For these operations, `{job}` may be the job ID or job name.

```bash
curl -s -X POST "$BKD_URL/cron/{job}/trigger" | jq
curl -s -X POST "$BKD_URL/cron/{job}/pause" | jq
curl -s -X POST "$BKD_URL/cron/{job}/resume" | jq
curl -s -X DELETE "$BKD_URL/cron/{job}" | jq
```

### Get cron job logs

```bash
curl -s "$BKD_URL/cron/{jobId}/logs?limit=20" | jq
```

Supported query params:

- `status=success|failed|running`
- `cursor`
- `limit`
