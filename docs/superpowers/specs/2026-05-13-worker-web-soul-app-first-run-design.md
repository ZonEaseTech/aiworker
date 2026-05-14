# Worker Web Soul App first-run design

## Decision

Worker Web first-run starts from enabled Soul Apps, not from an empty worker
object. The internal path remains Soul App -> worker -> workspace -> session,
but the user begins by choosing a business app such as HR or QA.

## Screen Shape

When no workers exist, the main surface shows:

- title: "Choose a Soul App to start";
- short copy that explains AIWorker will create a worker, workspace and session;
- one card per enabled Soul App;
- primary actions such as "Start AIWorker HR" and "Start AIWorker QA".

The left rail shows navigation and concise app readiness. Technical fields such
as API route, permission count, mounted slots and surface ids move into a
collapsed `Developer details` disclosure.

## Flow

1. User clicks a Soul App start card.
2. Existing worker creation dialog opens with that app-projected Soul selected.
3. After worker creation, the app routes to the created worker.
4. Existing worker home then lets the user create a workspace and start a
   session.

## Non-Goals

- Do not auto-create a default HR worker on page load.
- Do not reintroduce Host built-in Souls.
- Do not change backend APIs.
- Do not expose mounted protocol diagnostics in the main first-run path.
