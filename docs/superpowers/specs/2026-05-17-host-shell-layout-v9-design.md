# Host Shell Layout V9 Design

## Status

Approved in chat on 2026-05-17.

## Goal

Redesign the Worker Web Host shell layout so Host stays a thin navigation and
layout chrome while Soul Apps own workspace and session-facing business UI.

## Approved Layout

The page structure becomes:

```text
Host header, 40px full width
  -> left: sidebar toggle
  -> center: Host locator
  -> right: fixed Host panel toggles

Body
  -> sidebar
  -> Soul App main surface
```

The Host header is fixed Host chrome. It does not render Soul App-declared
header slots. Its actions are:

- `PanelLeftClose` / `PanelLeftOpen`: hide or show the Host sidebar.
- `PanelBottom`: reserved for a workspace-scoped web terminal.
- `PanelRight`: reserved for a future right panel.

The sidebar collapse behavior hides the sidebar completely. Desktop collapse
does not retain an icon rail.

## Sidebar Boundary

The Host sidebar shows Host-owned navigation and actions only:

- `New Soul worker`;
- `Search`;
- `Soul Apps`;
- `Soul App -> Soul worker` navigation;
- `Settings` and runtime version at the bottom.

Workspace lists, workspace search/filter, workspace status labels and session
entry points belong to the Soul App main surface, not the Host sidebar.

## Main Surface

The main area continues to render the existing Soul App workbench. This design
does not change HR profile semantics, artifact review behavior, profile
promotion behavior, or mounted protocol routing. The implementation should make
only layout and chrome changes, while preserving existing design tokens and
visual language.

## Verification

- Focused Worker Studio React tests cover full-width Host header, panel toggle
  placeholders, sidebar hide/show, and preservation of Soul App workbench
  behavior.
- Web build or focused Web test gate proves layout code compiles.
- Browser smoke validates the visible shell in expanded and collapsed states.
