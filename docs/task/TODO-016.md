# TODO-016 `aiworker serve` silently succeeds when port already bound, curl hits stale serve

- **status**: pending
- **priority**: P2
- **owner**: unassigned
- **createdAt**: 2026-05-04 22:10
- **discoveredAt**: 2026-05-04 22:07
- **plan**: TBD
- **relatesTo**: serve / process management

## Observed Behavior

Encountered during 0.7.0 release-debug Phase 7 REST smoke. A leftover `aiworker serve --port 19310` from yesterday's 0.6.0 debug (different `npm-prefix` install, different worker.db, different worker id) was still alive on port 19310.

Re-running `aiworker serve --port 19310 --no-open` (via `setsid + > log 2>&1 &`) did not visibly fail. Shell got a `$!` that pointed to the setsid wrapper (already exited), not the real aiworker process. `kill -TERM $(cat $PID)` reported "No such process".

`/health` came back 200 with `workerId=w_knyt2wnchn7n` — the leftover 0.6.0 worker. The freshly minted bearer token (from 0.7.0 dev project, worker `w_0rmz3bz0fwy7`) was sent and got `auth-failed` on every endpoint, but the failure mode looked identical to "auth wrong" rather than "you are talking to the wrong server".

The aiworker bind error (`EADDRINUSE`) only appeared in the redirected `serve.log` file — never propagated to shell stderr.

## Why this matters

- Common operator scenario: previous serve from a different project, branch, or version is still alive when a new one is started
- Without port preflight, ALL subsequent debug becomes nonsense — token mismatch → 401 cascade across every endpoint, but `/health` is a happy-path response, hiding the root cause
- Even after the port is freed and serve is correct, the lingering 1100+ items in `~/.aiworker/workers/` (from the user-global install) hint that prior serve / fleet operations leak state without cleanup

## Expected Behavior

A. **Port preflight in CLI**: `aiworker serve --port <p>` should `try-bind` synchronously **before** detaching to background. On `EADDRINUSE`:

```
Error: port 19310 is already in use by pid 3226504 (aiworker serve, started 2026-05-04 09:00).
Use --port <other> or stop the existing serve first:
  kill -TERM 3226504
exit 1
```

B. **PID file flag**: add `aiworker serve --pid-file <path>` so callers don't have to depend on `$!` (which captures the wrapper, not the daemon)

C. **`/health` self-identification**: return the absolute path of the worker.db / project root in `/health` payload, so curl can diagnose "I'm talking to a different worker than I expected" without auth

D. **release-debug skill recipe update** (`references/recipes.md` R9): add port preflight before serve start:

```bash
PID_HOLDING=$(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null)
if [ -n "$PID_HOLDING" ]; then
  echo "ERR: port $PORT held by:" >&2
  ps -p $PID_HOLDING -o pid,user,etime,cmd >&2
  exit 1
fi
```

## Reproducer

```bash
# squat on 19310
( python3 -m http.server 19310 >/tmp/squat.log 2>&1 &)
sleep 1

cd <some aiworker project>
setsid aiworker serve --port 19310 --no-open > /tmp/serve.log 2>&1 &
sleep 3

# /health now hits python http.server (returns dir listing), not aiworker
curl -s http://127.0.0.1:19310/ | head -2

# aiworker subprocess is dead — no leak detected
ps aux | grep -i aiworker | grep -v grep
```

## Validation

After fix, `aiworker serve` on a busy port exits with non-zero status and a single clear error line that names the holding pid.

## Evidence

- `/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/findings/UX-3-aiworker-serve-port-conflict-silent.md`
- The first run of `/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/run/rest-smoke-output.log` (workerId mismatch story)
