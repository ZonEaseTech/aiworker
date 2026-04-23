# Templates

Copy-paste JSON for (A) common node/edge forms and (B) full starter diagrams. Derive your diagram from the closest starter and adjust — don't build from empty.

---

## A. Node Templates

### Semantic node with subtitle + badges

```json
{
  "id": "api-server",
  "type": "backend",
  "position": { "x": 440, "y": 420 },
  "data": {
    "label": "API Server",
    "subtitle": "Express.js",
    "badges": ["Node 20", "TS"]
  },
  "sourcePosition": "bottom",
  "targetPosition": "top"
}
```

### Grouped child node

Parent group is declared first; child positions are relative to the parent.

```json
{
  "id": "group__backend-tier",
  "type": "group",
  "position": { "x": 200, "y": 400 },
  "style": { "width": 600, "height": 260 },
  "data": { "label": "Backend Tier", "color": "backend", "dashed": true }
},
{
  "id": "api-server",
  "type": "backend",
  "position": { "x": 40, "y": 60 },
  "parentNode": "group__backend-tier",
  "extent": "parent",
  "data": { "label": "API Server", "subtitle": "Express.js" },
  "sourcePosition": "right",
  "targetPosition": "left"
}
```

### Evidence — code snippet

```json
{
  "id": "evidence__subscribe",
  "type": "evidence-code",
  "position": { "x": 120, "y": 780 },
  "data": {
    "language": "javascript",
    "title": "Subscribe to events",
    "code": "agui.subscribe('RUN_STARTED', (e) => render(e))"
  }
}
```

### Evidence — JSON payload

```json
{
  "id": "evidence__event",
  "type": "evidence-json",
  "position": { "x": 520, "y": 780 },
  "data": {
    "title": "STATE_DELTA",
    "json": "{\n  \"type\": \"STATE_DELTA\",\n  \"path\": \"/cart/items\",\n  \"op\": \"append\"\n}"
  }
}
```

### Title + note pair

```json
{
  "id": "title__overview",
  "type": "title",
  "position": { "x": 100, "y": 60 },
  "data": { "text": "Ingest Pipeline", "level": 1 }
},
{
  "id": "note__scope",
  "type": "note",
  "position": { "x": 100, "y": 110 },
  "data": { "text": "Scope: event ingress, dedup, fan-out to consumers." }
}
```

### Timeline marker + label

```json
{
  "id": "marker__t1",
  "type": "marker",
  "position": { "x": 300, "y": 394 },
  "data": { "color": "primary", "size": 12 }
},
{
  "id": "note__t1",
  "type": "note",
  "position": { "x": 260, "y": 340 },
  "data": { "text": "T+0s — request arrives" }
}
```

---

## B. Edge Templates

### Default flow with label

```json
{
  "id": "edge__api-to-db",
  "source": "api-server",
  "target": "postgres-db",
  "type": "flow",
  "label": "SQL"
}
```

### Stream (animated dashed)

```json
{
  "id": "edge__bus-to-consumer",
  "source": "event-bus",
  "target": "consumer-worker",
  "type": "stream",
  "label": "user.created"
}
```

### Callback / return

```json
{
  "id": "edge__worker-to-api",
  "source": "consumer-worker",
  "target": "api-server",
  "type": "callback",
  "label": "ack"
}
```

### Named handles (e.g. decision yes/no)

```json
{
  "id": "edge__decide-yes",
  "source": "route-decide",
  "sourceHandle": "yes",
  "target": "success-branch",
  "type": "flow",
  "label": "valid"
},
{
  "id": "edge__decide-no",
  "source": "route-decide",
  "sourceHandle": "no",
  "target": "reject-branch",
  "type": "rejected",
  "label": "invalid"
}
```

---

## C. Starter Diagrams

Each starter is a complete valid `.rfd.json` that pma-viewer can render as-is. Use the closest match and iterate.

### C1. 3-Tier Web App

```json
{
  "schema": "pma-draw/v1",
  "type": "reactflow",
  "metadata": { "title": "3-Tier Web App" },
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    { "id": "title", "type": "title", "position": { "x": 100, "y": 60 }, "data": { "text": "3-Tier Web App", "level": 1 } },
    { "id": "user", "type": "user", "position": { "x": 540, "y": 140 }, "data": { "label": "End User" }, "sourcePosition": "bottom", "targetPosition": "top" },
    { "id": "frontend", "type": "frontend", "position": { "x": 540, "y": 280 }, "data": { "label": "Web App", "subtitle": "Next.js" }, "sourcePosition": "bottom", "targetPosition": "top" },
    { "id": "backend", "type": "backend", "position": { "x": 540, "y": 420 }, "data": { "label": "API Server", "subtitle": "Express.js" }, "sourcePosition": "bottom", "targetPosition": "top" },
    { "id": "database", "type": "database", "position": { "x": 320, "y": 580 }, "data": { "label": "Postgres" }, "targetPosition": "top" },
    { "id": "cache", "type": "cache", "position": { "x": 540, "y": 580 }, "data": { "label": "Redis" }, "targetPosition": "top" },
    { "id": "storage", "type": "storage", "position": { "x": 760, "y": 580 }, "data": { "label": "S3", "subtitle": "uploads/" }, "targetPosition": "top" }
  ],
  "edges": [
    { "id": "e1", "source": "user", "target": "frontend", "type": "flow", "label": "HTTPS" },
    { "id": "e2", "source": "frontend", "target": "backend", "type": "flow", "label": "REST" },
    { "id": "e3", "source": "backend", "target": "database", "type": "flow", "label": "SQL" },
    { "id": "e4", "source": "backend", "target": "cache", "type": "flow", "label": "GET/SET" },
    { "id": "e5", "source": "backend", "target": "storage", "type": "flow", "label": "S3 API" }
  ]
}
```

### C2. Event-Driven (hub-and-spoke with stream edges)

```json
{
  "schema": "pma-draw/v1",
  "type": "reactflow",
  "metadata": { "title": "Event-Driven Architecture" },
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    { "id": "title", "type": "title", "position": { "x": 100, "y": 60 }, "data": { "text": "Event-Driven Architecture", "level": 1 } },
    { "id": "bus", "type": "queue", "position": { "x": 560, "y": 360 }, "data": { "label": "Event Bus", "subtitle": "Kafka" } },
    { "id": "producer-orders", "type": "backend", "position": { "x": 140, "y": 200 }, "data": { "label": "Orders Service" }, "sourcePosition": "right" },
    { "id": "producer-users", "type": "backend", "position": { "x": 140, "y": 520 }, "data": { "label": "Users Service" }, "sourcePosition": "right" },
    { "id": "consumer-email", "type": "backend", "position": { "x": 980, "y": 200 }, "data": { "label": "Email Worker" }, "targetPosition": "left" },
    { "id": "consumer-analytics", "type": "backend", "position": { "x": 980, "y": 360 }, "data": { "label": "Analytics" }, "targetPosition": "left" },
    { "id": "consumer-fraud", "type": "ai", "position": { "x": 980, "y": 520 }, "data": { "label": "Fraud Detector", "subtitle": "Vertex AI" }, "targetPosition": "left" }
  ],
  "edges": [
    { "id": "e1", "source": "producer-orders", "target": "bus", "type": "stream", "label": "order.placed" },
    { "id": "e2", "source": "producer-users", "target": "bus", "type": "stream", "label": "user.created" },
    { "id": "e3", "source": "bus", "target": "consumer-email", "type": "stream" },
    { "id": "e4", "source": "bus", "target": "consumer-analytics", "type": "stream" },
    { "id": "e5", "source": "bus", "target": "consumer-fraud", "type": "stream" }
  ]
}
```

### C3. Data Pipeline (horizontal with evidence)

```json
{
  "schema": "pma-draw/v1",
  "type": "reactflow",
  "metadata": { "title": "Data Pipeline" },
  "viewport": { "x": 0, "y": 0, "zoom": 0.9 },
  "nodes": [
    { "id": "title", "type": "title", "position": { "x": 100, "y": 60 }, "data": { "text": "Data Pipeline", "level": 1 } },
    { "id": "source", "type": "storage", "position": { "x": 100, "y": 220 }, "data": { "label": "Raw Events", "subtitle": "S3 / NDJSON" }, "sourcePosition": "right" },
    { "id": "extract", "type": "backend", "position": { "x": 380, "y": 220 }, "data": { "label": "Extract", "subtitle": "AWS Batch" }, "sourcePosition": "right", "targetPosition": "left" },
    { "id": "transform", "type": "backend", "position": { "x": 660, "y": 220 }, "data": { "label": "Transform", "subtitle": "dbt" }, "sourcePosition": "right", "targetPosition": "left" },
    { "id": "warehouse", "type": "database", "position": { "x": 940, "y": 220 }, "data": { "label": "Warehouse", "subtitle": "Snowflake" }, "targetPosition": "left" },
    { "id": "ev__in", "type": "evidence-json", "position": { "x": 100, "y": 360 }, "data": { "title": "Input", "json": "{\n  \"event\":\"click\",\n  \"ts\":172...\n}" } },
    { "id": "ev__out", "type": "evidence-json", "position": { "x": 940, "y": 360 }, "data": { "title": "Modeled row", "json": "{\n  \"event_id\":\"...\",\n  \"user_id\":\"u1\"\n}" } }
  ],
  "edges": [
    { "id": "e1", "source": "source", "target": "extract", "type": "flow" },
    { "id": "e2", "source": "extract", "target": "transform", "type": "flow" },
    { "id": "e3", "source": "transform", "target": "warehouse", "type": "flow" },
    { "id": "d1", "source": "source", "target": "ev__in", "type": "dependency" },
    { "id": "d2", "source": "warehouse", "target": "ev__out", "type": "dependency" }
  ]
}
```

### C4. Microservices with Grouping

```json
{
  "schema": "pma-draw/v1",
  "type": "reactflow",
  "metadata": { "title": "Microservices" },
  "viewport": { "x": 0, "y": 0, "zoom": 0.85 },
  "nodes": [
    { "id": "title", "type": "title", "position": { "x": 100, "y": 60 }, "data": { "text": "Microservices Overview", "level": 1 } },
    { "id": "user", "type": "user", "position": { "x": 100, "y": 160 }, "data": { "label": "Client" }, "sourcePosition": "right" },
    { "id": "gateway", "type": "orchestrator", "position": { "x": 340, "y": 160 }, "data": { "label": "API Gateway", "subtitle": "Kong" } },
    { "id": "group__services", "type": "group", "position": { "x": 620, "y": 140 }, "style": { "width": 560, "height": 300 }, "data": { "label": "Services", "color": "backend", "dashed": true } },
    { "id": "svc-orders", "type": "backend", "position": { "x": 40,  "y": 60  }, "parentNode": "group__services", "extent": "parent", "data": { "label": "Orders" } },
    { "id": "svc-users", "type": "backend", "position": { "x": 40,  "y": 180 }, "parentNode": "group__services", "extent": "parent", "data": { "label": "Users" } },
    { "id": "svc-inventory", "type": "backend", "position": { "x": 320, "y": 60  }, "parentNode": "group__services", "extent": "parent", "data": { "label": "Inventory" } },
    { "id": "svc-payments", "type": "backend", "position": { "x": 320, "y": 180 }, "parentNode": "group__services", "extent": "parent", "data": { "label": "Payments" } },
    { "id": "db-orders", "type": "database", "position": { "x": 680,  "y": 480 }, "data": { "label": "orders_db" }, "targetPosition": "top" },
    { "id": "db-users", "type": "database", "position": { "x": 920,  "y": 480 }, "data": { "label": "users_db" }, "targetPosition": "top" },
    { "id": "bus", "type": "queue", "position": { "x": 340, "y": 480 }, "data": { "label": "Event Bus", "subtitle": "NATS" } }
  ],
  "edges": [
    { "id": "e1", "source": "user", "target": "gateway", "type": "flow" },
    { "id": "e2", "source": "gateway", "target": "svc-orders", "type": "flow" },
    { "id": "e3", "source": "gateway", "target": "svc-users", "type": "flow" },
    { "id": "e4", "source": "svc-orders", "target": "db-orders", "type": "flow" },
    { "id": "e5", "source": "svc-users", "target": "db-users", "type": "flow" },
    { "id": "e6", "source": "svc-orders", "target": "bus", "type": "stream", "label": "order.placed" },
    { "id": "e7", "source": "svc-payments", "target": "bus", "type": "stream", "label": "payment.settled" },
    { "id": "e8", "source": "bus", "target": "svc-inventory", "type": "stream" }
  ]
}
```

### C5. CI/CD Pipeline

```json
{
  "schema": "pma-draw/v1",
  "type": "reactflow",
  "metadata": { "title": "CI/CD Pipeline" },
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    { "id": "title", "type": "title", "position": { "x": 100, "y": 60 }, "data": { "text": "CI/CD", "level": 1 } },
    { "id": "source", "type": "start", "position": { "x": 100, "y": 200 }, "data": { "label": "git push" }, "sourcePosition": "right" },
    { "id": "build", "type": "process", "position": { "x": 340, "y": 200 }, "data": { "label": "Build" }, "sourcePosition": "right", "targetPosition": "left" },
    { "id": "test", "type": "process", "position": { "x": 580, "y": 200 }, "data": { "label": "Test" }, "sourcePosition": "right", "targetPosition": "left" },
    { "id": "gate", "type": "decision", "position": { "x": 820, "y": 200 }, "data": { "label": "Coverage ≥ 80%?" }, "targetPosition": "left" },
    { "id": "deploy", "type": "backend", "position": { "x": 1060, "y": 120 }, "data": { "label": "Deploy", "subtitle": "Prod" }, "targetPosition": "left" },
    { "id": "block", "type": "end", "position": { "x": 1060, "y": 280 }, "data": { "label": "Block" }, "targetPosition": "left" }
  ],
  "edges": [
    { "id": "e1", "source": "source", "target": "build", "type": "flow" },
    { "id": "e2", "source": "build", "target": "test", "type": "flow" },
    { "id": "e3", "source": "test", "target": "gate", "type": "flow" },
    { "id": "e4", "source": "gate", "sourceHandle": "yes", "target": "deploy", "type": "flow", "label": "pass" },
    { "id": "e5", "source": "gate", "sourceHandle": "no", "target": "block", "type": "rejected", "label": "fail" }
  ]
}
```

---

## When to Use Which Starter

| Starter | Good Fit |
|---------|----------|
| C1. 3-Tier | Web app, mobile backend, any classic request/response stack |
| C2. Event-Driven | Pub/sub, event bus, streaming integration |
| C3. Data Pipeline | ETL, ML feature pipelines, analytics workflows |
| C4. Microservices | Service mesh, domain-split systems, gateway-fronted APIs |
| C5. CI/CD | Any decision-gated linear pipeline (release, review, approval) |
