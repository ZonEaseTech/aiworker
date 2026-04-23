# Storage API (Memos)

> Memos v0.27.0 — gRPC-gateway REST. Base: `/api/v1/`.
> Auth: `Authorization: Bearer $MEMOS_TOKEN`.

## Conventions

- **Update mask**: `PATCH /memos/{uid}?updateMask=content&updateMask=visibility`
- **Pagination**: `?pageSize=N&pageToken=TOKEN` → `nextPageToken`
- **Filter**: `?filter=expression` (CEL-like)
- **Resource names**: `memos/{uid}`, `users/{username}`
- **Errors**: `{"code": N, "message": "..."}` — 3=invalid, 5=not found, 16=unauthenticated

## Memo CRUD

```
POST   /api/v1/memos                              # Create
GET    /api/v1/memos?pageSize=N&filter=EXPR        # List
GET    /api/v1/memos/{uid}                         # Get
PATCH  /api/v1/memos/{uid}?updateMask=...          # Update
DELETE /api/v1/memos/{uid}                         # Delete
```

### Create

```json
{"content": "markdown with #tags", "visibility": "PRIVATE|PROTECTED|PUBLIC"}
```

### Update

Updatable fields: `content`, `visibility`, `state`, `pinned`, `displayTime`, `location`.

### State

- `NORMAL` / `ARCHIVED`
- Archive: `PATCH ?updateMask=state` with `{"state": "ARCHIVED"}`

### Pin

- `PATCH ?updateMask=pinned` with `{"pinned": true}`

## Filters

```
filter=content.contains("keyword")
filter=tag in ["type/fact","project/access"]
filter=creator=="users/roy"
filter=visibility in ["PUBLIC"]
filter=create_time>"2024-01-01T00:00:00Z"
filter=pinned==true
filter=has_link==true
filter=has_task_list==true
order_by=create_time desc
```

## Relations

```
GET    /api/v1/memos/{uid}/relations
PATCH  /api/v1/memos/{uid}/relations
```

```json
{"relations": [{"relatedMemo": "memos/{otherUid}", "type": "REFERENCE"}]}
```

Types: `REFERENCE`, `COMMENT`.

## Comments

```
GET    /api/v1/memos/{uid}/comments
POST   /api/v1/memos/{uid}/comments
```

```json
{"comment": {"content": "comment text"}}
```

## Reactions

```
GET    /api/v1/memos/{uid}/reactions
POST   /api/v1/memos/{uid}/reactions       {"reactionType": "👍"}
DELETE /api/v1/memos/{uid}/reactions/{id}
```

## Attachments

```
POST   /api/v1/attachments                 {"filename":"f.png","content":"base64","type":"image/png"}
GET    /api/v1/attachments/{uid}
DELETE /api/v1/attachments/{uid}
PATCH  /api/v1/memos/{uid}/attachments      {"attachments": ["attachments/{uid}"]}
GET    /api/v1/memos/{uid}/attachments
```

## Users

```
GET    /api/v1/users
GET    /api/v1/users/{username}
GET    /api/v1/users/{username}:getStats
GET    /api/v1/users/{username}/settings
```

## Instance

```
GET    /api/v1/instance/profile                     # No auth
GET    /api/v1/instance/settings/{GENERAL|STORAGE|MEMO_RELATED}
```

## Pagination Pattern

```bash
PAGE_TOKEN=""
while true; do
  RESP=$(curl -s -H "$AUTH" "$API/memos?pageSize=50&pageToken=$PAGE_TOKEN")
  echo "$RESP" | jq '.memos[]'
  PAGE_TOKEN=$(echo "$RESP" | jq -r '.nextPageToken // empty')
  [ -z "$PAGE_TOKEN" ] && break
done
```

## Tags

Tags are extracted from `#tag` in memo content. No separate tag API.
Nested tags work: `#type/fact`, `#project/access`, `#topic/auth`.
