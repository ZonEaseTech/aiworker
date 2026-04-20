# AIWorker Architecture

## Overview

AIWorker is a middleware service that bridges **Hermes Agent** (knowledge base, memory, self-improving skills) with **OpenClaw** (execution gateway, tool sandboxing, message routing). It provides a unified management UI and API layer for orchestrating the two systems.

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend (Web)                 │
│         React 19 + Vite 8 + TanStack            │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Dashboard │ │ Skills   │ │ Memory Explorer  │ │
│  │          │ │ Manager  │ │                  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Execution│ │ Config   │ │ Sync Status      │ │
│  │ Monitor  │ │ Editor   │ │                  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│              Backend API (Bun + Hono)            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Module Layer                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐  │  │
│  │  │ Skills   │ │ Memory   │ │ Execution │  │  │
│  │  │ Sync     │ │ Bridge   │ │ Monitor   │  │  │
│  │  └──────────┘ └──────────┘ └───────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐  │  │
│  │  │ Config   │ │ Health   │ │ Events    │  │  │
│  │  │ Manager  │ │ Check    │ │ Stream    │  │  │
│  │  └──────────┘ └──────────┘ └───────────┘  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Adapter Layer                    │  │
│  │  ┌──────────────┐  ┌───────────────────┐   │  │
│  │  │ Hermes       │  │ OpenClaw          │   │  │
│  │  │ Adapter      │  │ Adapter           │   │  │
│  │  │ - filesystem │  │ - WebSocket API   │   │  │
│  │  │ - API server │  │ - REST config     │   │  │
│  │  │ - MCP client │  │ - plugin hooks    │   │  │
│  │  └──────────────┘  └───────────────────┘   │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  SQLite (Drizzle) — sync state, events     │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐       ┌─────────────────────┐
│  Hermes Agent   │       │     OpenClaw         │
│                 │       │                      │
│ ~/.hermes/      │       │ ~/.openclaw/         │
│  ├── skills/    │       │  ├── workspace/      │
│  ├── memories/  │       │  │   ├── skills/     │
│  ├── config.yaml│       │  │   ├── MEMORY.md   │
│  └── .env       │       │  ├── openclaw.json   │
│                 │       │  └── .env            │
│ API: :8642      │       │                      │
│ MCP: stdio      │       │ Gateway: :18789 (WS) │
└─────────────────┘       └─────────────────────┘
```

## Module Breakdown

### Backend Modules

| Module | Responsibility |
|--------|---------------|
| `skills-sync` | Bidirectional skill discovery and sync between Hermes and OpenClaw via agentskills.io format |
| `memory-bridge` | Read Hermes memory files, provide search/query API, write execution feedback |
| `execution-monitor` | Poll OpenClaw gateway events, track tool execution, capture results |
| `config-manager` | Unified config read/write for both Hermes and OpenClaw settings |
| `health-check` | Periodic health checks for both services, status aggregation |
| `events-stream` | SSE endpoint for real-time event forwarding to frontend |

### Adapter Layer

| Adapter | Interface | Protocol |
|---------|-----------|----------|
| Hermes filesystem | `~/.hermes/skills/`, `~/.hermes/memories/` | Direct file I/O |
| Hermes API | `http://localhost:8642/v1` | OpenAI-compatible REST |
| Hermes MCP | `hermes mcp serve` | MCP stdio |
| OpenClaw Gateway | `ws://localhost:18789` | WebSocket JSON frames |
| OpenClaw config | `~/.openclaw/openclaw.json` | Direct file I/O |

### Frontend Pages

| Page | Function |
|------|----------|
| Dashboard | Overview: service status, recent events, skill/memory counts |
| Skills Manager | Browse, sync, diff skills between Hermes and OpenClaw |
| Memory Explorer | Search and browse Hermes memories, view execution feedback |
| Execution Monitor | Live view of OpenClaw executions, tool calls, results |
| Config Editor | Unified config management for both services |
| Sync Status | Sync history, conflict resolution, manual triggers |

## Data Flow

### Skill Sync Flow

```
Hermes ~/.hermes/skills/  ←──── AIWorker watches ────→  OpenClaw ~/.openclaw/workspace/skills/
           │                        │                              │
           │                   ┌────┴────┐                         │
           │                   │ Diff &  │                         │
           │                   │ Merge   │                         │
           │                   └────┬────┘                         │
           │                        │                              │
           └──── agentskills.io ────┘──── agentskills.io ─────────┘
```

### Execution Feedback Loop

```
OpenClaw executes tool
  → AIWorker captures result via Gateway WS events
  → Stores in SQLite event log
  → Writes feedback to Hermes-readable format
  → Hermes learns from feedback (skill create/improve)
```

## Key Design Decisions

1. **File-first for skills/memory**: Direct filesystem access for Hermes/OpenClaw data, not API wrappers around file reads.
2. **WebSocket for OpenClaw events**: Gateway WS is the canonical event source, not polling.
3. **SQLite for glue state**: Sync metadata, event log, conflict history. Not a replacement for either system's storage.
4. **No forking**: AIWorker does not modify Hermes or OpenClaw source code. Pure middleware.
