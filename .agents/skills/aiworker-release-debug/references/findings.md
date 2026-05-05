# Findings — PMA 落盘规范

调试期间用临时编号（`BUG-1`/`UX-1`），收尾时统一映射到仓库 `docs/task/` 的下一个可用编号。

## 文件位置约定

```
$DEBUG_ROOT/findings/
  BUG-N-<short-slug>.md   # 严重缺陷（功能 / 安全 / 产品定位失效）
  UX-N-<short-slug>.md    # 体验 / 设计 / 文案问题
  SOUL-prod-grade-suggestions.md   # 集中沉淀的产品改进建议（不 1:1 映射 task，作为 PLAN 输入）
  REPORT.md（在上一级 $DEBUG_ROOT 根）
```

每份 finding md 必含：

- 复现路径（命令 + fixture）
- 期望行为
- 实测行为（含 fake-claude shim dump 引用 / sample 文件引用）
- 影响范围（产品定位 / 安全 / UX）
- 根因推断（如果能定位到源码文件 + 行号最佳）
- 建议修复（按 P0 / P1 / P2 分级）

## 严重度判定

| 级别 | 用什么场景判定 |
|------|---------------|
| **P0** | 产品定位级失效（如 BUG-056：Project Brain 实际不进 LLM）、安全级（如 BUG-055：明文 secret 落盘）、状态机损坏导致数据无法恢复、`fail-open` 鉴权 |
| **P1** | 高频路径行为不符（如 BUG-057：开了 LLM evaluator 但 100% fallback）、所有 Soul 共有的回归 |
| **P2** | 单条边界行为不符、UX 韧性不够（如 BUG-058：单条 schema drift 让整个 list 崩溃） |
| **P3** | 文案 / next-steps / docstring / 单一非主流路径的小问题 |

## 临时 finding → PMA task 映射规则

收尾时按下面规则把 `findings/*.md` 映射到 `docs/task/<TYPE>-NNN.md`：

| 临时类别 | PMA 类别 | 编号策略 |
|----------|----------|----------|
| 功能 / 安全 / 产品定位 BUG | `BUG-NNN` | 沿用 docs/task/BUG-* 序列下一个 |
| UX / 设计 / 文案 / 行为偏好 | `TODO-NNN` | 沿用 docs/task/TODO-* 序列下一个 |
| 本次调试 campaign 总结 | `QA-NNN` | 沿用 docs/task/QA-* 序列下一个，status=`completed` |
| 集中改进建议（多 BUG 共因 / 模板重写） | 不映射单条 task；放到下次 owner 起 PLAN 时用 |

查现有最大编号：

```bash
cd "$AIWORKER_REPO"
ls docs/task/ | grep -E '^BUG-' | sort | tail -3
ls docs/task/ | grep -E '^TODO-' | sort | tail -3
ls docs/task/ | grep -E '^QA-' | sort | tail -3
```

## task 文件模板

每条 PMA task md 用下面骨架（沿袭 `docs/task/BUG-053.md` 等已有模板）：

```markdown
# <PREFIX-NNN> <英文标题，imperative form>

- **status**: pending      # QA 总结用 completed
- **priority**: P0 | P1 | P2 | P3
- **owner**: unassigned    # 调试者不自己 claim
- **createdAt**: <YYYY-MM-DD HH:MM>
- **discoveredAt**: <YYYY-MM-DD HH:MM>
- **plan**: TBD            # owner 后续起 plan 时填
- **relatesTo**: <相关 PLAN/FEAT/BUG 列表>

## Observed Behavior

<复现路径 + 实测样本>

## Expected Behavior

<期望行为>

## Source Code Root Cause（可选，能定位时给）

<文件 + 行号 + 代码片段引用>

## Scope of Fix（建议）

### P0
1. ...

### P1
2. ...

## Reproducer

<指向 $DEBUG_ROOT/findings/<原临时编号>.md，并给最小命令>

## Validation（修复后）

<可重复执行的回归校验项>
```

## index.md 维护

```bash
cd "$AIWORKER_REPO"
# 1. 在 docs/task/index.md 末尾按时间顺序追加新 task 行
# 2. QA-NNN 用 [x]，BUG/TODO 用 [ ]
# 3. priority 标在末尾 `P0`/`P1`/`P2`/`P3`
# 4. 不要修改已有行的 checkbox marker（那是 owner 改的）
```

格式（与现有 index 严格一致）：

```markdown
- [x] [**QA-NNN <campaign 标题>**](QA-NNN.md) `P1`
- [ ] [**BUG-NNN <英文 imperative 标题>**](BUG-NNN.md) `P0`
- [ ] [**TODO-NNN <英文标题>**](TODO-NNN.md) `P3`
```

## 不要做

- **不要擅自创建 PLAN-NNN.md**：PMA 流程是 owner 认领后再起 plan investigate→proposal；调试者只登记 task
- **不要修改已 completed 的旧 task / FEAT / REL 文件**：除了相关 task 在 `relatesTo` 段被引用，其它历史文件不动
- **不要把 evidence 路径写成 `~`**：用绝对路径 `/home/ben/projects/debug-aiworker/qa-<date>/...`，不同 owner 复现时减少歧义
- **不要把临时 finding 文件复制进 docs/**：仓库里只放 PMA task，evidence 留在 `$DEBUG_ROOT`，task 文件用 `Reproducer` 段引用
- **不要把 secret 写到 task 文件**：fixture SQL 里的 `sk-LIVE-shouldnotpersist` 是占位符，不要换成真值

## 收尾交付物 checklist

调试结束时给用户的最终汇报必须包含：

- [ ] `$DEBUG_ROOT/REPORT.md` —— 总报告，**必含上一版修复确认表 + 本版仍存在表 + 本版新发现表**（详见下面 QA-NNN.md 必含段）
- [ ] `$DEBUG_ROOT/findings/*.md` —— 每条独立 finding
- [ ] `$DEBUG_ROOT/samples/*.txt|.log` —— 业务采样原文（不只是 final text，要保留 stream log）
- [ ] `$DEBUG_ROOT/dump/claude-*.txt` + `$DEBUG_ROOT/dump/codex-*.txt`（如做了 cross-engine） —— shim 抓的 stdin / argv 证据
- [ ] `$DEBUG_ROOT/findings/SOUL-prod-grade-suggestions.md` —— cross-engine 软越界等"非 BUG 但需要 SOUL 模板调教"的建议集中地
- [ ] `$AIWORKER_REPO/docs/task/<TYPE>-NNN.md` × N —— PMA task 文件
- [ ] `$AIWORKER_REPO/docs/task/index.md` —— 末尾 N 行新任务追加
- [ ] `$AIWORKER_REPO/docs/task/QA-NNN.md` —— campaign 总结，含 finding ↔ task 对照表 + 上一版修复确认核对表

## QA-NNN.md 必含段（campaign 总结）

每次 campaign 收尾的 QA-NNN.md 必须包含下面三个核对表，**不允许只列新 BUG 不做修复确认**：

### 段 1 — 上一版关键修复确认（不要错杀）

```markdown
## 上一版关键修复确认

| 上一版 BUG/TODO | 本版状态 | 证据 |
|-----------------|----------|------|
| BUG-NNN <短描述> | **已修** / **仍存在** / **部分修** / **未验证** | <dump 路径 + grep 关键词 + ablation 对照行号> |
```

判定规则：

- **已修**：必须配 dump grep 证据 + ablation 对照 + 横向 ≥3 Soul 都通过；不能只看上层接口
- **仍存在**：直接复用上一版 QA 的复现路径，给本版 dump 路径
- **部分修**（partial-injection / partial-redact 等）：**这是新发现，要单独建 BUG**，不能合并到"已修"。例如：
  - MEMORY.md 索引行进 stdin 但 body 没进（BUG-060）
  - admission show 顶层 apiKey redacted 但 payload.body 字段明文（BUG-061）
- **未验证**：明确说原因（如 acp/cursor/mcp adapter 没人手抽样），登记到 REPORT.md outstanding risks 段

### 段 2 — 本版仍存在的旧 BUG / TODO（如有）

```markdown
## 仍存在的已知问题

- BUG-NNN <短描述> — 上一版未修，本版**仍存在**：<复现路径>
```

### 段 3 — 本版新发现

```markdown
## 新发现

| Finding | Task | Severity |
|---------|------|----------|
| <一句话> | [BUG-NNN](BUG-NNN.md) | `P0`/`P1`/`P2`/`P3` |
```

### 段 4 — Verified Working in <version>

正面也要列。"经过 ablation + dump 验证 brain 真注入 LLM"、"9 Soul × 4 必跑全部 on-character"等，列出来便于下次回归对比。

### 段 5 — Out of Scope

明确说明本次没测的：gateway/fleet 控制面、acp/cursor/mcp 等 engine 横向、channel inbound 验签、evolution cron 实路径等。下一版 campaign 可以接力。
