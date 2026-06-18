# AIWorker Web Framework Decision

Date: 2026-06-14
Status: accepted for the initial `apps/aiworker-web` implementation

## Decision

Build `apps/aiworker-web` as a Vite + React single-page admin console with React Router in library/declarative/data-router style, served by a small Bun HTTP entry for production packaging.

Do **not** use Next.js for the first AIWorker Web milestone.

## Product boundary

AIWorker Web is an admin/control surface for the current thin AIWorker-on-Paseo architecture. It may show and manage:

- assignments;
- provisioning plans/status;
- redacted receipts and audit events;
- handoff metadata;
- Soul release visibility;
- Paseo environment and provider-profile metadata.

It must not render or proxy Paseo workspace UI, employee sessions, transcripts, terminal/log streams, provider process state, Workbench, or any Worker daemon/runtime surface.

## Evidence

### Bun packaging target

Official Bun docs support bundling a TypeScript/JavaScript entry for the Bun runtime with `bun build --target=bun`. AIWorker Web uses a portable Bun-runnable server bundle plus Vite static assets for the single npm CLI package, rather than a platform-specific compiled executable.

- Source: https://bun.sh/docs/bundler

Local proof in `tmp/framework-proof` verified the intended deployment shape:

```bash
cd tmp/framework-proof
bun run build
bun build --target=bun server.ts --outfile dist-server/server.js
PORT=20831 bun dist-server/server.js
curl -fsS http://127.0.0.1:20831/
curl -fsS http://127.0.0.1:20831/admin/assignments
```

Result: Vite emitted static assets under `dist/`; Bun bundled the static server to `dist-server/server.js`; the bundled server served both `/` and deep-link fallback routes. The production server resolves static assets from `process.cwd()/dist` or explicit `AIWORKER_WEB_DIST`, which also lets the CLI package serve assets from `web/static/**`.

### Vite fit

Official Vite docs state that `vite build` uses `<root>/index.html` by default and produces a production bundle suitable for static hosting.

- Source: https://vite.dev/guide/build

This matches AIWorker Web's initial needs: client-side admin workflows, no SEO need, no RSC/SSR requirement, and simple Bun serving/packaging.

Vite has one Bun-specific env caveat: Bun preloads `.env` into `process.env`, which can affect Vite env loading. AIWorker Web should avoid relying on implicit Vite env magic for secrets; public client config should stay `VITE_*`, and provider/secret values must remain server-side references only.

- Source: https://vite.dev/guide/env-and-mode

### React Router fit

React Router docs explicitly support starting with a Vite React template and using React Router as lightly or fully as needed. The initial web app should use the lightweight router path rather than React Router Framework Mode to avoid adding a server runtime until a real server-side need exists.

- Source: https://reactrouter.com/start/declarative/installation
- Source: https://reactrouter.com/start/modes

### shadcn fit

shadcn official Vite docs support `init -t vite`, monorepo usage, and adding components through the CLI. The CLI docs also define `init`, `add`, `apply`, `preset`, and `info` workflows. AIWorker Web must use the CLI for shadcn components and preset management rather than copying registry source by hand.

- Source: https://ui.shadcn.com/docs/installation/vite
- Source: https://ui.shadcn.com/docs/cli

### Why not Next.js now

Next.js is viable for full-stack React apps, but it is not the smallest reliable fit for this Bun-packaged admin console milestone:

- Official Next.js deployment docs list Node.js server, Docker, static export, and adapters as deployment paths. Node/Docker/adapter paths add runtime/deployment complexity that AIWorker Web does not need yet.
- Next.js static export can be served by any static web server, but it limits features that require a server. If we are choosing a static/admin SPA shape, Vite is the simpler direct tool.
- Bun's official Next.js guide shows Bun can create, install, build, and start Next.js apps through `bun --bun next ...`; this is runtime support, not evidence that a Next app becomes a simple Bun-compiled executable.
- The Next.js Bun adapter exists, but current public adapter documentation describes a `bun-dist/` runtime package that still boots Next.js from the project directory and `.next` output, so it is not the minimal portable Bun server plus static asset artifact for this project.

Sources:

- https://nextjs.org/docs/app/getting-started/deploying
- https://nextjs.org/docs/pages/guides/static-exports
- https://bun.com/docs/guides/ecosystem/nextjs
- https://github.com/nextjs/adapter-bun

## Implementation consequences

- Add `apps/aiworker-web`, not `apps/worker-web`, `apps/host-web`, or `packages/ui`.
- Use local app shadcn components under `apps/aiworker-web/src/components/ui` because the current monorepo contract forbids recreating `packages/ui`.
- Use `bunx --bun shadcn@latest` for shadcn operations in this Bun workspace.
- Match `/home/ben/projects/aiworker-next` shadcn token identity: `radix-mira`, zinc base, phosphor icons, Tailwind v4, `shadcn/tailwind.css`, semantic status tokens, default light theme with dark tokens available, and CJK-safe font variables.
- Use shadcn composition for the admin console: sidebar, cards, tables/lists, badges, forms/fields, tabs, alerts, dialogs/sheets/tooltips as needed.
- Hand-written CSS/Tailwind is allowed only for layout composition and token wiring; no hand-rolled component styling system.
