// Meko adapter — the same memory operations, against the real Meko cloud.
//
// Meko (docs.mekodata.ai) is a remote MCP server:
//   endpoint : https://mcp.mekodata.ai/mcp
//   auth     : API key from cloud.mekodata.ai → Settings > API Keys
//   tools    : context_search, memory_add, memory_search, memory_promote,
//              conversation_create, conversation_add_message, knowledgebase_*
//   model    : a datapack holds private memories + shared knowledge;
//              promotion (memory_promote) is one-way.
//
// STATUS: VERIFIED LIVE 2026-11-17 — account coral-fox-12@proton.me,
// datapack "codememory", round-trip memory_add → context_search works.
// Schema notes from the live server (tools/list, 2026-11-17):
//   - memory_add REQUIRES conversation_id (UUID from conversation_create);
//     it does NOT accept memory_type — local type labels stay local.
//   - memory_promote takes memory_ids (array), not memory_id, plus
//     conversation_id.
//   - Tool errors come back as HTTP 200 with result.isError === true and
//     a validation message in content[0].text — callTool throws on those.

export const MEKO_MCP_URL = 'https://mcp.mekodata.ai/mcp';

export class MekoClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey - Meko API key (Settings > API Keys)
   * @param {string} opts.datapackId - datapack id the memories belong to
   * @param {string} [opts.agentId='codememory']
   * @param {string} [opts.conversationId] - reuse an existing conversation; otherwise one is created lazily
   * @param {function} [opts.transport] - (url, init) => fetch-like; injectable for tests
   */
  constructor({ apiKey, datapackId, agentId = 'codememory', conversationId = null, transport = globalThis.fetch }) {
    if (!apiKey) throw new Error('MEKO_API_KEY is required (create a free account at cloud.mekodata.ai)');
    if (!datapackId) throw new Error('MEKO_DATAPACK_ID is required (create a datapack in the Meko portal)');
    this.apiKey = apiKey;
    this.datapackId = datapackId;
    this.agentId = agentId;
    this.transport = transport;
    this.sessionId = null;
    this.initialized = false;
    this.conversationId = conversationId;
  }

  async callTool(name, args = {}) {
    const body = {
      jsonrpc: '2.0',
      id: `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      method: 'tools/call',
      params: { name, arguments: { ...args, datapack_id: this.datapackId, agent_id: this.agentId } },
    };
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    const res = await this.transport(MEKO_MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    const session = res.headers?.get?.('Mcp-Session-Id');
    if (session) this.sessionId = session;
    if (!res.ok) throw new Error(`Meko MCP call failed: HTTP ${res.status} for tool ${name}`);
    const text = await res.text();
    // Streamable HTTP may return SSE frames; take the last data: JSON-RPC payload.
    const payload = extractJsonRpc(text);
    if (payload.error) throw new Error(`Meko tool ${name} error: ${payload.error.message || JSON.stringify(payload.error)}`);
    const result = payload.result;
    if (result && result.isError) {
      const msg = result.content?.[0]?.text || 'unknown tool error';
      throw new Error(`Meko tool ${name} error: ${String(msg).slice(0, 500)}`);
    }
    return result;
  }

  /** Create one conversation for this client (lazily) and cache its id. */
  async ensureConversation() {
    if (this.conversationId) return this.conversationId;
    const result = await this.callTool('conversation_create', {});
    const id = parseToolTextId(result);
    if (!id) throw new Error('Meko conversation_create did not return an id');
    this.conversationId = id;
    return id;
  }

  /** memory_add on Meko. `type` is a local label only — the server takes no memory_type. Returns the raw MCP result. */
  async memoryAdd(text, { type = 'fact' } = {}) {
    void type;
    const conversationId = await this.ensureConversation();
    return this.callTool('memory_add', { text, conversation_id: conversationId });
  }

  /** memory_search on Meko. */
  async memorySearch(query, { limit = 5 } = {}) {
    const conversationId = await this.ensureConversation();
    return this.callTool('memory_search', { query, limit, conversation_id: conversationId });
  }

  /** context_search — recall across memory, knowledge base, conversations. */
  async contextSearch(query, { limit = 5 } = {}) {
    const conversationId = await this.ensureConversation();
    return this.callTool('context_search', { query, limit, conversation_id: conversationId });
  }

  /** memory_promote — one-way move of a memory into shared knowledge. */
  async memoryPromote(memoryId) {
    const conversationId = await this.ensureConversation();
    const ids = Array.isArray(memoryId) ? memoryId : [memoryId];
    return this.callTool('memory_promote', { memory_ids: ids, conversation_id: conversationId });
  }

  async conversationCreate() {
    return this.callTool('conversation_create', {});
  }

  async conversationAddMessage(conversationId, role, content) {
    return this.callTool('conversation_add_message', { conversation_id: conversationId, role, content });
  }
}

/** Extract the `id` from a tool result whose content text is a JSON string (e.g. conversation_create). */
export function parseToolTextId(result) {
  const candidates = [];
  if (typeof result?.structuredContent?.result === 'string') candidates.push(result.structuredContent.result);
  if (typeof result?.content?.[0]?.text === 'string') candidates.push(result.content[0].text);
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === 'string') return parsed.id;
    } catch { /* not JSON — keep looking */ }
  }
  return null;
}

/** Pull the JSON-RPC object out of a plain JSON body or an SSE stream. */
export function extractJsonRpc(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const frames = [...trimmed.matchAll(/^data:\s*(.+)$/gm)].map((m) => m[1].trim());
  for (let i = frames.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(frames[i]);
      if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) return parsed;
    } catch { /* not a result frame */ }
  }
  throw new Error('no JSON-RPC result found in Meko response');
}

/** Build a client from env. Throws a clear error when not configured. */
export function mekoFromEnv(env = process.env, transport) {
  return new MekoClient({
    apiKey: env.MEKO_API_KEY,
    datapackId: env.MEKO_DATAPACK_ID,
    agentId: env.MEKO_AGENT_ID || 'codememory',
    conversationId: env.MEKO_CONVERSATION_ID || null,
    transport,
  });
}
