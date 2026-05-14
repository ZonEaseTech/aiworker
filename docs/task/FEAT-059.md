# FEAT-059 Production-grade Worker Web localization

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 11:54
- **claimedAt**: 2026-05-10 11:54
- **completedAt**: 2026-05-10 12:12
- **plan**: PLAN-216
- **relatesTo**: apps/web, apps/api, packages/shared, Worker Web settings

## Background

Worker Web already persists a `language` value in local workspace settings and
shows a Language section in Settings, but changing that value does not localize
the interface. The current studio still renders static English copy directly in
`worker-studio.tsx`, including navigation, form labels, empty states, Settings
copy, status labels, and accessibility labels.

## Goal

Make language switching a real product feature for the local vertical Soul
workspace:

- switching language updates the visible Worker Web interface immediately after
  the saved setting returns;
- production copy exists for English, Simplified Chinese, Japanese, and German;
- Settings presents human-readable language options instead of raw locale codes;
- document language state and accessibility labels follow the selected locale;
- tests cover the switch and guard against untranslated shell copy regressions.

## Acceptance Criteria

- UI shell copy in Worker Web is routed through a typed localization catalog
  instead of inline English literals.
- `en`, `zh-CN`, `ja`, and `de` have complete catalog entries for Worker Web
  shell, settings, form, status, and accessibility copy.
- The saved local settings language controls the active locale, with safe
  fallback to English for unknown values.
- Changing the language in Settings updates the page without a full reload and
  persists through the existing `/api/local/settings` endpoint.
- `document.documentElement.lang` reflects the active locale.
- Focused Web tests cover default English, Simplified Chinese switching, fallback
  behavior, and absence of rejected product copy.
- Focused typecheck, lint, build, CSS quality check, browser validation, and
  code-review-graph review are completed before closeout.

## Evidence

- Added a typed Worker Web localization catalog for `en`, `zh-CN`, `ja`, and
  `de`, including shell, Settings, form, status, accessibility, language-option,
  built-in Soul, and built-in capability-template copy.
- Routed Worker Studio shell copy, Settings copy, status formatting, relative
  time labels, language names, and built-in Soul/template display fields through
  the localization layer.
- Persisted settings language now controls the active UI locale, falls back to
  English for unknown values, and updates `document.documentElement.lang`.
- Settings language switching updates the interface immediately after the
  existing `/api/local/settings` save path returns.
- Focused tests cover default English, Simplified Chinese switching, unknown
  language fallback, rejected import/work-order/Open Design copy, and existing
  appearance behavior.
- Browser validation confirmed `en`, `zh-CN`, `ja`, and `de` render expected
  page copy and matching `html lang`; Settings UI switching from German to
  Simplified Chinese updated the dialog and main CTA without reload.
