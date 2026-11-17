# CodeMemory — the coding assistant that remembers the codebase

Built for **ContextCon: Remember Everything** (YugabyteDB × HackerEarth, $10,000, deadline Mon 2027-01-18 00:30 VN).

A coding agent forgets everything about your codebase every time the session ends. CodeMemory fixes that: it ingests a repo into durable memories, recalls them with scores and provenance, and shares them across agents and sessions through a **Meko datapack** (YugabyteDB's context engine).

## What it does

- **Ingest** — scan a repo and extract durable facts: decisions (`DECISION:`), conventions (`NEVER`/`RULE:`), gotchas (`FIXME`/`HACK`), TODOs, exported symbols, README purpose. Every memory carries file + line provenance.
- **Recall** — deterministic ranking (token overlap + recency + confidence + type boost). If nothing matches, it says so explicitly instead of inventing an answer.
- **Promote** — private learnings become shared team knowledge (one-way, like Meko). Outdated memories are superseded, never deleted — the old record stays for audit.
- **Hygiene** — a memory containing a credential (API key, token, private key, password) is refused at the write boundary.

## Run it (no install needed — zero dependencies)

```bash
npm test          # 18 tests, all passing (incl. live-mirror tests with a stubbed Meko)
npm run demo      # ingest the DEMO fixture repo, run recall queries
npm start         # server on http://localhost:8080 (demo UI + JSON API)
```

API: `GET /api/recall?q=…` · `GET /api/brief?q=…` · `GET /api/memories` · `POST /api/memories` · `POST /api/ingest { dir }` · `GET /api/meko/status`.

## Meko (real cloud memory)

The local store is the offline-runnable core. `src/meko-adapter.js` maps the same operations onto Meko's MCP server (`https://mcp.mekodata.ai/mcp` — `memory_add`, `memory_search`, `context_search`, `memory_promote`). With `MEKO_API_KEY` + `MEKO_DATAPACK_ID` set, the server **mirrors every local write to Meko automatically** (fire-and-forget — a cloud failure never blocks the local write; `GET /api/meko/status` shows mirror state). A promote is mirrored too when the Meko memory id was captured. To verify live:

1. Create a free Meko account at https://cloud.mekodata.ai (no credit card), create a datapack, copy an API key from Settings > API Keys.
2. `MEKO_API_KEY=… MEKO_DATAPACK_ID=… node demo/meko-smoke.mjs`

Status: **verified live 2026-11-17** — free Meko account + datapack `codememory`, round-trip `memory_add` → `context_search` works, and the server mirror was verified live the same day (write → `mirrored: 1` → recallable in Meko). Notes from the live server: `memory_add` requires `conversation_id` and rejects `memory_type`; `memory_promote` takes `memory_ids` (array).

## Honesty notes

- The bundled `demo/fixture-repo` is invented data, labelled DEMO everywhere. Nothing in the demo is presented as a real project.
- Recall never invents: a question with no matching memory returns an explicit "nothing stored" note.
- See `PLAN.md` for verified competition facts, open risks, and the submission checklist.
