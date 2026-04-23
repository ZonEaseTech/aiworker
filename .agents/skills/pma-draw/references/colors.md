# Color Palette

Single source of truth for node colors. Each semantic node type in `node-types.md` pulls from one slot in this file. To re-brand pma-viewer, edit this file plus the viewer's theme tokens — the skill's JSON stays untouched.

**Rule**: pair a darker border with a lighter background. Never invent new colors — if a concept doesn't fit, reuse the closest semantic slot.

---

## Semantic Slots (default palette)

| Slot | Background | Border | Text | Used By Node Type |
|------|------------|--------|------|-------------------|
| Frontend / UI | `#a5d8ff` | `#1971c2` | `#0b2a4a` | `frontend` |
| Backend / API | `#d0bfff` | `#7048e8` | `#2a1155` | `backend` |
| Database | `#b2f2bb` | `#2f9e44` | `#14401f` | `database` |
| Storage | `#ffec99` | `#f08c00` | `#3a2400` | `storage` |
| Cache | `#ffe8cc` | `#fd7e14` | `#442000` | `cache` |
| Message Queue | `#fff3bf` | `#fab005` | `#3a2400` | `queue` |
| AI / ML | `#e599f7` | `#9c36b5` | `#2e0a3a` | `ai` |
| External API | `#ffc9c9` | `#e03131` | `#4a0e0e` | `external` |
| Orchestration / Hub | `#ffa8a8` | `#c92a2a` | `#3f0a0a` | `orchestrator` |
| Decision / Validator | `#ffd8a8` | `#e8590c` | `#44200b` | `decision` |
| User / Actor | `#e7f5ff` | `#1971c2` | `#0b2a4a` | `user` |
| Network / Security | `#dee2e6` | `#495057` | `#1a1d20` | `security` |
| Monitoring | `#d3f9d8` | `#40c057` | `#17341d` | `monitoring` |
| Inactive / Disabled | `#dbeafe` | `#1e40af` (dashed) | `#1e3a5f` | any node with `data.dimmed: true` |
| Error / Rejected | `#fecaca` | `#b91c1c` | `#401010` | edge type `rejected` |
| Neutral / Process | `#f1f5f9` | `#64748b` | `#0f172a` | `process` (utility) |
| Success / End | `#a7f3d0` | `#047857` | `#0a3d2d` | `end` (utility) |
| Start / Trigger | `#fed7aa` | `#c2410c` | `#401c0a` | `start` (utility) |

---

## Text Hierarchy (free-floating text: `title`, `note`)

| Level | Color | Use For |
|-------|-------|---------|
| Title (H1) | `#0f172a` | Top-level diagram title |
| Subtitle (H2) | `#1e40af` | Section headings |
| Body | `#334155` | `note` content, annotations |
| Muted | `#64748b` | Metadata, timestamps, captions |

---

## Evidence Artifact Colors

For `evidence-code`, `evidence-json`, `evidence-ui`.

| Role | Color |
|------|-------|
| Background | `#0f172a` |
| Title bar | `#1e293b` |
| Border | `#334155` |
| Code text (base) | `#e2e8f0` |
| JSON text | `#22c55e` |
| Accent (keywords, keys) | `#60a5fa` |
| String literal | `#fbbf24` |
| Comment | `#64748b` |

---

## Edge Colors

| Edge Type | Stroke | Notes |
|-----------|--------|-------|
| `flow` | `#334155` | Solid |
| `stream` | `#3b82f6` | Dashed, animated |
| `callback` | `#9333ea` | Dashed bezier |
| `dependency` | `#94a3b8` | Thin, straight |
| `comparison` | `#0ea5e9` | Bidirectional, smoothstep |
| `annotated` | `#0f172a` | Bold, prominent label |
| `rejected` | `#dc2626` | Dotted |
| `async` | `#ca8a04` | Dashed |

---

## Group Border Colors

Used by `group` nodes. Pick the slot that matches the group's contents (e.g. a group of `backend` + `database` can use the Backend or a neutral border).

`style.borderColor = <slot border color>`, `style.backgroundColor = transparent` (or 5–10% alpha of the slot background for visual grouping).

---

## Cloud-Specific Palettes

Swap the semantic slots when drawing cloud-specific diagrams.

### AWS

| Category | Background | Border |
|----------|------------|--------|
| Compute (EC2, Lambda, ECS) | `#ffe8cc` | `#ff9900` |
| Storage (S3, EBS) | `#d3f9d8` | `#3f8624` |
| Database (RDS, DynamoDB) | `#dbeafe` | `#3b48cc` |
| Networking (VPC, Route53) | `#e0d4ff` | `#8c4fff` |
| Security (IAM, KMS) | `#fecaca` | `#dd344c` |
| ML (SageMaker, Bedrock) | `#ccfbf1` | `#01a88d` |

### Azure

| Category | Background | Border |
|----------|------------|--------|
| Compute | `#dbeafe` | `#0078d4` |
| Storage | `#cffafe` | `#50e6ff` |
| Networking | `#ede9fe` | `#773adc` |
| Security | `#ffedd5` | `#ff8c00` |
| AI / ML | `#cffafe` | `#50e6ff` |

### GCP

| Category | Background | Border |
|----------|------------|--------|
| Compute (GCE, Cloud Run) | `#dbeafe` | `#4285f4` |
| Storage (GCS) | `#d1fae5` | `#34a853` |
| Database (Cloud SQL, Firestore) | `#fee2e2` | `#ea4335` |
| Networking | `#fef3c7` | `#fbbc04` |
| AI / ML (Vertex AI) | `#ede9fe` | `#9334e6` |

### Kubernetes

| Component | Background | Border |
|-----------|------------|--------|
| Pod / Service / Deployment | `#dbeafe` | `#326ce5` |
| ConfigMap / Secret | `#e2e8f0` | `#7f8c8d` |
| Ingress | `#ccfbf1` | `#00d4aa` |
| Namespace (group) | `#f8fafc` | `#cbd5e1` (dashed) |

---

## Canvas Background

| Mode | Color |
|------|-------|
| Light | `#ffffff` |
| Light (grid dots) | `#e2e8f0` at 10% opacity |
| Dark | `#0f172a` (viewer setting, not diagram-level) |
