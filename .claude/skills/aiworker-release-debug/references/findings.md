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

- [ ] `$DEBUG_ROOT/REPORT.md` —— 总报告
- [ ] `$DEBUG_ROOT/findings/*.md` —— 每条独立 finding
- [ ] `$DEBUG_ROOT/samples/*.txt|.log` —— 业务采样原文（不只是 final text，要保留 stream log）
- [ ] `$DEBUG_ROOT/dump/claude-*.txt` —— fake-claude shim 抓的 stdin / argv 证据
- [ ] `$AIWORKER_REPO/docs/task/<TYPE>-NNN.md` × N —— PMA task 文件
- [ ] `$AIWORKER_REPO/docs/task/index.md` —— 末尾 N 行新任务追加
- [ ] 一份 finding ↔ task 对照表（在 QA-NNN.md 的 Findings 段或 REPORT.md 末尾）
