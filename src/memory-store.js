// CodeMemory — persistent memory for a coding assistant
//
// Modelled on Meko's memory model (docs.mekodata.ai):
//   memory_add / memory_search / memory_promote / context_search
//   A memory is private by default; promoting it makes it shared knowledge.
// This local store implements the same semantics so the whole app runs
// offline; src/meko-adapter.js maps the same calls onto Meko's real MCP
// endpoint when MEKO_API_KEY + MEKO_DATAPACK_ID are set.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const MEMORY_TYPES = ['fact', 'decision', 'convention', 'gotcha', 'preference', 'todo'];

/** A durable memory: one fact, one source, one provenance trail. */
export function makeMemory({ text, type = 'fact', source = null, agentId = 'codememory', confidence = 0.7 }) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('memory text is required');
  if (!MEMORY_TYPES.includes(type)) throw new Error(`unknown memory type: ${type}`);
  return {
    id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    type,
    source, // { file, line } | { origin: 'conversation' | 'ingest' | 'manual' }
    agentId,
    confidence: Math.min(1, Math.max(0, confidence)),
    scope: 'private', // 'private' | 'shared'  (promotion is one-way, like Meko)
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    supersededBy: null,
  };
}

export class MemoryStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.memories = [];
    if (filePath && existsSync(filePath)) {
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf8'));
        if (Array.isArray(data.memories)) this.memories = data.memories;
      } catch { /* corrupt file: start empty, never crash the demo */ }
    }
  }

  save() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify({ memories: this.memories }, null, 2));
  }

  /** memory_add — store one durable fact. Returns the stored memory. */
  add(input) {
    const mem = makeMemory(input);
    this.memories.push(mem);
    this.save();
    return mem;
  }

  get(id) {
    return this.memories.find((m) => m.id === id) || null;
  }

  list({ scope = null, type = null } = {}) {
    return this.memories.filter(
      (m) => (!scope || m.scope === scope) && (!type || m.type === type) && !m.supersededBy,
    );
  }

  /**
   * memory_promote — move a private memory into shared knowledge.
   * One-way: there is no un-promote (matches Meko semantics).
   */
  promote(id) {
    const mem = this.get(id);
    if (!mem) throw new Error(`no memory with id ${id}`);
    if (mem.scope === 'shared') return mem; // idempotent
    mem.scope = 'shared';
    mem.updatedAt = new Date().toISOString();
    this.save();
    return mem;
  }

  /**
   * Supersede an old memory with a new one (contradiction handling).
   * The old record is kept for audit, never deleted.
   */
  supersede(oldId, newInput) {
    const old = this.get(oldId);
    if (!old) throw new Error(`no memory with id ${oldId}`);
    const replacement = this.add(newInput);
    old.supersededBy = replacement.id;
    old.updatedAt = new Date().toISOString();
    this.save();
    return replacement;
  }

  count() {
    return this.memories.filter((m) => !m.supersededBy).length;
  }
}
