---
name: pma-mem
description: Knowledge management skill for capturing, classifying, searching, and syncing project knowledge. Use when storing learnings, syncing BKD issue outcomes, or retrieving past decisions and patterns. Memos is the storage backend.
---

# Knowledge Palace

Capture and retrieve project knowledge. Storage backend: Memos (`$MEMOS_URL`, `$MEMOS_TOKEN`).

## Always-On Rules

1. Confirm `$MEMOS_URL` and `$MEMOS_TOKEN` before any operation. If missing, ask the user.
2. Every knowledge entry must have a **type tag**.
3. Before writing, **always check for duplicates** by topicHash.
4. One memo = one knowledge point. Never bundle multiple topics into a single memo.
5. Related knowledge points must be linked via memo relations (`REFERENCE`).
6. **Before implementing**: query relevant knowledge first. Check for existing decisions, discoveries, and patterns that may apply to the current task.

## When to Query

Agents should query the knowledge base in these situations:

- **Hitting an error or unexpected behavior**: query `#discovery` + keyword — someone may have seen this before
- **Making a technical choice**: query `#decision` + keyword — check if a decision was already made and why
- **Implementing a pattern**: query `#pattern` + keyword — reuse proven approaches
- **Verifying an assumption**: query `#fact` + keyword — confirm before building on it

## Knowledge Types

5 types, flat tags, exactly one per memo:

`#fact` · `#event` · `#discovery` · `#decision` · `#pattern`

Additional tags are optional and free-form — agent decides based on content.

Full classification rules, content guidelines, and quality checks: see `references/classification.md`.

## Memo Format

```markdown
## {title}

{content — preserve context and reasoning, not just the conclusion}

#fact

<!-- {topicHash} from:{origin} -->
```

- Bottom comment is metadata: `topicHash` (dedup key, first 8 chars of md5(title)) + `from:` (knowledge origin, e.g. `session`, `bkd/issueId`, `manual`)
- Tags go in content body, not in metadata

## Operations

### Write

```bash
AUTH="Authorization: Bearer $MEMOS_TOKEN"
API="$MEMOS_URL/api/v1"

# 1. Check duplicate by topicHash
HASH=$(echo -n "Title here" | md5sum | cut -c1-8)
EXISTS=$(curl -s -H "$AUTH" \
  "$API/memos?filter=content.contains(\"$HASH\")" \
  | jq '.memos | length')

# 2. Create (if not exists)
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos" \
  -d '{"content":"## Title\n\nContent\n\n#fact\n\n<!-- '"$HASH"' from:session -->","visibility":"PRIVATE"}' | jq

# 3. Update (if exists and changed)
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos/{uid}?updateMask=content" \
  -d '{"content":"...updated..."}' | jq

# 4. Link related memos
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos/{uid}/relations" \
  -d '{"relations":[{"relatedMemo":"memos/{otherUid}","type":"REFERENCE"}]}' | jq
```

### Query

Use queries to retrieve knowledge before acting. Return content to the agent context.

```bash
# By type
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"discovery\"]" \
  | jq '.memos[]|{uid,snippet}'

# By type + keyword
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"decision\"]" \
  | jq '.memos[]|.content' | grep -i "keyword"

# Full-text search
curl -s -H "$AUTH" \
  "$API/memos?filter=content.contains(\"keyword\")" \
  | jq '.memos[]|{uid,snippet}'

# Get full content
curl -s -H "$AUTH" "$API/memos/{uid}" | jq '.content'

# Follow links
curl -s -H "$AUTH" "$API/memos/{uid}/relations" \
  | jq '.relations[].relatedMemo'
```

### Capture

During a conversation, when the user says "remember this" / "save this" / "store this",
or when the agent identifies knowledge worth preserving:

1. Extract one or more knowledge points from the current conversation
2. For each point, assign type + tags, generate topicHash
3. Dedup → create/update → link if multiple points

The agent should also **proactively suggest** capturing when it encounters:
- A non-obvious technical fact confirmed through debugging
- A decision made after weighing alternatives
- A gotcha or pitfall discovered during implementation
- A reusable pattern or workflow that worked well

### Consolidate

On-demand: user asks to clean up or the agent notices overlapping memos during a query.

1. Load a tag group: `curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"auth\"]&pageSize=100" | jq`
2. Review for near-duplicates, superseded facts, or fragments
3. Merge into one memo, archive originals — see `references/knowledge-sync.md` for details

## Reference Packs

- `references/classification.md`
  Type definitions, content guidelines, tagging rules, quality checks, consolidation rules.
- `references/storage-api.md`
  Memos REST API reference (CRUD, filters, relations, pagination, attachments).
- `references/knowledge-sync.md`
  Automated sync workflow: scanning, extraction, dedup, incremental update, automation guide.

## Quick Routing

- Classifying or formatting knowledge: load `references/classification.md`.
- API details (updateMask, filters, error codes): load `references/storage-api.md`.
- Automated sync from task systems: load `references/knowledge-sync.md`.
- Simple capture or query: use operations above directly.
