# Knowledge Sync

Workflow for extracting knowledge from task/issue tracking systems and storing in Memos.

## Overview

```
Source system (BKD, Linear, GitHub, etc.)
  │
  ├─ 1. Discover   — find completed work items (review/done)
  ├─ 2. Extract    — pull conversation logs / comments / history
  ├─ 3. Classify   — agent splits into typed knowledge points
  ├─ 4. Dedup      — check topicHash against existing memos
  ├─ 5. Write      — create/update memos, link relations
  ├─ 6. Mark       — tag source item as scanned (ms:{unix_ts})
  └─ 7. Consolidate — periodically merge near-duplicates
```

## Prerequisites

```bash
AUTH="Authorization: Bearer $MEMOS_TOKEN"
API="$MEMOS_URL/api/v1"
```

## Step 1: Discover Target Items

Scan source system for completed work items that haven't been synced or have been updated since last sync.

**Filter logic**: status is review/done AND (no `ms:` marker OR `ms:{ts}` < item's updateTime).

The `ms:` marker is a tag/label on the source item. Format: `ms:{unix_timestamp}`.

### Example: BKD

```bash
for PID in $(curl -s "$BKD_URL/projects" | jq -r '.data[].id'); do
  curl -s "$BKD_URL/projects/$PID/issues" | jq -r '
    [.data[] | select(
      (.statusId == "review" or .statusId == "done") and
      ((.tags // []) | map(select(startswith("ms:"))) | length == 0
       or
       ((.tags // []) | map(select(startswith("ms:"))) | .[0] | ltrimstr("ms:") | tonumber) as $scanned |
       (.updatedAt | fromdateiso8601) > $scanned)
    )] | .[] | "\(.id)\t\(.title)\t\(.updatedAt)"
  '
done
```

### Example: GitHub Issues

```bash
gh issue list --state closed --json number,title,updatedAt --limit 50
# Filter by absence of "ms:" label or outdated timestamp
```

### Example: Linear

```bash
# Use Linear API to query completed issues
# Filter by completedAt > last sync timestamp
```

## Step 2: Extract Content

Pull the full conversation/history from each target item. Three signal types:

| Signal | Source examples | Knowledge value |
|--------|----------------|-----------------|
| User input | Comments, requirements, corrections | Context, constraints, preferences |
| Reasoning | Thinking logs, discussion threads | Trade-offs, alternatives considered |
| Conclusions | Final messages, PR descriptions | Solutions, explanations |

Pull **all content**, not just the latest — knowledge can appear at any stage.

### Example: BKD

```bash
curl -s "$BKD_URL/projects/$PID/issues/$ISSUE_ID/logs/filter/types/user-message,thinking,assistant-message" | jq
```

Add `tool-use` when specific operations matter (e.g. for `#pattern` extraction).
Paginate with `?limit=100&cursor=...` if logs are large.

### Example: GitHub

```bash
gh issue view $NUMBER --comments --json body,comments
gh pr view $NUMBER --comments --json body,comments,reviews
```

## Step 3: Classify Knowledge Points

Agent analyzes extracted content and splits into discrete knowledge points.
Apply rules from `references/classification.md` — type selection, content requirements, quality checks.

Output per point:

```yaml
- title: "Short descriptive title"
  type: fact | event | discovery | decision | pattern
  content: |
    Preserved context and reasoning.
    Not just a summary — include the WHY.
  topicHash: first 8 chars of md5(title)
```

## Step 4: Dedup & Write

For each knowledge point:

```bash
TOPIC_HASH=$(echo -n "$TITLE" | md5sum | cut -c1-8)

# Check existing by topicHash
EXISTING=$(curl -s -H "$AUTH" \
  "$API/memos?filter=content.contains(\"$TOPIC_HASH\")" | jq)
COUNT=$(echo "$EXISTING" | jq '.memos | length')

CONTENT=$(cat <<MEMO
## $TITLE

$BODY

#$TYPE

<!-- $TOPIC_HASH from:bkd/$ISSUE_ID -->
MEMO
)

if [ "$COUNT" -eq 0 ]; then
  NEW_UID=$(curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
    "$API/memos" \
    -d "{\"content\":$(echo "$CONTENT" | jq -Rs .),\"visibility\":\"PRIVATE\"}" \
    | jq -r '.uid')

elif [ "$COUNT" -eq 1 ]; then
  EXISTING_UID=$(echo "$EXISTING" | jq -r '.memos[0].uid')
  curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
    "$API/memos/$EXISTING_UID?updateMask=content" \
    -d "{\"content\":$(echo "$CONTENT" | jq -Rs .)}" | jq
fi
```

## Step 5: Link Related Memos

Knowledge points from the same source item should be linked:

```bash
MEMO_UIDS=("uid1" "uid2" "uid3")

for UID in "${MEMO_UIDS[@]}"; do
  RELATIONS=$(printf '{"relatedMemo":"memos/%s","type":"REFERENCE"},' \
    $(printf '%s\n' "${MEMO_UIDS[@]}" | grep -v "$UID"))
  RELATIONS="[${RELATIONS%,}]"

  curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
    "$API/memos/$UID/relations" \
    -d "{\"relations\":$RELATIONS}" | jq
done
```

## Step 6: Mark Source Item as Scanned

Add `ms:{unix_timestamp}` marker to the source item. Mechanism depends on the source system:

| System | Marker mechanism |
|--------|-----------------|
| BKD | Issue tag: `ms:1744300800` |
| GitHub | Issue label: `ms:1744300800` |
| Linear | Issue label or custom field |
| Generic | Any metadata field the system supports |

### Example: BKD

```bash
CURRENT_TAGS=$(curl -s "$BKD_URL/projects/$PID/issues/$ISSUE_ID" \
  | jq '[.data.tags // [] | .[] | select(startswith("ms:") | not)]')
UPDATE_TIME=$(date +%s)
NEW_TAGS=$(echo "$CURRENT_TAGS" | jq --arg t "ms:$UPDATE_TIME" '. + [$t]')

curl -s -X PATCH "$BKD_URL/projects/$PID/issues/$ISSUE_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"tags\":$NEW_TAGS}" | jq
```

## Incremental Update Logic

```
item.updatedAt vs ms:{ts} marker:

  no marker        → first scan: extract all, create memos
  marker < updated → re-scan: extract all, dedup by topicHash
                     same hash: update content if changed
                     new hash: create new memos
                     missing hash: leave as-is (don't delete)
  marker >= updated → skip, no changes
```

The topicHash (md5 of title, first 8 chars) is the sole dedup key.
Source system IDs are only used for scanning and optional traceability tags.

## Knowledge Consolidation

See `references/classification.md` for merge rules, format, and triggers.

Consolidation operations (find candidates → create merged → archive originals → link):

```bash
# 1. Find candidates
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"auth\"]&pageSize=100" \
  | jq '.memos[]|{uid,snippet,content}'

# 2. Create merged memo
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos" \
  -d "{\"content\":$(echo "$MERGED_CONTENT" | jq -Rs .),\"visibility\":\"PRIVATE\"}" | jq

# 3. Archive originals
for UID in $OLD_UIDS; do
  curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
    "$API/memos/$UID?updateMask=state" \
    -d '{"state":"ARCHIVED"}' | jq
done

# 4. Link merged → originals
RELATIONS=$(printf '{"relatedMemo":"memos/%s","type":"REFERENCE"},' $OLD_UIDS)
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos/$MERGED_UID/relations" \
  -d "{\"relations\":[${RELATIONS%,}]}" | jq
```

## Automation Guide

This skill can be automated with any scheduler that can trigger an agent periodically.

### Requirements

1. A **persistent agent session** (e.g. keepAlive issue in BKD, long-running process, or scheduled trigger)
2. The agent must have access to `$MEMOS_URL`, `$MEMOS_TOKEN`, and source system credentials
3. Two scheduled tasks: **sync** (daily) and **consolidation** (weekly)

### Scheduler Examples

#### BKD Cron

```bash
# Create keepAlive issue as sync agent
ISSUE=$(curl -s -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d '{"title":"knowledge-sync","statusId":"todo","keepAlive":true}')
ISSUE_ID=$(echo "$ISSUE" | jq -r '.data.id')

curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$ISSUE_ID/follow-up" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"You are a knowledge sync agent. Use the pma-mem skill."}' | jq

curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/$ISSUE_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | jq

# Daily sync
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "knowledge-sync",
    "cron": "@daily",
    "action": "issue-follow-up",
    "config": {
      "projectId": "...",
      "issueId": "'"$ISSUE_ID"'",
      "prompt": "Run sync: scan all projects for completed items, extract knowledge, dedup, store."
    }
  }' | jq

# Weekly consolidation
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "knowledge-consolidate",
    "cron": "@weekly",
    "action": "issue-follow-up",
    "config": {
      "projectId": "...",
      "issueId": "'"$ISSUE_ID"'",
      "prompt": "Run consolidation: find and merge near-duplicate memos."
    }
  }' | jq
```

#### Claude Code Scheduled Triggers

```bash
# Using Claude Code remote triggers (if available)
# Daily sync
claude trigger create --name knowledge-sync --cron "@daily" \
  --prompt "Use pma-mem skill. Run knowledge sync workflow."

# Weekly consolidation
claude trigger create --name knowledge-consolidate --cron "@weekly" \
  --prompt "Use pma-mem skill. Run consolidation workflow."
```

#### System Cron + CLI

```bash
# crontab -e
0 2 * * * claude --prompt "Use pma-mem skill. Run knowledge sync." 2>&1 >> /var/log/knowledge-sync.log
0 3 * * 0 claude --prompt "Use pma-mem skill. Run consolidation." 2>&1 >> /var/log/knowledge-consolidate.log
```

### Frequency Guide

| Task | Recommended | Rationale |
|------|-------------|-----------|
| Sync | `@daily` | Most items don't change status more than once a day |
| Consolidation | `@weekly` | Accumulation is slow; weekly catches overlaps |
| On-demand | manual trigger | After a burst of completions |

### Monitoring

```bash
# Recent memos
curl -s -H "$AUTH" \
  "$API/memos?order_by=create_time+desc&pageSize=10" \
  | jq '.memos[]|{uid,snippet,createTime}'

# Count by type
for TYPE in fact event discovery decision pattern; do
  COUNT=$(curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"$TYPE\"]" | jq '.memos | length')
  echo "$TYPE: $COUNT"
done
```

## Retrieval Examples

```bash
# By type
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"discovery\"]" | jq '.memos[]|{uid,snippet}'

# By type + keyword
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"decision\"]" \
  | jq '.memos[]|.content' | grep -i "keyword"

# Full-text
curl -s -H "$AUTH" "$API/memos?filter=content.contains(\"keyword\")" | jq '.memos[]|{uid,snippet}'

# Count by type
for TYPE in fact event discovery decision pattern; do
  COUNT=$(curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"$TYPE\"]" | jq '.memos | length')
  echo "$TYPE: $COUNT"
done
```
