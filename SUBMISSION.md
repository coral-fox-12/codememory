# Submission draft — ContextCon: Remember Everything

**Project:** CodeMemory — the coding assistant that remembers the codebase
**Team:** solo (Coral Fox)
**Repo:** https://github.com/coral-fox-12/codememory (public, pushed 2026-11-17 — 22 files on `main`, blob SHAs verified)
**Demo:** https://codememory-contextcon.surge.sh (live, no sign-in; self-contained static demo of the full memory loop — recall / ingest / add + hygiene gate / promote / trace / Meko-mirror evidence)
**Video:** optional, ~2 min (see DEMO_SCRIPT.md)

## What it is

Every coding session starts from zero: the agent re-learns your conventions, re-discovers your gotchas, re-asks decisions you already made. CodeMemory gives the agent a durable memory for the codebase, stored in a Meko datapack so every agent — Claude Code, Cursor, Codex, or a custom harness — shares the same context.

## How it works

1. **Ingest** — scan the repo; extract decisions, conventions, gotchas, TODOs and exported symbols, each with file + line provenance.
2. **Remember** — memories are private by default; promoting one makes it shared team knowledge (one-way). Outdated memories are superseded with an audit trail, never silently deleted.
3. **Recall** — ask a question, get ranked memories with scores and sources. No match means an explicit "nothing stored" — never an invented answer.
4. **Hygiene** — credential-like text is refused at the write boundary, so secrets never land in shared memory.

## Why Meko

Meko is the point: one datapack replaces the database + vector store + RAG pipeline + memory layer a team would otherwise stitch together, and `context_search` lets any agent read what another agent learned. The local JSON store in this repo implements Meko's exact memory model (add / search / promote / supersede) so the app runs offline; `src/meko-adapter.js` maps the same calls onto Meko's MCP endpoint for the real deployment. With `MEKO_API_KEY` + `MEKO_DATAPACK_ID` set, the server mirrors every local write to Meko automatically (verified live 2026-11-17: write → `mirrored: 1` → recallable via `context_search`).

## Run it

```bash
npm test     # 18/18 pass, zero dependencies (incl. Meko mirror tests)
npm run demo # ingest DEMO repo, run recall queries
npm start    # http://localhost:8080
```

Submission format per the official FAQ: tar/zip uploaded on HackerEarth with run instructions + source code; prototype is acceptable as long as it is functional.
