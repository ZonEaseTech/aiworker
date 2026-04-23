# Knowledge Classification

Rules for analyzing, classifying, and formatting knowledge points.
Applies to all sources: manual capture, conversation, automated sync.

## Types

| Tag | Definition | Content requirements |
|-----|-----------|---------------------|
| `#fact` | Confirmed technical truth | The fact itself + how it was verified |
| `#event` | Something that happened | What, when, outcome |
| `#discovery` | Unexpected finding, gotcha, pitfall | What was expected vs what happened + workaround |
| `#decision` | Why A over B | Choice made + alternatives considered + rationale |
| `#pattern` | Reusable approach or template | Steps + when to apply + known limitations |

### Type Selection Guide

Ask: **what would someone search for this as?**

- "Does X support Y?" → `#fact`
- "When did we migrate to Z?" → `#event`
- "Watch out for X when doing Y" → `#discovery`
- "Why did we choose X over Y?" → `#decision`
- "How do we do X?" → `#pattern`

If it fits multiple types, pick the primary one. Don't duplicate.

## Tags

- **Type** (required, exactly one): `#fact` `#event` `#discovery` `#decision` `#pattern`
- **Additional** (optional, free-form): agent decides based on content

Keep tags lowercase, single-word or hyphenated. Reuse existing tags over inventing new ones.
Query existing tags before creating: `curl -s -H "$AUTH" "$API/memos?pageSize=200" | jq '[.memos[].tags[]] | unique | sort'`

## Memo Format

```markdown
## {title}

{content}

#{type}

<!-- {topicHash} from:{origin} -->
```

### Title

- Short, specific, searchable
- Good: "Bun SQLite does not support WAL2 mode"
- Bad: "Database issue" or "Interesting finding about SQLite"

### Content

Preserve **context and reasoning**, not just the conclusion:

- **fact**: what is true + how we confirmed it + edge cases
- **event**: what happened + timeline + impact
- **discovery**: what was expected + what actually happened + root cause + workaround
- **decision**: what we chose + what we rejected + why + constraints that shaped the choice
- **pattern**: problem it solves + steps + when to use + when NOT to use

Never strip the "why" to save space. A fact without context is trivia.

### Metadata Comment

`<!-- {topicHash} from:{origin} -->` — last line of memo, HTML comment.

- `topicHash` = first 8 chars of `echo -n "$TITLE" | md5sum | cut -c1-8` — **dedup key**
- `from:` = knowledge origin (e.g. `session`, `bkd/issueId`, `manual`, `merge`)

For merged memos: `<!-- {newHash} from:merge merged:{hash1},{hash2},{hash3} -->`

## What to Capture

### Capture

- Non-obvious technical facts confirmed through debugging
- Decisions with rationale (especially when alternatives were tempting)
- Gotchas, pitfalls, "I wish I knew this earlier"
- Reusable workflows or patterns that worked well
- Corrections — user said "no, actually..." about a prior assumption

### Skip

- Routine CRUD operations
- Obvious fixes (typos, missing imports)
- Ephemeral state (current branch, in-progress task status)
- Information already in code comments or README
- Anything trivially re-derivable from the codebase

### Quality Check

Before saving, ask:

1. **Would someone search for this?** If not, skip.
2. **Is the "why" preserved?** If not, add it.
3. **Is this already known?** Query first, update if exists.
4. **Is this one knowledge point?** If it covers two topics, split.

## Consolidation Rules

When reviewing memos for merging:

### Merge candidates

- **Near-duplicates**: same insight, different wording (from different issues/sessions)
- **Superseded**: early fact/discovery later corrected or refined
- **Fragments**: 3+ small memos that together form one coherent topic

### Merge process

1. Pick the best version as the base
2. Incorporate unique context from others
3. New topicHash from new title
4. `merged-from:` lists all original hashes
5. Archive originals (`state: ARCHIVED`), don't delete
6. Link merged memo → originals via `REFERENCE` relation

### Don't merge

- Different types (a fact and a decision about the same topic are both valuable)
- Contradicting entries — flag for human review instead
