# PMA Delivery Rules

## Shell And Process Management

- Prefer `bash` for all command execution. Do not use `zsh` unless explicitly requested.
- When a tool supports explicit shell selection, set it to `bash`.
- Never use `kill $(lsof -ti:PORT)` without `-sTCP:LISTEN`.

### Tmux Persistent Sessions

Always use tmux for dev servers, test servers, and long-running processes.

**Session naming:**

```bash
SESSION=$(basename "$PWD" | tr '.' '-')-$(echo -n "$PWD" | md5sum | cut -c1-6)
```

`tr '.' '-'` is required because tmux session names cannot contain dots.
Worktrees of the same project get distinct names automatically.

**Creating sessions — always use a persistent shell:**

```bash
# WRONG: process exit kills the session
tmux new-session -d -s $SESSION 'bun run dev'

# CORRECT: persistent shell survives process restarts
tmux new-session -d -s $SESSION /bin/bash
tmux send-keys -t $SESSION 'bun run dev' Enter
```

**Before starting:** check for existing sessions first, reuse or restart.

```bash
tmux has-session -t $SESSION 2>/dev/null && echo "exists" || echo "not found"
```

**If session exists:** send keys to restart the process.

```bash
tmux send-keys -t $SESSION C-c
tmux send-keys -t $SESSION 'bun run dev' Enter
```

**If session does not exist:** create with persistent shell.

```bash
tmux new-session -d -s $SESSION /bin/bash
tmux send-keys -t $SESSION 'bun run dev' Enter
```

**Checking output:**

```bash
tmux capture-pane -t $SESSION -p
```

**Stopping:**

```bash
tmux send-keys -t $SESSION C-c
# Or kill the entire session:
tmux kill-session -t $SESSION
```

**Rules:**

- Never kill ports as the first approach — manage process lifecycle through tmux.
- Always check for an existing session before creating a new one.
- One tmux session per service — do not multiplex unrelated services.

## Git Conventions

- Use English for commits, PR titles, PR descriptions, and all remote-visible metadata.
- Do not mention AI assistants, agents, or model names (Claude, Codex, ChatGPT, OpenAI, Anthropic, etc.) in commits, PR text, comments, or any remote-visible content.
- Use conventional commits: `<type>: <description>`.
- Chinese must not appear in code or documentation unless the user explicitly requests it.

## Pull Request Workflow

Before creating or updating a PR:

1. Review the full diff from the branch point.
2. Run code review focused on correctness, regressions, and missing tests.
3. Run a security review.
4. Ensure build passes.
5. Ensure lint passes.
6. Ensure tests pass.

PR body format:

```markdown
## Summary
- ...

## Test plan
- [ ] ...
```

## PR Review Checklist

- all review and security checks pass
- build, lint, and tests pass
- commit history is clean
- task and plan state are synced
- changelog updated if required

## CI Pipeline

Standard stages:

```text
format/lint -> static checks -> build -> test -> security review
```

CI commands come from the active stack skill or existing project scripts.

## GitHub Actions Conventions

- workflows live in `.github/workflows/`
- pin actions to full SHAs
- run on `pull_request` and `push`
- align cache and toolchain setup with the active project stack

## Tools And Security

- Never skip checks with `--no-verify`.
- Stop and escalate when a serious security issue is found.
- Review auth, secrets, outbound HTTP, and config changes with extra scrutiny.
