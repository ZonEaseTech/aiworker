/**
 * Codex app-server speaks JSON-RPC 2.0 over ndjson on stdio — structurally
 * identical to ACP. Re-export the ACP peer + splitter so the codex engine
 * doesn't grow a parallel implementation.
 */
export {
  JsonRpcPeer,
  splitNdjson,
} from '../acp/protocol'
export type { JsonRpcPeerOptions } from '../acp/protocol'
