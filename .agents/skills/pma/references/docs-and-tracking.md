# PMA Docs And Tracking

## Canonical Structure

```text
docs/
├── task/
│   ├── index.md
│   └── PREFIX-NNN.md
├── plan/
│   ├── index.md
│   └── PLAN-NNN.md
├── architecture.md
└── changelog.md
```

## Required Files

- `docs/task/index.md`: one-line task entries
- `docs/task/PREFIX-NNN.md`: task detail files
- `docs/plan/index.md`: one-line plan entries
- `docs/plan/PLAN-NNN.md`: plan detail files
- `docs/architecture.md`
- `docs/changelog.md`

Use these format references:

- [task-format.md](/app/zzci/skills/skills/pma/docs/task-format.md)
- [plan-format.md](/app/zzci/skills/skills/pma/docs/plan-format.md)

## Documentation Rules

- Use English for repository docs and headings by default.
- Use Chinese docs only when the user explicitly requests a specific document in Chinese.
- Keep filenames in English even when content is Chinese.
- Write investigation findings into the relevant plan context section.
- Do not create extra report files; temporary files belong in `./tmp/`.

## Changelog Conventions

Entry format:

```markdown
## YYYY-MM-DD HH:MM [tag]

[content]
```

Recommended tags:

- `[progress]`
- `[BUG-P0]`
- `[BUG-P1]`
- `[pitfall]`
- `[decision]`

## Project Initialization

On first use in a project:

1. Ensure `CLAUDE.md` contains a `## Project Development` section that references `/pma`.
2. Ensure `AGENTS.md` contains the same section.
3. Ensure `docs/task/index.md` exists and follows the canonical format.
4. Ensure `docs/plan/index.md` exists and follows the canonical format.
5. Ensure `architecture.md` and `changelog.md` exist and are initialized in English unless explicitly requested otherwise.
