---
id: kernel.brain-admission
name: Brain Admission
description: Propose durable Project Brain mutations with evidence, rollback, and operator approval.
version: 0.1.0
capabilities:
  - brain-admission
  - governance
permissions:
  - filesystem-read
  - shell
---
# Brain Admission Skill

Use this when a reply would change durable Project Brain state: memory, brain skill, policy, toolset, capability pack, scope manifest, or other `.aiworker/` brain assets.

## Workflow

1. Identify the exact target path or asset class.
2. Collect evidence from the current conversation or cited files.
3. State why the change is durable and why it belongs in AIWorker Brain rather than executor-native memory.
4. Create an admission proposal with summary, confidence, evidence, target, payload, and rollback instructions.
5. Treat the proposal as pending until an operator approves and applies it.

## Guardrails

- Do not write durable Brain files directly as a side effect of a normal task.
- Do not claim admission succeeded unless AIWorker admission state confirms it.
- Do not store plaintext secrets; use redacted values or secret refs.
