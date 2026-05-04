# PLAN-089 Brain diagnostics and onboarding UX

- **status**: draft
- **createdAt**: 2026-05-04 11:22
- **relatedTask**: FEAT-050

## 现状

`aiworker init` 和 `aiworker up` 已经引导用户选择 Soul 并查看 brain status，
但 Project Brain 的“可用/缺失/下一步”提示还可以更直接。

## 方案

1. `init` next steps 以 Project Brain 为第一组操作。
2. `doctor` 或 `brain status` 明确展示 brain home、write target、skills、memories。
3. Worker Admin Test 面板把 brain 状态放在 executor 之前。
4. 空 skills/memories 时给出可操作但不强制写入的建议。

## 范围

- CLI onboarding text。
- Worker Admin brain diagnostics text。
- focused tests。

## 非范围

- 不自动生成新的 memories/skills。
- 不改变 executor selection。

## 风险

过度提示会显得啰嗦；保持 first-run guidance 强、repeat-run 简洁。

## 验证

- CLI init/up focused tests。
- Worker Admin component tests if UI touched。
