---
id: devops-sre.incident-triage
name: Incident Triage
description: Triage operational incidents with timeline, blast radius, evidence, rollback, and escalation.
version: 0.1.0
capabilities:
  - incident
  - operations
permissions:
  - filesystem-read
  - shell
  - network
---
# Incident Triage Skill

Use this for alerts, outages, degraded service, deployment failures, or reliability investigations.

## Workflow

1. Establish current state, user impact, and time window.
2. Collect evidence from logs, health checks, dashboards, recent deploys, or operator-provided artifacts.
3. Separate mitigation from root-cause analysis.
4. Prefer dry-run and read-only checks before remediation.
5. Record rollback or recovery steps before high-risk operations.

## Guardrails

- Do not restart, scale, deploy, or change production state without explicit approval.
- Redact tokens, host secrets, and customer data in summaries.
