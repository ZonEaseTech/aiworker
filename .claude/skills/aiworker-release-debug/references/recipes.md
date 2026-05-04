# Recipes — 命令配方

本文件按调试 Phase 给出可直接复用的命令片段。所有路径以 `/home/ben/projects/debug-aiworker/qa-<date>/` 为根，按当日替换日期。

## R1 — 安装隔离 npm prefix

```bash
DEBUG_ROOT=/home/ben/projects/debug-aiworker/qa-$(date +%Y-%m-%d)
mkdir -p "$DEBUG_ROOT" && cd "$DEBUG_ROOT"

# 隔离 npm prefix（不影响 ~/.npm-global）
mkdir -p npm-prefix
export PATH="/home/ben/.bun/bin:$PWD/npm-prefix/bin:$PATH"
export NPM_CONFIG_PREFIX="$PWD/npm-prefix"

# 装最新 published（或显式版本号）
npm install -g @zonease/aiworker-cli@latest
aiworker --version  # 期望 aiworker/<version> linux-x64 node-vXX
```

注意：

- bun bin 必须在 npm-prefix/bin 之前。aiworker.js 是 bun bundle。
- 不要用 `npm install --prefix .` 替代 `-g`；前者不创建 bin 软链。

## R2 — 干净 init + Soul preset 矩阵

```bash
for s in developer hr-recruiting finance-ops devops-sre product-designer general-assistant; do
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
aiworker doctor
aiworker executor doctor --engine claude-code
```

期望：scope.json 的 `kind` / SOUL.md 的"沟通风格 / 高风险策略 / 边界" / capability-packs / toolsets 在不同 preset 间应明显差异化（见 [prompt-suite.md](prompt-suite.md) "preset 期望差异" 段）。

## R3 — 装 fake-claude shim

```bash
mkdir -p "$DEBUG_ROOT/bin"
cp "$AIWORKER_REPO/.claude/skills/aiworker-release-debug/templates/claude-shim.sh" "$DEBUG_ROOT/bin/claude"
chmod +x "$DEBUG_ROOT/bin/claude"

# 后续所有 aiworker run 调用必须 PATH 前置 $DEBUG_ROOT/bin
export PATH="$DEBUG_ROOT/bin:$PATH"
which claude   # 必须返回 $DEBUG_ROOT/bin/claude
```

shim 本身见 `templates/claude-shim.sh`。它把每次调用的 argv / stdin / env 写到 `$DEBUG_ROOT/dump/claude-<ts>-<pid>.txt`，再 exec 真 claude。

## R4 — 业务采样

```bash
cp "$AIWORKER_REPO/.claude/skills/aiworker-release-debug/templates/run-one.sh" "$DEBUG_ROOT/samples/run-one.sh"
chmod +x "$DEBUG_ROOT/samples/run-one.sh"

# 单条采样：./run-one.sh <project-dir> <label> <message>
"$DEBUG_ROOT/samples/run-one.sh" "$DEBUG_ROOT/proj-developer" "dev-self-intro" \
  "用一句话介绍你自己的角色定位、沟通风格和你认为最重要的边界。"
```

`run-one.sh` 自动：

- 跑 `aiworker run --message ... --timeout-ms 120000`
- 把 stream 落 `$DEBUG_ROOT/samples/<label>.log`
- 提取所有 `orchestrator.text.delta` 拼接成 final text
- 提取 `orchestrator.intent_decision / capability_decision / quality_gate` 三个事件的关键字段
- 输出到 `$DEBUG_ROOT/samples/<label>.txt`

跨 Soul 批量采样按 [prompt-suite.md](prompt-suite.md) 矩阵执行。

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

```bash
sqlite3 "$DEBUG_ROOT/proj-developer/.aiworker/local/worker.db" \
  < "$AIWORKER_REPO/.claude/skills/aiworker-release-debug/templates/admission-fixture.sql"

# 状态机覆盖
cd "$DEBUG_ROOT/proj-developer"
aiworker brain admission list --status pending
aiworker brain admission show prop_qa_secret  # 默认 redact
aiworker brain admission show prop_qa_secret --show-sensitive

aiworker brain admission approve prop_qa_1 --decided-by qa-bot
aiworker brain admission apply   prop_qa_1 --decided-by qa-bot           # dry-run
aiworker brain admission apply   prop_qa_1 --decided-by qa-bot --commit  # 落盘

# unsupported kind 路径（应触发 BUG-059 已知行为：status 卡 approved，无 audit row）
aiworker brain admission approve prop_qa_2 --decided-by qa-bot
aiworker brain admission apply   prop_qa_2 --decided-by qa-bot --commit

# secret leak 验证（BUG-055）—— apply 后看文件是否含明文 secret
aiworker brain admission approve prop_qa_secret --decided-by qa-bot
aiworker brain admission apply   prop_qa_secret --decided-by qa-bot --commit
cat .aiworker/memories/qa-secret-in-body.md   # 含 sk-LIVE-... 即 BUG-055 仍未修
```

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
TOK=$(aiworker token rotate 2>&1 | grep -oE 'wtk_[A-Za-z0-9_-]+' | head -1)
echo "TOK=$TOK"

# 后台 serve
mkdir -p "$DEBUG_ROOT/run"
LOG="$DEBUG_ROOT/run/serve.log"; PID="$DEBUG_ROOT/run/serve.pid"
setsid aiworker serve --port 19310 --no-open > "$LOG" 2>&1 &
echo $! > "$PID"
sleep 3

# 边界检查
curl -s -o /dev/null -w 'HTTP=%{http_code}\n' http://127.0.0.1:19310/api/worker/info  # 期望 401
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:19310/api/worker/info | python3 -m json.tool | head -30
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:19310/api/worker/brain/summary | python3 -m json.tool
curl -s -H "Authorization: Bearer $TOK" "http://127.0.0.1:19310/api/worker/brain/admission?status=applied"
curl -s -H "Authorization: Bearer $TOK" "http://127.0.0.1:19310/api/worker/brain/admission/prop_qa_secret"  # 默认 redact
curl -s -H "Authorization: Bearer $TOK" "http://127.0.0.1:19310/api/worker/brain/admission/prop_qa_secret?showSensitive=true"
curl -sI http://127.0.0.1:19310/admin/ | head -5

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
ls "$DEBUG_ROOT/dump"
ls "$DEBUG_ROOT/samples"
ls "$DEBUG_ROOT/findings"

# 3. REPORT.md 写完
ls "$DEBUG_ROOT/REPORT.md"

# 4. PMA 落盘（详见 findings.md）
cd "$AIWORKER_REPO"
ls docs/task/BUG-*.md | tail -5  # 确认新 task 文件已写
grep -E '^\- \[ \] \[\*\*BUG-' docs/task/index.md | tail -5
```

不要清理 `$DEBUG_ROOT` 下任何文件 —— 它们是后续 owner 复现 BUG 时的唯一证据来源。
