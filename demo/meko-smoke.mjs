// Meko live smoke test — needs a free Meko account.
//   MEKO_API_KEY=<key> MEKO_DATAPACK_ID=<id> node demo/meko-smoke.mjs
// Writes one test memory, searches it back, and FAILS loudly if any call
// errors or the memory cannot be found again.
// Nothing is promoted (promotion is one-way) and nothing is deleted.
import { mekoFromEnv } from '../src/meko-adapter.js';

function assertOk(result, label) {
  if (!result || result.isError) {
    throw new Error(`${label} failed: ${JSON.stringify(result)?.slice(0, 600)}`);
  }
  return result;
}

const client = mekoFromEnv();
const stamp = new Date().toISOString();
const text = `CodeMemory smoke test ${stamp}: auth uses JWT, never sessions.`;
console.log('memory_add ...');
const added = assertOk(await client.memoryAdd(text, { type: 'decision' }), 'memory_add');
console.log(JSON.stringify(added, null, 2).slice(0, 800));
console.log('\ncontext_search "how do we handle auth?" ...');
const found = assertOk(await client.contextSearch('how do we handle auth?', { limit: 5 }), 'context_search');
console.log(JSON.stringify(found, null, 2).slice(0, 1500));
if (!JSON.stringify(found).includes('JWT')) {
  throw new Error('SMOKE FAIL — context_search did not return the memory just added');
}
console.log('\nSMOKE OK — Meko round-trip works (write + recall verified).');
