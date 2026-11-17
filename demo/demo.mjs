// Demo — ingest the DEMO fixture repo, then ask it questions.
// Run: npm run demo
import { MemoryStore } from '../src/memory-store.js';
import { ingestDirectory } from '../src/ingest.js';
import { renderBrief } from '../src/retrieve.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixture-repo');
const store = new MemoryStore(null); // in-memory only for the demo
const found = ingestDirectory(root);
console.log(`Ingested ${found.length} memories from DEMO repo ${root}:\n`);
for (const m of found) {
  const stored = store.add(m);
  console.log(`  [${stored.type}] ${stored.text}  (${stored.source.file}:${stored.source.line})`);
}
console.log('\n--- recall ---\n');
for (const q of ['how do we handle auth?', 'how are prices stored?', 'what about paid orders?']) {
  console.log(renderBrief(store, q));
  console.log();
}
console.log('--- a question with no answer ---');
console.log(renderBrief(store, 'how do we deploy to Kubernetes?'));
