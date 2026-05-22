# HR app-owned people workbench port

## Goal

Port the already-migrated HR people workbench out of the removed Host renderer
path and into `apps/aiworker-hr`, preserving the Host/Soul ownership boundary.

## Steps

1. Add RED tests in the HR app proving the mounted route must render the real
   people workbench and the app must own the former HR model/parser/review
   behavior.
2. Move pure HR domain modules into
   `apps/aiworker-hr/product/web/people-workbench`.
3. Rebuild the visible route surface with `@zonease/aiworker-ui` shadcn
   components instead of old Host CSS or `@zonease/aiworker-component`.
4. Point standalone and mounted HTML at the app-owned workbench.
5. Update task/plan/changelog audit trail.
6. Run focused HR verification, mounted smoke, boundary/UI audits, diff check
   and code-review-graph.

## Boundary Rules

- `apps/web/src/worker/souls/hr` remains deleted.
- Host may only mount `/micro-app/*` app-owned HTML and invoke declared
  protocol/broker surfaces.
- HR product web may import shared contracts and `@zonease/aiworker-ui`, but not
  Host Web source or legacy component package primitives.
