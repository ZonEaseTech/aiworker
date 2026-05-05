# TODO-012 Expand admission `secret-scan` rule set beyond `sk-token`

- **status**: completed
- **priority**: P2
- **owner**: aiworker-maintainer
- **createdAt**: 2026-05-04 22:10
- **discoveredAt**: 2026-05-04 21:20
- **claimedAt**: 2026-05-05 04:25
- **completedAt**: 2026-05-05 04:50
- **plan**: PLAN-109
- **relatesTo**: BUG-055 (apply secret-scan), BUG-061 (show/list redact reuse)

## Observed Behavior

`aiworker brain admission apply --commit --allow-secret-body redact` correctly redacts a body containing `apiKey=sk-LIVE-shouldnotpersist` to `apiKey=[REDACTED:sk-token]` (rule = `sk-token`, label = "OpenAI/Anthropic-style sk- token"). ✅

But the same payload also contains `bearer=eyJabc` — a typical JWT prefix — and **no rule matches**, so the JWT lands in the brain memory file plain.

The 0.7.0 secret-scan ruleset appears to cover only `sk-` prefix tokens. Many other common secret patterns are unhandled.

## Expected Behavior

Add the following rules (each with a stable `rule` / `label` / regex):

| pattern | example | rule id |
|---------|---------|---------|
| JWT (3-segment base64url) | `eyJhbGciOi.eyJzdWIi.signature` | `jwt` |
| OAuth Bearer header | `Bearer xyz123abc...` | `bearer` |
| AWS access key | `AKIAIOSFODNN7EXAMPLE` | `aws-access-key` |
| GitHub personal access token | `ghp_xxx`, `github_pat_xxx`, `gho_xxx` | `github-pat` |
| Slack token | `xoxa-...`, `xoxb-...`, `xoxp-...` | `slack-token` |
| Stripe live secret key | `sk_live_xxx` | `stripe-live` |
| GCP API key | `AIzaXxxx` (39 chars) | `gcp-api-key` |
| PEM private key | `-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----` | `pem-private-key` |

Each rule emits the same `secretScan.hits[]` shape used today: `{ rule, label, preview, index }`. `--allow-secret-body block` blocks; `--allow-secret-body redact` replaces each hit with `[REDACTED:<rule>]` matching current sk-token behavior.

## Why this matters

- `sk-` is just one provider's prefix; the entire industry uses many shapes
- BUG-061 (show/list redact reuse) will inherit this ruleset, so once expanded it applies to read endpoints too
- Common pen-test scanners look for these specific shapes; matching them aligns AIWorker with industry baselines

## Reproducer

```bash
DEBUG_ROOT=/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0
cd $DEBUG_ROOT/proj-developer

for s in 'tok=eyJabc.def.ghi' 'aws=AKIAIOSFODNN7EXAMPLE' 'gh=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' 'pem="-----BEGIN PRIVATE KEY-----"'; do
  cat > /tmp/payload.json <<EOF
{"body":"# t\n\n$s","topic":"sec-test"}
EOF
  cat > /tmp/ev.json <<EOF
[{"at":"2026-05-04T13:00:00Z","kind":"observation","ref":"x"}]
EOF
  ID="ts-$(date +%s%N)"
  aiworker brain admission propose --i-know-this-is-debug \
    --id "$ID" --kind memory-add --target memories/x --summary t --rollback rm --soul developer \
    --evidence /tmp/ev.json --payload /tmp/payload.json
  aiworker brain admission approve "$ID" --decided-by qa
  aiworker brain admission apply "$ID" --decided-by qa --commit --allow-secret-body redact
  cat .aiworker/memories/x.md
  # Expected: each $s appears as [REDACTED:<rule>]
  # Actual: only sk- variant gets redacted
done
```

## Validation

After fix, all 4 rules above land as `[REDACTED:<rule>]` in the materialized memory file when `--allow-secret-body redact` is set, and as `blocked-by-secret-scan` outcome under default `block`.

## Evidence

`/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/findings/TODO-1-secret-scan-rule-coverage.md`
