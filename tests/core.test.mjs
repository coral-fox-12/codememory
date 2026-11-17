import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/memory-store.js';
import { checkMemoryText } from '../src/hygiene.js';
import { recall, renderBrief } from '../src/retrieve.js';
import { ingestDirectory } from '../src/ingest.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'fixture-repo');

test('store: add / get / list / promote (one-way)', () => {
  const s = new MemoryStore(null);
  const m = s.add({ text: 'Auth uses JWT, never sessions', type: 'decision' });
  assert.equal(m.scope, 'private');
  assert.equal(s.get(m.id).text, m.text);
  assert.equal(s.count(), 1);
  const promoted = s.promote(m.id);
  assert.equal(promoted.scope, 'shared');
  assert.equal(s.promote(m.id).scope, 'shared'); // idempotent
  assert.equal(s.list({ scope: 'shared' }).length, 1);
  assert.equal(s.list({ scope: 'private' }).length, 0);
});

test('store: supersede keeps the old record for audit', () => {
  const s = new MemoryStore(null);
  const old = s.add({ text: 'Prices in floats', type: 'fact' });
  const replacement = s.supersede(old.id, { text: 'Prices in integer cents', type: 'convention' });
  assert.equal(s.get(old.id).supersededBy, replacement.id);
  assert.equal(s.count(), 1);
  assert.equal(s.list()[0].text, 'Prices in integer cents');
});

test('store: rejects bad input', () => {
  const s = new MemoryStore(null);
  assert.throws(() => s.add({ text: '  ' }), /text is required/);
  assert.throws(() => s.add({ text: 'x', type: 'nope' }), /unknown memory type/);
  assert.throws(() => s.promote('missing'), /no memory/);
});

test('hygiene: secrets are refused, plain facts pass', () => {
  assert.equal(checkMemoryText('Auth uses JWT').ok, true);
  assert.equal(checkMemoryText('api_key = "sk_live_abcdefghijklmnop"').ok, false);
  assert.equal(checkMemoryText('Bearer abcdefghijklmnopqr').ok, false);
  assert.equal(checkMemoryText('-----BEGIN RSA PRIVATE KEY-----').ok, false);
  assert.equal(checkMemoryText('ghp_abcdefghij1234567890').ok, false);
});

test('retrieve: ranks the right memory first, says what is missing', () => {
  const s = new MemoryStore(null);
  s.add({ text: 'Auth uses JWT in the Authorization header', type: 'decision', confidence: 0.9 });
  s.add({ text: 'Prices are stored in integer cents', type: 'convention', confidence: 0.9 });
  s.add({ text: 'The office coffee machine is broken', type: 'fact', confidence: 0.9 });
  const { results, missing } = recall(s, 'how do we handle auth?');
  assert.equal(missing, null);
  assert.ok(results.length >= 1);
  assert.match(results[0].memory.text, /JWT/);
  assert.ok(results[0].score > 0);
  assert.ok(results[0].matched.length > 0);
  const none = recall(s, 'how do we deploy to Kubernetes?');
  assert.equal(none.results.length, 0);
  assert.match(none.missing, /No stored memory matches/);
  assert.match(renderBrief(s, 'how do we handle auth?'), /JWT/);
});

test('ingest: extracts decisions, conventions, gotchas and exports from the DEMO repo', () => {
  const found = ingestDirectory(FIXTURE);
  const texts = found.map((m) => m.text);
  assert.ok(texts.some((t) => /JWT/.test(t)), 'auth decision extracted');
  assert.ok(texts.some((t) => /integer cents/.test(t)), 'cents convention extracted');
  assert.ok(texts.some((t) => /paid order/i.test(t)), 'paid-order rule extracted');
  assert.ok(texts.some((t) => /exports checkout/.test(t)), 'exported symbol extracted');
  assert.ok(found.every((m) => m.source && m.source.file && m.source.line), 'every memory has provenance');
  assert.ok(found.length >= 6, `expected >=6 memories, got ${found.length}`);
});

test('ingest: unknown directory throws', () => {
  assert.throws(() => ingestDirectory('/definitely/not/a/real/dir'), /directory not found/);
});
