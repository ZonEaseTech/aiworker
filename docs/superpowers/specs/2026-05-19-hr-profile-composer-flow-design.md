# HR Profile Composer Flow Design

## Context

AIWorker HR should let a human complete a candidate People Profile from the Web
without understanding internal nouns such as artifact, skill, capability
template, session metadata, or `README.md` promotion mechanics.

The current HR workbench already has the right product boundary: the accepted
profile is the workspace `README.md`, agent output is reviewable proposal work,
and only review/promotion can update the accepted profile. The problem is the
right panel currently exposes that boundary as duplicated controls: a "next
action" list and a proposal target composer both ask the user what to generate.
After creating a profile, the human cannot tell what to do next.

This design makes the right panel a focused profile composer:

```text
Create profile
  -> add or paste candidate material
  -> generate candidate profile draft
  -> review profile patch in the center
  -> accept into the official profile
```

## Goals

- Make the first useful action after `Create profile` obvious.
- Keep the right panel focused on current input and recent work.
- Remove duplicated "action" versus "artifact target" choices.
- Support text input and multiple candidate material files.
- Keep formal review and profile acceptance in the center reading/review area.
- Preserve the Host/Soul boundary: HR owns profile semantics; Host only routes
  app-owned surfaces.

## Non-Goals

- Do not turn the right panel into a generic dashboard or settings surface.
- Do not expose `person-profile`, `profile-update-proposal`, artifact ids, or
  session plumbing as primary user language.
- Do not let the composer directly modify the accepted profile.
- Do not keep a collapsed icon rail for the right panel.
- Do not solve full ATS connector ingestion in this pass; file and source
  handles can become inputs to the existing proposal flow.

## Final Layout

The HR workbench keeps three regions when the right panel is open:

```text
Profile list | Current accepted profile / patch review | Right panel
```

The right panel has exactly two blocks:

1. `Recent Sessions`
2. Profile composer

`Recent Sessions` sits at the top because it is context, not the primary work
surface. The composer fills the remaining height because it is the current
action surface.

When the right panel is hidden, it disappears completely. The center profile
reading/review area expands. Reopening the panel uses the existing Host header
panel toggle, not a narrow in-content icon rail.

## Right Panel

### Recent Sessions

The session list is compact and profile-scoped.

- It shows session name, output kind, and a short status/time marker.
- It does not repeat the workspace or profile name.
- It shows at most four visible items.
- If there are more than four sessions, the list scrolls internally.
- Selecting a session opens that session detail/history.

Example:

```text
Recent Sessions                         4 recent

档案草案             候选人档案草案      active
证据整理             证据整理            2h
面试重点             面试提纲            1d
风险措辞             风险检查            3d
```

### Composer

The composer is a single card-like input surface with a light header, one large
textarea, optional attachment rows, and a bottom action bar.

Header:

```text
补全 Stella 的候选人档案
生成可 review 的档案草案，不会直接修改正式档案。
```

The second line is secondary text. It explains the safety boundary without
competing with the action name.

Textarea placeholder:

```text
粘贴简历、ATS 摘要、目标岗位、面试记录、证据链接、开放问题，
或说明你希望这份档案先补齐什么...
```

Action bar:

```text
[+]                         [候选人档案草案 v]      [submit arrow]
```

Action bar rules:

- The `+` button opens material input options: upload files, paste files, add
  source links, or attach existing workspace files.
- The proposal type button displays the current proposal type directly. It does
  not need a visible "提案" label.
- The submit button generates the selected proposal type.
- Do not show "添加材料", "提案", or "完全访问权限" as persistent labels in the
  action bar.

Default proposal type:

```text
候选人档案草案
```

This maps to the profile update proposal flow. Other proposal types can appear
inside the selector:

- 证据整理
- 面试提纲
- 风险检查

The selector is secondary. The empty-profile path should default to candidate
profile draft.

## Multi-File Input

The composer supports multiple candidate material files.

Attachments appear below the textarea and above the action bar. This keeps the
main textarea as the primary intent surface while making attached evidence
visible before submission.

Attachment rules:

- Show compact rows with file type, filename, size or source label, and remove
  action.
- Keep the attachment list at a fixed max height.
- Show around three rows before internal scrolling.
- Show the total attachment count as a badge on the `+` button.
- Support mixed materials: local files, source links, pasted files, and future
  connector-backed references.
- Submission sends text instructions and material references together to the
  proposal session.

Example:

```text
Stella_resume_2026.pdf       PDF 312 KB   x
ats_candidate_export.csv     CSV 48 KB    x
interview-notes-round-1.md   MD 8 KB      x
另有 2 个文件，滚动查看
```

## Main Area

The center area remains the source of truth for accepted profile state and
formal review.

Empty profile state:

```text
还没有正式档案
右侧 composer 会生成一份可 review 的档案草案。
接受后，这里会显示 Stella 的正式档案。
```

After proposal generation, the center area should surface the profile patch
state:

```text
档案草案已生成
[审阅档案草案]
```

Patch review replaces the center reading room while active. It compares current
accepted profile content with the proposed accepted profile content. Approving
the patch is a center-area decision, not a right-panel action.

Acceptance flow:

```text
审阅档案草案
  -> 对比当前正式档案和拟接受版本
  -> 接受为正式档案
  -> 正式档案更新
  -> 写入 review 记录
```

## State Model

### Empty Profile

- Recent Sessions may be empty or show creation/bootstrap sessions.
- Composer defaults to `候选人档案草案`.
- Center area explains that no official profile exists yet.

### Draft In Progress

- Composer can show the current text, attachments, and disabled/busy submit
  state.
- Recent Sessions shows the active session compactly.
- Center area remains on the accepted profile view until a reviewable patch is
  available.

### Patch Ready

- Center area shows a `审阅档案草案` entry point.
- Right panel stays available for more material, but does not contain the final
  approve action.

### Patch Blocked

- Center area explains why the proposal cannot be accepted, for example missing
  accepted profile draft or proposal-state language inside the draft.
- Right panel can be used to generate a corrected proposal.

### Accepted Profile

- Center area shows the updated accepted profile.
- Recent Sessions includes the proposal/review session.
- Composer remains available for the next profile update or supporting work.

## Data Flow

1. User creates a profile workspace.
2. HR workspace initializes accepted profile scaffolding and projected native
   skills.
3. User enters text and optional files/source references in the composer.
4. Submit starts a workspace session using the selected proposal type.
5. The selected flow produces a reviewable proposal artifact.
6. Web parses whether the artifact can form a profile patch.
7. User reviews the patch in the center area.
8. Approval calls the profile revision promotion path.
9. The accepted profile updates and review evidence is recorded.

The user-facing language is HR language:

- 候选人档案
- 候选人材料
- 档案草案
- 证据整理
- 面试提纲
- 风险检查
- 正式档案

Technical ids stay behind the interface.

## Error Handling

- File upload failure: keep the composer text intact and show an attachment-row
  error state or toast.
- Unsupported file type: reject the file before submission and explain the
  supported evidence formats.
- Proposal generation failure: keep the active session visible in Recent
  Sessions with failed status and leave composer input available for retry.
- Patch extraction failure: center area shows the blocker and suggests creating
  a corrected candidate profile draft.
- Promotion failure: center area keeps current accepted profile unchanged and
  displays the promotion error.

## Verification

Implementation should include focused tests for:

- Create profile opens a profile whose right panel defaults to candidate profile
  draft.
- Right panel shows Recent Sessions above the composer.
- Recent Sessions uses session names and does not repeat workspace/profile name.
- Recent Sessions shows at most four visible items and scrolls overflow.
- Composer fills remaining right-panel height.
- Action bar has add-material, proposal-type, and submit controls only.
- The proposal type selector displays the current proposal type without a
  persistent "提案" label.
- Multi-file attachments render compact rows, can be removed, and expose total
  count on the `+` button.
- Closing the right panel removes the panel entirely and does not render an icon
  rail.
- Review and approval remain in the center profile patch review flow.

Visual verification should cover desktop and narrow layouts to ensure the
composer remains usable, attachment rows do not overflow, and text does not
overlap controls.

## Design Artifact

The latest high-fidelity visual companion mockup is:

```text
.superpowers/brainstorm/40906-1779170888/content/hr-profile-composer-v9-files.html
```

That mockup is a local brainstorming artifact, not product source.
