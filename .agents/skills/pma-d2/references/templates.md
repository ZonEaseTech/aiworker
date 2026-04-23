# Templates

Copy-paste-ready `.d2` files. Each template is complete and renders as-is with `d2 name.d2 name.svg`. Swap labels and colors; don't rewrite from scratch.

---

## 1. Three-tier web architecture

```d2
vars: {
  d2-config: {
    theme-id: 0
    dark-theme-id: 200
    pad: 80
    layout-engine: elk
  }
}

classes: {
  frontend: {style: {fill: "#eff6ff"; stroke: "#3b82f6"}}
  backend:  {style: {fill: "#ecfdf5"; stroke: "#10b981"}}
  db:       {shape: cylinder; style: {fill: "#f5f3ff"; stroke: "#8b5cf6"}}
  cache:    {shape: stored_data; style: {fill: "#fef2f2"; stroke: "#ef4444"}}
  async:    {style: {stroke: "#06b6d4"; stroke-dash: 4; animated: true}}
}

direction: right

user: Shopper {
  shape: person
}

edge: CloudFront + WAF {
  shape: cloud
  style: {fill: "#f1f5f9"; stroke: "#64748b"}
}

app: Application tier {
  web.class: frontend
  api.class: backend
  worker.class: backend
}

data: Data tier {
  primary: "PostgreSQL 16" {class: db}
  replica: "Read replica" {class: db; style.opacity: 0.85}
  cache: "Redis" {class: cache}
}

user -> edge -> app.web -> app.api
app.api -> data.primary: writes
app.api -> data.replica: reads
app.api -> data.cache
(app.api -> app.worker)[0].class: async
app.worker -> data.primary
```

---

## 2. Event-driven microservices

```d2
vars.d2-config: {
  theme-id: 0
  pad: 80
  layout-engine: elk
}

classes: {
  service: {style: {fill: "#ecfdf5"; stroke: "#10b981"}}
  queue:   {shape: queue; style: {fill: "#fefce8"; stroke: "#eab308"}}
  db:      {shape: cylinder; style: {fill: "#f5f3ff"; stroke: "#8b5cf6"}}
  external: {shape: cloud; style: {fill: "#f1f5f9"; stroke: "#64748b"}}
  async:   {style: {stroke: "#06b6d4"; stroke-dash: 4; animated: true}}
  sync:    {style.stroke: "#64748b"}
  error:   {style: {stroke: "#dc2626"; stroke-dash: 2}}
}

direction: right

api.class: service
orders.class: service
payments.class: service
notifier.class: service

events: "Kafka" {class: queue}
dlq:    "DLQ" {class: queue; style.fill: "#fee2e2"}
orders_db.class: db
payments_db.class: db

stripe.class: external

# Sync entry
(api -> orders)[0].class: sync

# Async fanout
(orders -> events)[0].class: async
(events -> payments)[0].class: async
(events -> notifier)[0].class: async

# Payments
(payments -> stripe)[0].class: sync
payments -> payments_db

# Orders
orders -> orders_db

# Failures
(payments -> dlq)[0].class: error
```

---

## 3. Data pipeline

```d2
vars.d2-config: {
  theme-id: 0
  pad: 80
  layout-engine: elk
}

classes: {
  source: {shape: cloud; style: {fill: "#f1f5f9"; stroke: "#64748b"}}
  stage:  {shape: step;  style: {fill: "#ecfdf5"; stroke: "#10b981"}}
  sink:   {shape: cylinder; style: {fill: "#f5f3ff"; stroke: "#8b5cf6"}}
  stream: {style: {stroke: "#06b6d4"; stroke-dash: 4; animated: true}}
}

direction: right

ingest: Ingest {
  kafka.class: source
  s3_raw.class: source
}

transform: Transform {
  extract.class: stage
  clean.class: stage
  enrich.class: stage
}

serve: Serve {
  warehouse.class: sink
  feature_store.class: sink
  dashboards: BI dashboards {
    shape: document
  }
}

(ingest.kafka -> transform.extract)[0].class: stream
(ingest.s3_raw -> transform.extract)[0].class: stream
transform.extract -> transform.clean -> transform.enrich
transform.enrich -> serve.warehouse
transform.enrich -> serve.feature_store
serve.warehouse -> serve.dashboards
```

---

## 4. CI/CD pipeline

```d2
vars.d2-config: {
  theme-id: 0
  pad: 80
}

classes: {
  gate: {shape: diamond; style: {fill: "#fefce8"; stroke: "#eab308"}}
  job:  {shape: step;    style: {fill: "#ecfdf5"; stroke: "#10b981"}}
  art:  {shape: package; style: {fill: "#f5f3ff"; stroke: "#8b5cf6"}}
  env:  {shape: cloud;   style: {fill: "#f1f5f9"; stroke: "#64748b"}}
  deploy: {style: {stroke: "#3b82f6"; stroke-width: 3}}
}

direction: right

push: git push {
  shape: circle
}

ci: CI {
  lint.class: job
  test.class: job
  build.class: job
  image: "OCI image" {class: art}
}

review: PR review {class: gate}
merge: Merge to main {class: gate}

cd: CD {
  staging.class: env
  canary.class: env
  prod.class: env
}

push -> ci.lint -> ci.test -> ci.build -> ci.image
ci.image -> review -> merge
(merge -> cd.staging)[0].class: deploy
(cd.staging -> cd.canary)[0].class: deploy
(cd.canary -> cd.prod)[0].class: deploy
```

---

## 5. OAuth 2.0 sequence

```d2
vars.d2-config.pad: 80

oauth: Authorization Code Flow (PKCE) {
  shape: sequence_diagram

  user: User
  browser: Browser
  app: Client App
  auth: Auth Server
  api: Resource API

  user -> browser: click "Sign in"
  browser -> app: GET /login

  authorize: Authorize phase {
    app -> auth: redirect /authorize (code_challenge)
    auth -> browser: consent
    browser -> auth: POST /consent
    auth -> app: redirect + code
  }

  token: Token phase {
    app -> auth: POST /token (code + verifier)
    auth -> app: access_token + refresh_token
  }

  access: Access phase {
    app -> api: GET /me (Bearer)
    api -> app: 200 { profile }
    app -> browser: render dashboard
  }
}
```

---

## 6. ERD — e-commerce core

```d2
vars.d2-config: {
  theme-id: 0
  pad: 80
}

classes: {
  fk: {
    source-arrowhead: {shape: cf-many; label: "*"}
    target-arrowhead: {shape: cf-one-required; label: "1"}
  }
}

users: {
  shape: sql_table
  style.stroke: "#22c55e"
  id: uuid {constraint: primary_key}
  email: text {constraint: [unique; not_null]}
  created_at: timestamptz
}

orders: {
  shape: sql_table
  style.stroke: "#f97316"
  id: uuid {constraint: primary_key}
  user_id: uuid {constraint: foreign_key}
  total_cents: int
  status: text
  created_at: timestamptz
}

order_items: {
  shape: sql_table
  style.stroke: "#f97316"
  id: uuid {constraint: primary_key}
  order_id: uuid {constraint: foreign_key}
  product_id: uuid {constraint: foreign_key}
  qty: int
  unit_cents: int
}

products: {
  shape: sql_table
  style.stroke: "#8b5cf6"
  id: uuid {constraint: primary_key}
  sku: text {constraint: unique}
  name: text
  price_cents: int
}

(orders.user_id -> users.id)[0].class: fk
(order_items.order_id -> orders.id)[0].class: fk
(order_items.product_id -> products.id)[0].class: fk
```

---

## 7. Kubernetes cluster grid

```d2
vars.d2-config: {
  theme-id: 0
  pad: 40
  layout-engine: elk
}

classes: {
  node:    {style: {fill: "#eff6ff"; stroke: "#3b82f6"}}
  control: {style: {fill: "#fef2f2"; stroke: "#ef4444"}; shape: hexagon}
  pod:     {style: {fill: "#ecfdf5"; stroke: "#10b981"}; shape: rectangle}
}

cluster: Production Cluster (us-west-2) {

  control_plane: Control Plane {
    apiserver.class: control
    scheduler.class: control
    controller_manager.class: control
    etcd: {shape: cylinder; style: {fill: "#f5f3ff"; stroke: "#8b5cf6"}}
    apiserver -> etcd
    scheduler -> apiserver
    controller_manager -> apiserver
  }

  workers: Worker Nodes {
    grid-rows: 2
    grid-columns: 3
    grid-gap: 16

    node_01: {
      class: node
      pod_a.class: pod
      pod_b.class: pod
    }
    node_02: {class: node; pod_c.class: pod; pod_d.class: pod}
    node_03: {class: node; pod_e.class: pod; pod_f.class: pod}
    node_04: {class: node; pod_g.class: pod; pod_h.class: pod}
    node_05: {class: node; pod_i.class: pod}
    node_06: {class: node; pod_j.class: pod}
  }
}
```

---

## 8. Decision flowchart (incident triage)

```d2
vars.d2-config.pad: 60
direction: down

classes: {
  start:    {shape: circle; style: {fill: "#ecfdf5"; stroke: "#10b981"}}
  decision: {shape: diamond; style: {fill: "#fefce8"; stroke: "#eab308"}}
  action:   {shape: rectangle; style: {fill: "#eff6ff"; stroke: "#3b82f6"}}
  end:      {shape: oval; style: {fill: "#f5f3ff"; stroke: "#8b5cf6"}}
}

alert.class: start
alert.label: Alert fires

customer_impact: Customer impact? {class: decision}
p1: Declare P1 {class: action}
p2: Track as P2 {class: action}

rollback_possible: Recent deploy? {class: decision}
rollback: Rollback deploy {class: action}
investigate: Investigate {class: action}

resolved.class: end

alert -> customer_impact
customer_impact -> p1: yes
customer_impact -> p2: no
p1 -> rollback_possible
p2 -> investigate
rollback_possible -> rollback: yes
rollback_possible -> investigate: no
rollback -> resolved
investigate -> resolved
```

---

## 9. Multi-view composition (layers)

```d2
vars.d2-config: {
  theme-id: 0
  pad: 80
}

# Root board
title: System overview {
  shape: text
  near: top-center
  style.font-size: 28
  style.bold: true
}

user -> web -> api -> db

layers: {
  deployment: {
    title: Deployment view {
      shape: text
      near: top-center
      style.bold: true
    }
    cluster: k8s {
      grid-rows: 2
      grid-columns: 2
      node1; node2; node3; node4
    }
  }

  sequence: {
    title: Sign-in sequence {
      shape: text
      near: top-center
      style.bold: true
    }
    flow: {
      shape: sequence_diagram
      user; web; api; db
      user -> web -> api -> db
      db -> api -> web: result
    }
  }
}
```

---

## 10. Animated request lifecycle (steps)

```d2
vars.d2-config.pad: 60
direction: right

client.shape: person
api.shape: rectangle
auth.shape: rectangle
db.shape: cylinder
cache.shape: stored_data

steps: {
  s1: Request arrives {
    client -> api
  }
  s2: Cache check {
    api -> cache: GET
    cache -> api: MISS
  }
  s3: Auth verify {
    api -> auth: verify token
    auth -> api: ok
  }
  s4: Read + write cache {
    api -> db: SELECT
    db -> api: rows
    api -> cache: SET
  }
  s5: Respond {
    api -> client: 200 OK
  }
}
```

Render:
```
d2 --animate-interval=1500 lifecycle.d2 lifecycle.gif
```

---

## Using templates

1. Copy the template that's ~80% the target diagram.
2. Rename nodes / containers.
3. Adjust the `classes:` block to match the actual subsystems.
4. Apply classes via `.class:` or glob.
5. Walk edges — is each edge style semantically meaningful?
6. Run validation (`validation.md`).
