// CodeMemory server — zero-dependency HTTP API + demo UI.
//
//   GET  /                     demo UI
//   GET  /api/recall?q=...     ranked memories for a question (+ explicit `missing`)
//   GET  /api/memories         list stored memories
//   POST /api/memories         { text, type?, source? }  (hygiene-checked)
//   POST /api/memories/:id/promote
//   POST /api/ingest           { dir }  (scans a local directory into memories)
//   GET  /api/brief?q=...      plain-text brief for a question
//   GET  /api/meko/status      Meko mirror state (enabled / mirrored / last error)
//
// Storage: a JSON file (default ./data/memories.json). No external service
// is needed; set MEKO_API_KEY + MEKO_DATAPACK_ID to mirror writes to Meko
// (the local write always succeeds first — a cloud failure never blocks it).

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStore } from './memory-store.js';
import { recall, renderBrief } from './retrieve.js';
import { ingestDirectory } from './ingest.js';
import { checkMemoryText } from './hygiene.js';
import { mekoFromEnv, parseToolTextId } from './meko-adapter.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = process.env.CODEMEMORY_DATA || join(ROOT, 'data', 'memories.json');
const PORT = Number(process.env.PORT || 8080);

export function createApp(store, { meko = null } = {}) {
  const mirror = { enabled: !!meko, mirrored: 0, lastWrite: null, lastError: null };

  // Mirror one local memory to Meko (fire-and-forget: never blocks the API).
  // Captures the Meko memory id when the server returns one, so a later
  // local promote can be mirrored too. Any failure is logged, not thrown.
  function mirrorWrite(mem) {
    if (!meko) return;
    meko.memoryAdd(mem.text, { type: mem.type }).then((res) => {
      const mekoId = parseToolTextId(res);
      if (mekoId) { mem.mekoId = mekoId; store.save(); }
      mirror.mirrored += 1;
      mirror.lastWrite = new Date().toISOString();
      mirror.lastError = null;
    }).catch((e) => {
      mirror.lastError = String(e.message || e).slice(0, 300);
      console.error(`[meko] mirror failed (local write kept): ${mirror.lastError}`);
    });
  }

  function mirrorPromote(mem) {
    if (!meko || !mem.mekoId) return;
    meko.memoryPromote(mem.mekoId).catch((e) => {
      mirror.lastError = String(e.message || e).slice(0, 300);
      console.error(`[meko] promote mirror failed: ${mirror.lastError}`);
    });
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body, type = 'application/json') => {
      const payload = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
      res.writeHead(status, { 'Content-Type': type });
      res.end(payload);
    };
    const readBody = () =>
      new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => {
          try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
        });
      });

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        return send(200, readFileSync(join(ROOT, 'public', 'index.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && url.pathname === '/api/memories') {
        return send(200, { count: store.count(), memories: store.list() });
      }
      if (req.method === 'GET' && url.pathname === '/api/recall') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) return send(400, { error: 'query param q is required' });
        return send(200, recall(store, q, { limit: Number(url.searchParams.get('limit') || 5) }));
      }
      if (req.method === 'GET' && url.pathname === '/api/brief') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) return send(400, { error: 'query param q is required' });
        return send(200, renderBrief(store, q), 'text/plain');
      }
      if (req.method === 'GET' && url.pathname === '/api/meko/status') {
        return send(200, mirror);
      }
      if (req.method === 'POST' && url.pathname === '/api/memories') {
        const body = await readBody();
        const check = checkMemoryText(body.text || '');
        if (!check.ok) return send(400, { error: check.reason });
        const mem = store.add({ text: body.text, type: body.type || 'fact', source: body.source || { origin: 'manual' }, confidence: body.confidence ?? 0.7 });
        mirrorWrite(mem);
        return send(201, mem);
      }
      const promoteMatch = url.pathname.match(/^\/api\/memories\/([^/]+)\/promote$/);
      if (req.method === 'POST' && promoteMatch) {
        try {
          const promoted = store.promote(decodeURIComponent(promoteMatch[1]));
          mirrorPromote(promoted);
          return send(200, promoted);
        } catch (e) {
          return send(404, { error: e.message });
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/ingest') {
        const body = await readBody();
        if (!body.dir) return send(400, { error: 'dir is required' });
        const found = ingestDirectory(body.dir);
        const stored = [];
        const blocked = [];
        for (const m of found) {
          const check = checkMemoryText(m.text);
          if (!check.ok) { blocked.push({ text: m.text, reason: check.reason }); continue; }
          const mem = store.add(m);
          mirrorWrite(mem);
          stored.push(mem);
        }
        return send(200, { scanned: found.length, stored: stored.length, blocked, memories: stored });
      }
      return send(404, { error: 'not found' });
    } catch (e) {
      return send(500, { error: e.message });
    }
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const store = new MemoryStore(DATA_FILE);
  let meko = null;
  if (process.env.MEKO_API_KEY && process.env.MEKO_DATAPACK_ID) {
    try {
      meko = mekoFromEnv();
      console.log('Meko mirroring enabled (datapack ' + process.env.MEKO_DATAPACK_ID.slice(0, 8) + '…)');
    } catch (e) {
      console.error(`Meko mirroring NOT enabled: ${e.message} — running local-only`);
    }
  } else {
    console.log('Meko mirroring off (set MEKO_API_KEY + MEKO_DATAPACK_ID to enable) — running local-only');
  }
  const server = createApp(store, { meko });
  server.listen(PORT, () => {
    console.log(`CodeMemory listening on http://localhost:${PORT} — ${store.count()} memories loaded`);
  });
}
