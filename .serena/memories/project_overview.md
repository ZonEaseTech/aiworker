# Project Overview

AIWorker 是自托管 worker/fleet runtime。Gateway 是 WebSocket 控制面，持有 fleet.db；worker 是数据面，持有各自的 worker.db。完整架构以 docs/architecture.md 为准。

主要形态：
- apps/api：worker HTTP API、OpenAPIHono 文档、worker admin 静态托管。只负责 worker 数据面路由、middleware 和 bootstrap 装配。
- apps/gateway：fleet WebSocket gateway，Bun.serve 默认 :9218，/ws 处理 operator/node 控制帧，/health 做 readiness。
- apps/cli：发布单一 aiworker CLI，覆盖 worker-local、operator-remote、gateway 生命周期和 install systemd。
- apps/web：React 19 双视角 SPA，fleet bundle 只走 gateway WS，worker bundle 只走 worker REST/SSE + bearer-auth。
- packages/core：transport-agnostic worker runtime，封装 brain、executor、channels、orchestrator、cron、approvals、gateway-client、secrets、runtime 等业务态。
- packages/gateway-proto：gateway WS 协议类型和 zod 校验。
- packages/storage-sqlite：fleet.db 和 worker.db 的 Drizzle schema、配置和迁移。
- packages/fs-layout：AIWORKER_HOME、project scope、worker home 与模板路径解析。
- packages/shared：共享类型与工具。

技术栈：Bun、TypeScript、Hono/OpenAPIHono、Drizzle ORM、SQLite、Zod、consola、React 19、Vite 8、TanStack Router/Query、Zustand、Base UI/shadcn/ui、Tailwind CSS v4。

默认用中文和用户交流；文档、代码注释、commit message、PR title/description 也默认中文。对外可见内容避免提及具体协作工具、模型名称或内部执行过程，除非用户明确要求。