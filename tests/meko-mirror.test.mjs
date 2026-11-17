import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/memory-store.js';
import { createApp } from '../src/server.js';
import { MekoClient } from '../src/meko-adapter.js';

// Stub transport shaped like the live Meko server: conversation_create
// returns a JSON id, memory_add returns a JSON id (captured as mekoId),
// everything else returns a generic ok result.
function liveLikeStub(calls) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init: { ...init, body } });
    const name = body.params?.name;
    const text = name === 'conversation_create'
      ? JSON.stringify({ id: 'conv_1', agent_id: 'codememory' })
      : name === 'memory_add'
        ? JSON.stringify({ id: 'meko_mem_1' })
        : 'ok';
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text }], isError: false } }),
    };
  };
}

async function withServer(meko, fn) {
  const store = new MemoryStore(null);
  const server = createApp(store, { meko });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, store); } finally { server.close(); }
}

async function waitFor(base, pred, label) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/meko/status`);
    const status = await res.json();
    if (pred(status)) return status;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${label}`);
}

test('meko mirror: POST /api/memories mirrors to Meko and reports status', async () => {
  const calls = [];
  const meko = new MekoClient({ apiKey: 'k', datapackId: 'dp', transport: liveLikeStub(calls) });
  await withServer(meko, async (base) => {
    let res = await fetch(`${base}/api/meko/status`);
    assert.deepEqual(await res.json(), { enabled: true, mirrored: 0, lastWrite: null, lastError: null });

    res = await fetch(`${base}/api/memories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Auth uses JWT in the Authorization header', type: 'decision' }),
    });
    assert.equal(res.status, 201);
    const mem = await res.json();

    const status = await waitFor(base, (s) => s.mirrored >= 1, 'mirror');
    assert.equal(status.lastError, null);
    assert.ok(status.lastWrite);

    const adds = calls.filter((c) => c.init.body.params.name === 'memory_add');
    assert.equal(adds.length, 1);
    assert.equal(adds[0].init.body.params.arguments.text, 'Auth uses JWT in the Authorization header');
    assert.equal(adds[0].init.body.params.arguments.conversation_id, 'conv_1');

    // The Meko id was captured onto the local memory (provenance for promote).
    res = await fetch(`${base}/api/memories`);
    const listed = (await res.json()).memories.find((m) => m.id === mem.id);
    assert.equal(listed.mekoId, 'meko_mem_1');

    // Promote mirrors memory_promote with the captured Meko id.
    res = await fetch(`${base}/api/memories/${mem.id}/promote`, { method: 'POST' });
    assert.equal(res.status, 200);
    await waitFor(base, () => calls.some((c) => c.init.body.params.name === 'memory_promote'), 'promote mirror');
    const promo = calls.find((c) => c.init.body.params.name === 'memory_promote');
    assert.deepEqual(promo.init.body.params.arguments.memory_ids, ['meko_mem_1']);
  });
});

test('meko mirror: a failing Meko never breaks the local write', async () => {
  const meko = new MekoClient({
    apiKey: 'k', datapackId: 'dp',
    transport: async () => ({ ok: false, status: 500, headers: { get: () => null }, text: async () => 'boom' }),
  });
  await withServer(meko, async (base) => {
    const res = await fetch(`${base}/api/memories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Local write must survive a dead cloud' }),
    });
    assert.equal(res.status, 201);
    const status = await waitFor(base, (s) => s.lastError !== null, 'mirror error');
    assert.equal(status.mirrored, 0);
    assert.match(status.lastError, /HTTP 500/);
    // The memory is still recallable locally.
    const recalled = await (await fetch(`${base}/api/recall?q=dead%20cloud`)).json();
    assert.equal(recalled.missing, null);
  });
});

test('meko mirror: no client configured means mirroring is off, writes still work', async () => {
  await withServer(null, async (base) => {
    const res = await fetch(`${base}/api/meko/status`);
    assert.deepEqual(await res.json(), { enabled: false, mirrored: 0, lastWrite: null, lastError: null });
    const added = await fetch(`${base}/api/memories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Offline mode still stores' }),
    });
    assert.equal(added.status, 201);
  });
});
