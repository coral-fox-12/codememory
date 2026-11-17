import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/memory-store.js';
import { createApp } from '../src/server.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'fixture-repo');

async function withServer(fn) {
  const store = new MemoryStore(null);
  const server = createApp(store);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, store); } finally { server.close(); }
}

test('server: recall / add / promote / ingest round-trip', async () => {
  await withServer(async (base, store) => {
    // add
    let res = await fetch(`${base}/api/memories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Auth uses JWT in the Authorization header', type: 'decision' }),
    });
    assert.equal(res.status, 201);
    const mem = await res.json();
    assert.equal(mem.type, 'decision');

    // recall finds it
    res = await fetch(`${base}/api/recall?q=how%20do%20we%20handle%20auth`);
    const recalled = await res.json();
    assert.equal(recalled.missing, null);
    assert.ok(recalled.results.some((r) => r.memory.id === mem.id));

    // secret is refused at the API boundary
    res = await fetch(`${base}/api/memories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'api_key = "sk_live_abcdefghijklmnop"' }),
    });
    assert.equal(res.status, 400);

    // promote
    res = await fetch(`${base}/api/memories/${mem.id}/promote`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).scope, 'shared');

    // ingest the DEMO repo
    res = await fetch(`${base}/api/ingest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: FIXTURE }),
    });
    const ing = await res.json();
    assert.ok(ing.stored >= 6, `expected >=6 stored, got ${ing.stored}`);
    assert.equal(ing.blocked.length, 0);

    // brief endpoint returns plain text
    res = await fetch(`${base}/api/brief?q=prices`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /cents/);

    // missing q param
    res = await fetch(`${base}/api/recall`);
    assert.equal(res.status, 400);
  });
});

test('server: serves the demo UI', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /CodeMemory/);
  });
});
