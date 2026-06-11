# 审计 backlog:host-worker 联调 (host-worker integration)

- 日期:2026-06-10
- 状态:tracking backlog(来自闭门造车审计,逐条可追踪)
- 来源:tmp/aiworker-audit-2026-06-10/report.md + findings.json
- 范围:Phase 2 分发/隧道/控制协议联调闭环 —— Worker Access 反向隧道(WAT-\*)、provision/check-in、控制协议、Worker daemon 与 Host daemon 对称(系统级 SL-2)、自研反向隧道 vs 成熟方案(系统级 SL-4)。Phase 2.1 managed-access 已部署生产 rc.10 两台互联。
- 相关线:本线的 provision/check-in/token 主题与 host 独立 spec 的 auth-3(worker list 恒空)、auth-5(token 哈希)成对;WAT-2(token TTL)与 auth-5(token 哈希)同属 Phase 2 token 模型。SL-2 的 WDLM-1 修复对称性指向 worker 独立 spec 的 WDLM-1/3/4。

## 概览

本线 finding 计数(2 条 WAT + 2 系统级):
- high:WAT-1(隧道帧破坏 SSE/二进制资产)
- medium:SL-2(daemon 对称冗余,系统级)、SL-4(自研隧道重造成熟方案,系统级)
- low:WAT-2(token TTL 24h 静默过期)
- 已解决:0;全部 ⬜ 待办。
- 驳回:本线无。

## Findings

### WAT-1 · 隧道 wire 协议文本缓冲无 streaming 帧,破坏 Workbench 自己的 live SSE 聊天并损坏二进制资产 `[high][contract-drift][⬜ 待办]`

- **现状/问题**:`workerAccessFrameSchema` 是 hello/ping/pong/request/response/close 闭合 union、**无 chunk/stream 帧**,response 整 body 作 `bodyText: z.string()`;`provision-client.ts` `await response.text()` 完整缓冲 + UTF-8 解码本地 response;host-server 每个转发请求硬 15000ms setTimeout reject;`new Response(parsed.bodyText)` 把文本重编码回字节。后果:(1) Workbench live SSE 聊天经隧道在 15s 后死掉(running invocation 返 live streamSSE 永不关);(2) favicon.png/woff2 等非-UTF-8 二进制资产经文本往返**有损损坏**且无 poll fallback。已部署生产。
- **证据**:`worker-control-protocol/src/index.ts:115-122`(闭合 frame union)、`:84-90`(单 bodyText)、`provision-client.ts:392-399`(await response.text())、`host-server.ts:170-173`(15s 超时)、`:874-878`(重编码)、`use-invocation-events.ts:76,120-121` + `chat-transcript.tsx:62`(生产 EventSource 经隧道)、`worker.ts:601-603,1238`(live streamSSE)、`worker.ts:732-736` + `web-static.ts:50-69`(png/woff2 资产)。
- **建议**:scope 到 Phase-2.1 managed-access 路径(localhost/standalone 不受影响)。给 `workerAccessFrameSchema` 加 streaming 帧集(response-start + response-chunk + response-end keyed by request id),body 字节走 base64(或专用 binary 帧)替单 bodyText;把 `host-server.ts:170` 的 15s 超时改 per-route 可配置/对 streaming content-type 禁用。WS-only transport 选择**不是** bug,把每次交换塌缩成单个缓冲文本信封才是。修复留在已是 Phase-2 的 control-protocol 包内、不碰 v1 hot path。**通用隧道(frp/cloudflared/chisel)不可 drop-in 替换手搓 framing** —— 它们在 L4/L7 终结于 per-assignment access-token + email-match + header-denylist 网关之下、会绕过那个产品级授权;root-gg/wsp、erebe/wstunnel 仅作 streaming 帧设计参考。
- **状态**:⬜ 待办。

### SL-2 · Worker daemon 与 Host daemon 两套对称生命周期是从零平行实现、零共享代码 `[medium][redundant-abstraction][⬜ 待办]` `[系统级]`

- **现状/问题**:host-cli 注册与 worker 完全对称的整套生命周期(start/daemon start|foreground|restart|status|stop|clean|logs/serve),描述自承「start Host services with the same lifecycle shape as Worker」;但 `host-lifecycle.ts`(629 LOC)有自己的 spawn/manifest/tmux/pidFile、import **零个** worker 侧符号 —— 不是共享抽象,是 worker daemon 守护链路的字面平行复制。同类 PID-liveness/tmux/manifest 逻辑两份独立维护,WDLM-1 的 stale-PID/EPERM/TOCTOU 需两处分别修。
- **证据**:`aiworker-host.ts:616-706`(对称命令集)、`host-lifecycle.ts:3(spawn)/20(tmuxName)/23(HostLifecycleManifest)/132(AIWORKER_HOST_MANIFEST)`。
- **建议**:两选一。**优先 (a)**:若 Phase 2 daemon 短期不开工,把 host-lifecycle 对称生命周期收缩到最小(只保 serve + daemon foreground,删 start/status/stop/restart/clean/logs 这些 v1 用不到的壳),等真开工再补 —— 未发布 v1 不需要生产级 Host 守护生命周期。(b) 若保留:把 worker 与 host 守护生命周期(PID-identity 校验、tmux/manifest、spawn target 解析)抽到中立共享包(如 packages/daemon-lifecycle),让 WDLM-1/3/4(见 worker 独立 spec)的修复只做一次。
- **状态**:⬜ 待办(与 SL-1 同根 = Phase 2 过度建造的具体维护税)。

### SL-4 · 自研反向隧道(provision token + 文本缓冲帧协议 + 共享 Caddy)重造 cloudflared/frp/tailscale 已成熟的反向隧道 `[medium][reinvented-wheel][⬜ 待办]` `[系统级]`

- **现状/问题**:自研完整反向隧道(provision-client.ts 412 LOC 指数退避+equal-jitter+missed-pong+reprovision-hint、worker-control-protocol 479 LOC 帧、host-control per-assignment access-token+email-match+header-denylist、共享 Caddy auto_https off + CF 终结 TLS、自研 aissh 投递 provision command);成熟方案(cloudflared/frp/tailscale)提供同样反向隧道+自动 TLS+重连+心跳且久经考验。自研版有 WAT-1 的真实缺陷。但有真实约束:per-assignment access-token + email-match + header-denylist(剥 x-aiworker-user-email/cookie/authorization)是产品本身,通用隧道在 L4/L7 终结于该授权之下、会绕过它。
- **证据**:`provision-client.ts:209-379`、`worker-control-protocol`(hello/ping/pong/request/response/close 帧)、`host-control/src/access-adapter.ts:25-44`(header denylist)、`host-server.ts:808/812`(授权 gate);WAT-1 证据见上。
- **建议**:分两层。(a) 授权层(per-assignment token + email-match + header-denylist)是产品**必须保留、不能用通用隧道替换**;(b) 但传输/帧/重连/TLS 这些 undifferentiated 苦工,应评估让成熟隧道(cloudflared/tailscale)承担,把 AIWorker 授权层做成隧道前反向代理 gate,而非自己手搓 WS 帧+重连+心跳。短期(若保留自研)至少修 WAT-1。**鉴于 Phase 2 整体过度建造(SL-1),首选是把这套隧道连同其余 Phase 2 一起冻结扩张,正式开工时优先用成熟隧道 + 薄授权 gate。**
- **状态**:⬜ 待办。

### WAT-2 · 双 24h-TTL token 模型使 access token 在长跑隧道上不可续期,「reconnect without re-provision」承诺在 24h 静默过期 `[low][known-pitfall][⬜ 待办]`

- **现状/问题**:两个独立 24h 常量 `DEFAULT_TOKEN_TTL_MS`(provision)与 `DEFAULT_ACCESS_TOKEN_TTL_MS`(access);`verifyAssignmentAccessToken` 过期硬拒无 sliding-window;`issueAssignmentAccessToken` 只在初次 check-in 可达(需 consumed single-use provision token);reconnect 循环复用同一 closure-captured token,仅每阈值次 warn —— 24h 后时延便利悬崖(非 per-use break,有运营者恢复路径)。
- **证据**:`storage-sqlite/src/host/index.ts:16-17`(两常量)、`:370-392`(只初次 check-in 可达)、`:410`(过期硬拒)、`provision-client.ts:335`(hello 发 token)、`:234-256`(reconnect 复用)、`:243-245`(只 warn);`runtime.md:329-330`(隧道是 distribution-plane、standalone 不受影响)。
- **建议**:维持 low,作已记录的 Layer-2 项跟踪。实现时优先 (a) refresh handshake(持有效 access token 的 Worker 在过期前 mint 后继)或 (b) 更长/rolling access-token TTL 与 provision-token TTL 解耦 —— **不要**延长 single-use provision-token TTL 来掩盖。修正跟踪笔记引用两个独立常量(DEFAULT_TOKEN_TTL_MS for provision、DEFAULT_ACCESS_TOKEN_TTL_MS for access)。
- **状态**:⬜ 待办(已记于项目记忆 tunnel-restart-resilience 作 deferred Layer-2;Phase 2.1 已在生产故悬崖可达)。

## 附录:已驳回(本线相关)

本线无被 verify 驳回的 finding。
