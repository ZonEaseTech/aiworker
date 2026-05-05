-- 直写 worker.db 注入 admission fixture
--
-- 0.7.0+ CLI 已暴露 `aiworker brain admission propose --i-know-this-is-debug` debug 入口，
-- happy-path fixture 优先走 CLI 路径。这个 SQL 文件保留作为 schema-drift / 边界 fixture：
--   - 刻意 craft malformed evidence
--   - unsupported kind（policy-update 等 CLI 不允许的 kind）
--   - 明文 secret payload（CLI 默认 secret-scan 会 block）
--   - 多种 secret type 同时注入（覆盖 sk-token 之外的 JWT/AWS/GitHub PAT，配合 TODO-012）
--
-- 用法：
--   sqlite3 $PROJ/.aiworker/local/worker.db < admission-fixture.sql
--
-- 注入 4 条 proposal，覆盖：
--   prop_qa_1       memory-add（happy path），用于 dry-run + commit + 重复 apply 校验
--   prop_qa_2       policy-update（unsupported kind），用于 unsupported 路径 + audit 缺失校验（BUG-059）
--   prop_qa_3       memory-add，payload 含顶层 secret-like 字段（apiKey），用于默认 redact 校验
--   prop_qa_secret  memory-add，payload.body 含明文 secret 字符串，用于 BUG-055 安全验证
--   prop_qa_reject  memory-add，用于 pending → rejected 路径校验
--
-- 注意：
--   - evidence JSON 必须含 at / kind / ref 三字段（zod schema 要求）
--   - kind ∈ {'conversation','message','tool-call','observation','artifact','memory','log'}
--   - 时间戳 hardcode 成可识别的 fixture 标记（按 ISO8601 格式）
--   - 如果你的 schema 已经升级，按 .schema brain_admission_proposals 比对字段

DELETE FROM brain_admission_proposals WHERE id LIKE 'prop_qa_%';

INSERT INTO brain_admission_proposals
  (id, scope_id, soul_id, kind, target, summary, evidence, risk, confidence,
   rollback, payload, status, created_at, updated_at)
VALUES
  ('prop_qa_1',
   'developer-repo', 'developer', 'memory-add',
   'memories/qa-fixture',
   'QA fixture: write a one-line note into memories/qa-fixture.md',
   '[{"at":"2026-05-04T13:00:00.000Z","kind":"observation","ref":"qa-fixture-evidence"}]',
   'low', 0.92,
   'rm memories/qa-fixture.md and remove the index line from MEMORY.md',
   '{"body":"# QA fixture\n\nadmission MVP 验证通过。","topic":"qa-fixture","indexEntry":"- [QA fixture](qa-fixture.md) — admission MVP 冒烟"}',
   'pending', '2026-05-04T13:00:00.000Z', '2026-05-04T13:00:00.000Z'),

  ('prop_qa_2',
   'developer-repo', 'developer', 'policy-update',
   'policy.toolPolicy.default',
   'QA fixture: try to flip toolPolicy.default to auto (should be blocked as unsupported kind)',
   '[{"at":"2026-05-04T13:00:00.000Z","kind":"observation","ref":"qa-policy-evidence"}]',
   'high', 0.4,
   'manually revert policy.json',
   '{"path":"toolPolicy.default","next":"auto"}',
   'pending', '2026-05-04T13:00:00.000Z', '2026-05-04T13:00:00.000Z'),

  ('prop_qa_3',
   'developer-repo', 'developer', 'memory-add',
   'memories/qa-redacted',
   'QA fixture: payload top-level apiKey field, default redact must replace with <redacted>',
   '[{"at":"2026-05-04T13:00:00.000Z","kind":"observation","ref":"qa-redact-evidence"}]',
   'low', 0.5,
   'rm memories/qa-redacted.md',
   '{"body":"# secret leak test","topic":"qa-redacted","apiKey":"sk-shouldredact"}',
   'pending', '2026-05-04T13:00:00.000Z', '2026-05-04T13:00:00.000Z'),

  ('prop_qa_secret',
   'developer-repo', 'developer', 'memory-add',
   'memories/qa-secret-in-body',
   'QA fixture: payload.body contains plaintext secret; verify materializer blocks (BUG-055)',
   '[{"at":"2026-05-04T13:00:00.000Z","kind":"observation","ref":"qa-secret-evidence"}]',
   'low', 0.5,
   'rm memories/qa-secret-in-body.md',
   '{"body":"# leak test\n\napiKey=sk-LIVE-shouldnotpersist\nbearer=eyJabc","topic":"qa-secret-in-body"}',
   'pending', '2026-05-04T13:00:00.000Z', '2026-05-04T13:00:00.000Z'),

  ('prop_qa_reject',
   'developer-repo', 'developer', 'memory-add',
   'memories/qa-reject-me',
   'QA fixture: pending → reject path',
   '[{"at":"2026-05-04T13:00:00.000Z","kind":"observation","ref":"qa-reject-evidence"}]',
   'low', 0.5,
   'noop',
   '{"body":"x","topic":"qa-reject-me"}',
   'pending', '2026-05-04T13:00:00.000Z', '2026-05-04T13:00:00.000Z');

SELECT id, status, kind, target FROM brain_admission_proposals WHERE id LIKE 'prop_qa_%';
