import test from 'node:test';
import assert from 'node:assert/strict';
import { MekoClient, extractJsonRpc, parseToolTextId, MEKO_MCP_URL } from '../src/meko-adapter.js';

function stubTransport(calls, responseBody) {
  return async (url, init) => {
    calls.push({ url, init: { ...init, body: JSON.parse(init.body) } });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => responseBody,
    };
  };
}

// The stub answers conversation_create with a real id payload, everything
// else with a generic ok result — mirroring the live server's shapes.
function liveLikeStub(calls) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init: { ...init, body } });
    const name = body.params?.name;
    const result = name === 'conversation_create'
      ? { content: [{ type: 'text', text: JSON.stringify({ id: 'conv_1', agent_id: 'codememory' }) }], isError: false }
      : { content: [{ type: 'text', text: 'ok' }], isError: false };
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
    };
  };
}

const okResult = (id) => JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'ok' }] } });

test('meko adapter: memory_add creates a conversation first, then sends memory_add with conversation_id and no memory_type', async () => {
  const calls = [];
  const client = new MekoClient({
    apiKey: 'test-key',
    datapackId: 'dp_123',
    agentId: 'codememory',
    transport: liveLikeStub(calls),
  });
  await client.memoryAdd('Auth uses JWT', { type: 'decision' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body.params.name, 'conversation_create');
  assert.equal(calls[1].url, MEKO_MCP_URL);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer test-key');
  assert.equal(calls[1].init.body.method, 'tools/call');
  assert.equal(calls[1].init.body.params.name, 'memory_add');
  assert.equal(calls[1].init.body.params.arguments.datapack_id, 'dp_123');
  assert.equal(calls[1].init.body.params.arguments.agent_id, 'codememory');
  assert.equal(calls[1].init.body.params.arguments.text, 'Auth uses JWT');
  assert.equal(calls[1].init.body.params.arguments.conversation_id, 'conv_1');
  assert.ok(!('memory_type' in calls[1].init.body.params.arguments), 'server rejects memory_type');
  // Second write reuses the cached conversation (no new conversation_create).
  await client.memoryAdd('Second memory');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].init.body.params.name, 'memory_add');
  assert.equal(calls[2].init.body.params.arguments.conversation_id, 'conv_1');
});

test('meko adapter: context_search / memory_search / memory_promote call the right tools with memory_ids array', async () => {
  const calls = [];
  const client = new MekoClient({
    apiKey: 'k', datapackId: 'dp',
    transport: liveLikeStub(calls),
  });
  await client.contextSearch('auth');
  await client.memorySearch('auth');
  await client.memoryPromote('mem_1');
  assert.deepEqual(
    calls.map((c) => c.init.body.params.name),
    ['conversation_create', 'context_search', 'memory_search', 'memory_promote'],
  );
  const promoteArgs = calls[3].init.body.params.arguments;
  assert.deepEqual(promoteArgs.memory_ids, ['mem_1']);
  assert.ok(!('memory_id' in promoteArgs), 'server takes memory_ids, not memory_id');
  assert.equal(promoteArgs.conversation_id, 'conv_1');
});

test('meko adapter: HTTP errors, MCP errors and isError results surface clearly', async () => {
  const failing = new MekoClient({
    apiKey: 'k', datapackId: 'dp',
    transport: async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => 'unauthorized' }),
  });
  await assert.rejects(() => failing.memoryAdd('x'), /HTTP 401/);
  const mcpErr = new MekoClient({
    apiKey: 'k', datapackId: 'dp',
    transport: stubTransport([], JSON.stringify({ jsonrpc: '2.0', id: '1', error: { message: 'datapack not found' } })),
  });
  await assert.rejects(() => mcpErr.memoryAdd('x'), /datapack not found/);
  // Live-server style: HTTP 200 with isError true must also throw.
  const isErr = new MekoClient({
    apiKey: 'k', datapackId: 'dp',
    transport: stubTransport([], JSON.stringify({ jsonrpc: '2.0', id: '1', result: { content: [{ type: 'text', text: '1 validation error for call[memory_add]' }], isError: true } })),
  });
  await assert.rejects(() => isErr.memoryAdd('x'), /validation error/);
});

test('meko adapter: missing config throws a clear error', () => {
  assert.throws(() => new MekoClient({ apiKey: '', datapackId: 'dp' }), /MEKO_API_KEY/);
  assert.throws(() => new MekoClient({ apiKey: 'k', datapackId: '' }), /MEKO_DATAPACK_ID/);
});

test('parseToolTextId: reads the id from content text or structuredContent', () => {
  assert.equal(parseToolTextId({ content: [{ text: JSON.stringify({ id: 'abc' }) }] }), 'abc');
  assert.equal(parseToolTextId({ structuredContent: { result: JSON.stringify({ id: 'def' }) } }), 'def');
  assert.equal(parseToolTextId({ content: [{ text: 'not json' }] }), null);
  assert.equal(parseToolTextId({}), null);
});

test('extractJsonRpc: plain JSON and SSE frames', () => {
  assert.deepEqual(extractJsonRpc('{"jsonrpc":"2.0","id":"1","result":{"a":1}}'), { jsonrpc: '2.0', id: '1', result: { a: 1 } });
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":"2","result":{"b":2}}\n\n';
  assert.equal(extractJsonRpc(sse).result.b, 2);
  assert.throws(() => extractJsonRpc('garbage'), /no JSON-RPC result/);
});
