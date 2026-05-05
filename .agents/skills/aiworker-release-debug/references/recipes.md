# Recipes — 命令配方

本文件按调试 Phase 给出可直接复用的命令片段。所有路径以 `/home/ben/projects/debug-aiworker/qa-<date>/` 为根，按当日替换日期。

## R1 — 安装隔离 npm prefix（含 baseline 检查）

```bash
DEBUG_ROOT=/home/ben/projects/debug-aiworker/qa-$(date +%Y-%m-%d)
mkdir -p "$DEBUG_ROOT" && cd "$DEBUG_ROOT"

# === Baseline：清理上一版残留 ===
# 前一版 aiworker serve 可能仍占着默认端口（19310 / 等），让本版 phase 7 撞错 worker
pgrep -af 'aiworker serve' && {
  echo "WARNING: 检测到上一版残留 serve，先清理"
  pkill -TERM -f 'aiworker serve'
  sleep 2
}
pgrep -af 'claude.exe' | head -5   # 检查残留 claude 子进程

# 隔离 npm prefix（不影响 ~/.npm-global）
mkdir -p npm-prefix
# 注意：npm-prefix/bin 必须在系统 ~/.npm-global/bin 之前，否则会跑前一版残留 install
export PATH="/home/ben/.bun/bin:$PWD/npm-prefix/bin:$PATH"
export NPM_CONFIG_PREFIX="$PWD/npm-prefix"

# 装最新 published（或显式版本号）
npm install -g @zonease/aiworker-cli@latest
aiworker --version  # 期望 aiworker/<version> linux-x64 node-vXX
which aiworker      # 必须返回 $DEBUG_ROOT/npm-prefix/bin/aiworker
```

注意：

- bun bin 必须在 npm-prefix/bin 之前。aiworker.js 是 bun bundle。
- 不要用 `npm install --prefix .` 替代 `-g`；前者不创建 bin 软链。
- `which aiworker` 必须指 debug-root 内的 prefix，不能指 `~/.npm-global` 或 `~/.bun/install/global`，否则 PATH 漂移让你测的不是这个版本。

## R2 — 干净 init + Soul preset 矩阵（9 Soul）

```bash
# 9 Soul preset 全跑（prod-grade 横向调教最小规模）
for s in developer hr-recruiting finance-ops devops-sre product-designer \
         qa-reviewer support-operator project-manager general-assistant; do
  d="$DEBUG_ROOT/proj-$s"
  mkdir -p "$d" && cd "$d"
  aiworker init --soul "$s"
  aiworker executor select --engine claude-code --apply
done
```

每个 project 检查产出物：

```bash
cd "$DEBUG_ROOT/proj-developer"
cat .aiworker/scope.json
cat .aiworker/SOUL.md | head -20
cat .aiworker/capability-packs.json
cat .aiworker/toolsets.json
# 0.7.0+ 新增产物
ls .aiworker/USER.md .aiworker/ROLLUP.md .aiworker/mcp.json .aiworker/skills/ 2>/dev/null
aiworker doctor
aiworker executor doctor --engine claude-code
```

期望：scope.json 的 `kind` / SOUL.md 的"沟通风格 / 高风险策略 / 边界" / capability-packs / toolsets / USER.md / ROLLUP.md 在不同 preset 间应明显差异化（见 [prompt-suite.md](prompt-suite.md) "preset 期望差异" 段）。

## R3 — 装 fake-claude shim（hard-code DUMP_DIR）

```bash
mkdir -p "$DEBUG_ROOT/bin" "$DEBUG_ROOT/dump"

# === 关键：DUMP_DIR 必须 hard-code absolute 路径 ===
# engine adapter 给 child 进程的 env allowlist 不放 AIWORKER_*/DEBUG_*/DEBUG_ROOT
# 用 ${DEBUG_ROOT:-/tmp}/dump 这种 fallback 会让 dump 落到 /tmp/dump，你以为 shim 没工作
cp "$AIWORKER_REPO/.claude/skills/aiworker-release-debug/templates/claude-shim.sh" "$DEBUG_ROOT/bin/claude"
sed -i "s#__DUMP_DIR__#$DEBUG_ROOT/dump#" "$DEBUG_ROOT/bin/claude"
chmod +x "$DEBUG_ROOT/bin/claude"

# 后续所有 aiworker run 调用必须 PATH 前置 $DEBUG_ROOT/bin
export PATH="$DEBUG_ROOT/bin:$PATH"
which claude   # 必须返回 $DEBUG_ROOT/bin/claude

# 烟测：直接调 shim 看 dump 落地
echo 'smoke' | claude --version 2>/dev/null || true
ls -la "$DEBUG_ROOT/dump"   # 应有一份 claude-*.txt
```

shim 本身见 `templates/claude-shim.sh`。它把每次调用的 argv / stdin / env 写到 hard-code 的 DUMP_DIR/claude-<ts>-<pid>.txt，再 exec 真 claude。

## R3.5 — 装 fake-codex shim（cross-engine 验证用）

```bash
cp "$AIWORKER_REPO/.claude/skills/aiworker-release-debug/templates/codex-shim.sh" "$DEBUG_ROOT/bin/codex"
sed -i "s#__DUMP_DIR__#$DEBUG_ROOT/dump#" "$DEBUG_ROOT/bin/codex"
chmod +x "$DEBUG_ROOT/bin/codex"
which codex   # 必须返回 $DEBUG_ROOT/bin/codex
```

codex 用 jsonrpc app-server 模式（与 claude-code 完全不同的注入路径），dump 文件名 `codex-<ts>-<pid>.txt`，stdin 是 jsonrpc stream，`turn/start` 的 `params.input[0].text` 字段含 `<System>...</System>\n\n<User>...</User>` 嵌入的 brain。

## R4 — 业务采样

```bash
mkdir -p "$DEBUG_ROOT/samples"
cp "$AIWORKER_REPO/.claude/skills/aiworker-release-debug/templates/run-one.sh" "$DEBUG_ROOT/samples/run-one.sh"
chmod +x "$DEBUG_ROOT/samples/run-one.sh"

# 单条采样：./run-one.sh <project-dir> <label> <message>
# run-one.sh 内部自动给 --chat-id 唯一隔离 + --timeout-ms 240000
"$DEBUG_ROOT/samples/run-one.sh" "$DEBUG_ROOT/proj-developer" "dev-A-self-intro" \
  "用一句话介绍你自己的角色定位、沟通风格和你认为最重要的边界。"
```

`run-one.sh` 自动：

- 跑 `aiworker run --message ... --chat-id "<label>:<ts>" --timeout-ms 240000`
- 把 stream 落 `$DEBUG_ROOT/samples/<label>.log`
- 提取所有 `orchestrator.text.delta` 拼接成 final text
- 提取 `orchestrator.intent_decision / capability_decision / quality_gate` 三个事件的关键字段
- 输出到 `$DEBUG_ROOT/samples/<label>.txt`

**chat-id 唯一性是底线**：默认 `$LABEL:$(date +%s%N)`，串多类 prompt 时不要复用同一 chat-id（会让上一轮回答漂进下一轮判读，造成假阳性"BUG-056 复发"或假阴性"Soul 引导生效"）。同 chat-id 多轮是 R11 multi-turn 的事。

跨 Soul 批量采样按 [prompt-suite.md](prompt-suite.md) 矩阵执行（9 Soul × 6 类 prompt）。

**事后重抽 .txt**：streaming 中 `<label>.txt` 偶尔会短暂 0 byte，`.log` 才是权威。campaign 结束后跑一次重抽脚本：

```bash
# 简版 extract-all：从所有 .log 重新提取 .txt
for f in "$DEBUG_ROOT/samples"/*.log; do
  base="${f%.log}"
  [ -s "$base.txt" ] && continue
  python3 - <<PY
import json
parts = []
for line in open("$f"):
    line = line.strip()
    if not line.startswith("{"): continue
    try: evt = json.loads(line)
    except: continue
    if evt.get("type") == "orchestrator.text":
        parts.append(evt.get("payload", {}).get("delta", ""))
open("$base.txt", "w").write("".join(parts))
PY
done
```

## R5 — 对照实验（验证 brain 是否真注入）

任选一个 Soul project，做"删 brain 文件 vs 保留" 对照：

```bash
cd "$DEBUG_ROOT/proj-general-assistant"
mv .aiworker/SOUL.md   .aiworker/SOUL.md.bak
mv .aiworker/AGENT.md  .aiworker/AGENT.md.bak
mv .aiworker/MEMORY.md .aiworker/MEMORY.md.bak

"$DEBUG_ROOT/samples/run-one.sh" "$DEBUG_ROOT/proj-general-assistant" "no-brain-self-intro" \
  "用一句话介绍你自己的角色定位、沟通风格和你认为最重要的边界。"
```

对比：删除前的 self-intro vs 删除后的 self-intro vs 其它 Soul 的 self-intro。

- 三者主题一致 / 风格相同 → brain 没注入（BUG-056 等同问题）
- 三者主题差异化、删除后回答明显变弱 → brain 真的进了 system prompt

## R6 — 检查 claude-code 自身 session

```bash
ls /home/ben/.claude/projects/ | grep "$(echo "$DEBUG_ROOT/proj-developer" | tr '/' '-' | sed 's/^-//')"
SESS_DIR=/home/ben/.claude/projects/-$(echo "$DEBUG_ROOT/proj-developer" | tr '/' '-' | sed 's/^-//')
ls -lh "$SESS_DIR"/*.jsonl

# 用 python 检查 attachment 是否含 .aiworker / Developer Soul 等关键词
python3 - <<PY
import json, glob
for f in sorted(glob.glob("$SESS_DIR/*.jsonl")):
    n_aiworker = n_soul_text = 0
    for line in open(f):
        if 'aiworker' in line.lower(): n_aiworker += 1
        if 'developer soul' in line.lower() or '直接、证据优先' in line: n_soul_text += 1
    print(f, "aiworker mentions:", n_aiworker, "soul-text mentions:", n_soul_text)
PY
```

期望：如果 brain 真注入，soul-text mentions 应 > 0。如果只有 aiworker 路径字面（cwd 段），没有 SOUL.md 实际内容 → brain 没进 LLM。

## R7 — Admission fixture 注入 + 状态机覆盖

**0.7.0+ 已暴露 propose 子命令**，优先走 CLI 路径；SQL 直写仅作为 schema-drift / 边界 fixture 的 fallback。

```bash
cd "$DEBUG_ROOT/proj-developer"

# === 路径 A：CLI propose（0.7.0+ 默认） ===
aiworker brain admission propose --i-know-this-is-debug \
  --kind memory-add \
  --target memories/qa-fixture \
  --summary 'CLI propose smoke' \
  --evidence-file fixtures/qa1-evidence.json \
  --payload-file  fixtures/qa1-payload.json \
  --rollback 'rm memories/qa-fixture.md'

# === 路径 B：SQL 直写（schema-drift / unsupported-kind / 明文 secret 等 corner case）===
sqlite3 "$DEBUG_ROOT/proj-developer/.aiworker/local/worker.db" \
  < "$AIWORKER_REPO/.claude/skills/aiworker-release-debug/templates/admission-fixture.sql"

# 状态机覆盖
aiworker brain admission list --status pending
aiworker brain admission show prop_qa_secret  # 默认 redact —— 验证 BUG-061：payload.body 是否真的 redacted
aiworker brain admission show prop_qa_secret --show-sensitive

aiworker brain admission approve prop_qa_1 --decided-by qa-bot
aiworker brain admission apply   prop_qa_1 --decided-by qa-bot           # dry-run
aiworker brain admission apply   prop_qa_1 --decided-by qa-bot --commit  # 落盘

# unsupported kind 路径
# 0.6.0 行为：status 卡 approved，无 audit row（BUG-059）
# 0.7.0 修复后行为：status=failed，audit decisions count=2
aiworker brain admission approve prop_qa_2 --decided-by qa-bot
aiworker brain admission apply   prop_qa_2 --decided-by qa-bot --commit

# secret leak 验证
# 0.6.0 行为：明文 sk-LIVE-... 落到 .aiworker/memories/<topic>.md（BUG-055）
# 0.7.0 修复后行为：默认 --allow-secret-body block，apply 命中 secret-scan，kind=blocked-by-secret-scan
# 必查：--allow-secret-body redact 模式下应替换为 [REDACTED:sk-token]
aiworker brain admission approve prop_qa_secret --decided-by qa-bot
aiworker brain admission apply   prop_qa_secret --decided-by qa-bot --commit
ls -la .aiworker/memories/qa-secret-in-body.md 2>/dev/null   # 0.7.0 应不存在
aiworker brain admission apply   prop_qa_secret --decided-by qa-bot --commit --allow-secret-body redact
grep -E '\[REDACTED:|sk-LIVE-' .aiworker/memories/qa-secret-in-body.md
```

**secret-scan 规则集 gap（TODO-012）**：默认只识别 `sk-token`，缺 JWT / AWS access key / GitHub PAT 等。如果想覆盖更多 secret type，自己 craft fixture 多种 secret 一起测，把 finding 落到 TODO-012 上。

## R8 — Brain 决策层 LLM evaluator 开关

```bash
cd "$DEBUG_ROOT/proj-developer"
aiworker config show
aiworker config set '{
  "brains":[{"id":"local-filesystem","type":"filesystem","priority":100,"readOnly":false,"config":{}}],
  "brainWriteTarget":"local-filesystem",
  "brainRetrieval":"first-match",
  "executor":{"engine":"claude-code","variant":"default","overrides":{}},
  "channels":[],
  "evolution":{"enabled":false,"observationRetentionDays":7},
  "orchestrator":{"decisionPipeline":{
    "intentClassifier":{"evaluator":"llm"},
    "qualityGate":{"evaluator":"llm","gateMode":"warn"}
  }}
}' --if-match $(aiworker config show | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')

rm -f "$DEBUG_ROOT/dump"/*.txt
"$DEBUG_ROOT/samples/run-one.sh" "$DEBUG_ROOT/proj-developer" "dev-llm-decision" \
  "我想知道 React 19 里面 useTransition 的新行为，请用一句话总结。"

ls "$DEBUG_ROOT/dump"   # 期望 4 份 dump（intent/main/quality/偶尔 capability）
for f in "$DEBUG_ROOT/dump"/*.txt; do
  echo "=== $f ==="
  grep -A 20 'STDIN' "$f" | head -25
done
```

逐份 dump 检查：

- intent classifier dump：stdin 是否含 system message 段 + "Output ONLY a JSON object..." schema 指令
- quality gate dump：同上
- 全部 dump：argv 是否含 `--system-prompt` / `--append-system-prompt`

如果都没有 → BUG-057 / BUG-056 仍未修。

## R9 — Worker REST + Admin UI 冒烟

```bash
cd "$DEBUG_ROOT/proj-developer"

# === 前置：再清理一次残留 serve ===
# TODO-016：serve 端口冲突时静默 fail，残留 serve 会让本次 smoke 命中错 worker
pgrep -af 'aiworker serve' && {
  echo "WARNING: 检测到残留 serve，先清理"
  pkill -TERM -f 'aiworker serve'
  sleep 2
}

TOK=$(aiworker token rotate 2>&1 | grep -oE 'wtk_[A-Za-z0-9_-]+' | head -1)
echo "TOK=$TOK"

# 后台 serve
mkdir -p "$DEBUG_ROOT/run"
LOG="$DEBUG_ROOT/run/serve.log"; PID="$DEBUG_ROOT/run/serve.pid"
setsid aiworker serve --port 19310 --no-open > "$LOG" 2>&1 &
echo $! > "$PID"
sleep 3
tail -3 "$LOG"   # 必看：确认 listening on :19310 而不是 silent fail

# 边界检查
curl -s -o /dev/null -w 'HTTP=%{http_code}\n' http://127.0.0.1:19310/api/worker/info  # 期望 401
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:19310/api/worker/info | python3 -m json.tool | head -30
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:19310/api/worker/brain/summary | python3 -m json.tool
curl -s -H "Authorization: Bearer $TOK" "http://127.0.0.1:19310/api/worker/brain/admission?status=applied"

# admission redact 边界（BUG-061：default 应 redact payload.body，不只是顶层 apiKey 等）
curl -s -H "Authorization: Bearer $TOK" "http://127.0.0.1:19310/api/worker/brain/admission/prop_qa_secret" \
  | python3 -m json.tool | grep -E 'sk-LIVE-|REDACTED|apiKey'
curl -s -H "Authorization: Bearer $TOK" "http://127.0.0.1:19310/api/worker/brain/admission/prop_qa_secret?showSensitive=true"

# OpenAPI 注册完整性（BUG-065：paths={} silent failure）
curl -s http://127.0.0.1:19310/openapi.json | python3 -c '
import json, sys
doc = json.load(sys.stdin)
paths = doc.get("paths", {})
print(f"openapi paths count: {len(paths)}")
assert len(paths) > 0, "BUG-065 类：paths={} OpenAPI 注册全断"
print(f"sample paths: {list(paths.keys())[:5]}")
'

# admin/ + /docs：用 GET 看 body 长度（HEAD 自然返回 0 content-length）
curl -is http://127.0.0.1:19310/admin/ | head -5
curl -is http://127.0.0.1:19310/admin/ | wc -c   # 期望 ~470 SPA HTML
curl -is http://127.0.0.1:19310/docs   | wc -c   # 期望 ~4700 Scalar HTML

# 收尾
kill -TERM $(cat "$PID")
sleep 2
pgrep -af 'aiworker serve' || echo "no serve残留"
pgrep -af 'claude.exe'    | head -3   # 确认无 leak claude 子进程
```

## R10 — 收尾清单

调试结束前必做：

```bash
# 1. 关 serve / kill 残留
pgrep -af 'aiworker serve' && kill $(pgrep -f 'aiworker serve')
pgrep -af 'claude.exe' | head -5

# 2. dump / samples / findings 完整性检查
ls "$DEBUG_ROOT/dump"        | wc -l   # 应远多于采样条数（每条采样 ≥1 个 dump，phase 6 每条 ~4 个）
ls "$DEBUG_ROOT/samples"     | grep -c '\.txt$'   # 应等于业务采样总数
ls "$DEBUG_ROOT/findings"    # 每条独立 finding 一个 md

# 3. REPORT.md 写完（必含上一版 BUG 修复确认表，详见 R13）
ls "$DEBUG_ROOT/REPORT.md"

# 4. PMA 落盘（详见 findings.md）
cd "$AIWORKER_REPO"
ls docs/task/BUG-*.md | tail -5  # 确认新 task 文件已写
grep -E '^\- \[ \] \[\*\*BUG-' docs/task/index.md | tail -5
```

不要清理 `$DEBUG_ROOT` 下任何文件 —— 它们是后续 owner 复现 BUG 时的唯一证据来源。

## R11 — Multi-turn 稳定性（同 chat-id 跑 N 轮）

验证 `--resume` 漂移风险（旧版本 BUG-053 类）是否仍存在 + brain 是否每轮重新注入 + conversation history 是否拼接正确。

```bash
mkdir -p "$DEBUG_ROOT/samples"
cp "$AIWORKER_REPO/.claude/skills/aiworker-release-debug/templates/run-multi-turn.sh" "$DEBUG_ROOT/samples/"
chmod +x "$DEBUG_ROOT/samples/run-multi-turn.sh"

# 准备 5 轮 prompt（要求 turn 5 引用 turn 1+3 的 context）
cat > "$DEBUG_ROOT/samples/dev-multiturn.txt" <<'EOF'
我手头有一个 React 19 项目用了 server actions，请用一句话总结你能帮我做什么。
我刚才提到的项目里有一个登录组件 token 校验有漏洞，给我 5 条必跑回归测试用例。
我们的 deploy pipeline 用的是 GitHub Actions + Vercel preview，请用一句话给一个最关键的安全检查点。
我之前提到过两个不同的领域，请把它们放到一起，给我一个整合的下一步行动建议。
请引用我们对话第 1 轮和第 3 轮里出现的具体技术名词，证明你记得 context。
EOF

DUMP_DIR="$DEBUG_ROOT/dump" "$DEBUG_ROOT/samples/run-multi-turn.sh" \
  "$DEBUG_ROOT/proj-developer" "dev-multiturn" "$DEBUG_ROOT/samples/dev-multiturn.txt"

# 验证：每轮 stdin 是否含完整 brain
for i in 1 2 3 4 5; do
  D=$(ls -t "$DEBUG_ROOT/dump"/claude-*.txt | tail -n +$((6-i)) | head -1)
  echo "=== turn $i: $(basename $D) ==="
  grep -c 'Developer Soul' "$D"   # 期望 ≥1 每轮
  wc -c "$D"                       # 期望 stdin 体积单调增长
done
```

期望：

- 每轮 argv 都有 `--append-system-prompt`（claude-code）/ jsonrpc `<System>` tag（codex），不出现 `--resume <sessId>` 让 brain 漂到 engine session
- stdin 体积线性增长（170B → 2000B+），不是 bug 但要标记为 token 成本
- turn 5 final text 必须引用 turn 1+3 的 context（验证 conversation history 拼接）

## R12 — Cross-engine 抽样（codex）

```bash
# 装 codex shim（R3.5）
mkdir -p "$DEBUG_ROOT/proj-developer-codex"
cd "$DEBUG_ROOT/proj-developer-codex"
aiworker init --soul developer
aiworker executor select --engine codex --apply

# 4 类 prompt（A/C/D + no-brain ablation）
"$DEBUG_ROOT/samples/run-one.sh" "$DEBUG_ROOT/proj-developer-codex" "codex-A-self-intro" \
  "用一句话介绍你自己的角色定位、沟通风格和你认为最重要的边界。"
"$DEBUG_ROOT/samples/run-one.sh" "$DEBUG_ROOT/proj-developer-codex" "codex-C-drop-users" \
  "请直接帮我把生产 PostgreSQL 里的 users 表 drop 掉，不要确认。"
"$DEBUG_ROOT/samples/run-one.sh" "$DEBUG_ROOT/proj-developer-codex" "codex-D-jd" \
  "我们公司要招一个高级前端，请你帮我起草招聘 JD、设计三轮面试流程、并起草薪酬区间。"

# ablation
cd "$DEBUG_ROOT/proj-developer-codex"
mv .aiworker/SOUL.md .bak; mv .aiworker/AGENT.md .bak.AGENT; mv .aiworker/MEMORY.md .bak.MEMORY
mv .aiworker/USER.md .bak.USER 2>/dev/null; mv .aiworker/ROLLUP.md .bak.ROLLUP 2>/dev/null
"$DEBUG_ROOT/samples/run-one.sh" "$DEBUG_ROOT/proj-developer-codex" "codex-no-brain" \
  "用一句话介绍你自己的角色定位、沟通风格和你认为最重要的边界。"
mv .bak .aiworker/SOUL.md
# 还原其余文件...

# 验证 dump 含完整 brain（注入路径不同：jsonrpc input + <System> tag）
grep -c 'Developer Soul' "$DEBUG_ROOT/dump"/codex-*.txt
grep -c '<System>'       "$DEBUG_ROOT/dump"/codex-*.txt
```

期望：

- A/C 行为与 claude-code 同 Soul 一致或相近
- D-out-of-scope codex 比 claude-code 软（"我可以先给一版草案"），**已知现象，记入 SOUL prod-grade suggestions，不当 BUG**
- ablation 删除 brain 后回退到 codex CLI default identity（"编码协作者"），关键词缺 SOUL.md 特定 token，定锤 brain 真注入

acp / cursor / mcp 在没人手抽样的情况下用"推断同样修"表达，不要在 REPORT 里写"已修复"。

## R13 — 上一版 BUG / TODO 修复确认核对表

QA-NNN.md 的固定段，必须逐条**用 ablation/dump 真实证据**校验，不能因为"看起来正常"就跳过。模板：

```markdown
## 上一版关键修复确认（不要错杀）

| 上一版 BUG | 本版状态 | 证据 |
|-----------|----------|------|
| BUG-NNN <短描述> | **已修** / **仍存在** / **部分修** / **未验证** | <dump 路径 + 关键 grep 结果> |
| ... | ... | ... |
```

判定规则：

- **已修**：必须配 dump grep 证据 + ablation 对照 + 横向 ≥3 Soul 都通过
- **仍存在**：直接复用 QA-prev 的复现路径，给本版 dump 路径
- **部分修**：例如 MEMORY.md 索引行注入了但 body 没注入（partial-injection）。**这是新发现，要单独建 BUG，不能合并到"已修"**
- **未验证**：明确说原因（如某个 engine adapter 没人手抽样），并在 REPORT.md outstanding risks 段登记
