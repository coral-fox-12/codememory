# ContextCon: Remember Everything — PLAN

## 1. Verified facts (checked live 2026-11-17)

- **Real and open.** ContextCon: Remember Everything, hosted by **YugabyteDB**, on **HackerEarth** (NOT Devpost — the brief said Devpost; the real platform is HackerEarth).
  Official page: https://www.hackerearth.com/community/challenges/hackathon/contextcon-remember-everything/
- **Dates:** Nov 7, 2026 13:30 UTC → **Jan 17, 2027 17:30 UTC**.
  Deadline in VN time: **Monday 2027-01-18 00:30 +07** (verified with `date -d`).
- **Prize pool: $10,000** — per two independent aggregators (aihackathon.app, codingcall.com).
  ⚠️ **Prize breakdown NOT verified from the official page**: the Prizes tab loads client-side; the server-rendered HTML contains no amounts. Re-check the Prizes tab in a live browser before registering.
- **Registrations:** 320 (Nov 17, 2026 — was 319 a day earlier). Team size 1–4, solo allowed. Online.
- **Brief (official meta description):** "Meko solves the three problems that hold agentic apps back: the retrieval quality paradox…, context silos…, and infrastructure inefficiency…" — build AI agents that **keep useful context across sessions and let other agents reuse what they learn**. Suggested stack: Meko, YugabyteDB, Claude, Cursor, Codex.
- **Submission (from the official FAQ, extracted from the page payload):**
  - Develop locally, submit a **tar/zip on HackerEarth** with run instructions + source code.
  - The entire idea need not be fully implemented, but the submission **must be functional** so judges can review it. A prototype is fine.
  - A small presentation or **video demo is optional, not mandatory** — "only good to have".
  - No restriction on language, stack, or libraries.
  - **Code must be open source (public)** so judges can evaluate it. Developers keep the IP.
  - Winners may be invited to demo at a physical event (details shared later).
- **Eligibility:** FAQ: *"If you love to code, you are more than welcome to participate."* No qualifications, no country exclusion found anywhere in the fetched official content. **No Vietnam exclusion found.** ⚠️ The full rules/eligibility tab content loads client-side and could not be fetched server-side — re-verify in a live browser before registering/submitting.
- **Contact:** anushree.hn@hackerearth.com
- **Meko (the sponsor platform):** context engine for agentic apps, docs at https://docs.mekodata.ai. Remote MCP server `https://mcp.mekodata.ai/mcp`, API key from cloud.mekodata.ai → Settings > API Keys. **Free plan, no credit card.** Tools: `context_search`, `memory_add`, `memory_search`, `memory_promote`, `conversation_create`, `conversation_add_message`. A datapack holds private memories + shared knowledge; promotion is one-way.

## 2. Concept — "CodeMemory: the agent that remembers the codebase"

This competition IS about agents and persistent context, so the agent angle is the brief itself, not forced. The entry is a coding assistant whose memory lives in a Meko datapack:

- **Ingest** a repo → extract durable facts (decisions, conventions, gotchas, TODOs, exported symbols) with file+line provenance.
- **Remember** across sessions and across clients (Claude Code, Cursor, Codex) — one agent's learning is available to the next, via Meko `context_search`.
- **Recall** with scores + provenance, and say explicitly what is missing instead of inventing an answer.
- **Promote** private learnings into shared team knowledge (one-way, like Meko) and **supersede** outdated memories with an audit trail.
- **Hygiene gate:** a memory containing a credential is refused, never stored — the pattern from Yugabyte's own Jev/Meko example.

Why this wins: it demos the exact three problems Meko claims to solve (retrieval quality, context silos, stitched-together stack) on a problem every judge recognises — a coding agent that forgets the codebase every session.

## 3. Architecture

```
demo/fixture-repo/      invented DEMO repo (labelled DEMO everywhere)
src/
  memory-store.js       local JSON store implementing Meko's memory model
                        (add / search / promote one-way / supersede w/ audit)
  retrieve.js           deterministic recall: token overlap + recency +
                        confidence + type boost; explicit `missing` note
  ingest.js             repo → memories (DECISION/NEVER/RULE/FIXME/TODO/
                        exports/README purpose), with provenance
  hygiene.js            secret detector — refuses credential-like memories
  meko-adapter.js       MCP JSON-RPC client for https://mcp.mekodata.ai/mcp
                        (memory_add/search, context_search, memory_promote)
                        — STATUS: UNVERIFIED LIVE (no Meko account yet)
  server.js             zero-dep HTTP API + demo UI
public/index.html       demo UI: ask, recall, ingest DEMO repo, list memories
demo/demo.mjs           CLI demo: ingest fixture repo, run recall queries
tests/                  node:test suites (core, meko adapter w/ stubbed
                        transport, server round-trip)
```

No npm dependencies at all (the sandbox's `npm install` is broken anyway, and the judges' tar/zip submission then runs with plain `node`).

## 4. Validation status

- **Tests: 14/14 pass** (`npm test`, Node 24, no deps).
- **Demo runs:** ingests 12 memories from the DEMO fixture repo; recall ranks the right memory first for auth/prices/paid-orders; a question with no answer returns an explicit "nothing stored" note.
- **Server smoke-tested:** recall/add/promote/ingest/brief/UI endpoints verified live.
- **Meko adapter NOT verified live** — request shapes follow the public MCP docs; needs a free Meko account + API key + datapack, then `node demo/meko-smoke.mjs`.

## 5. Submission checklist

- [ ] Free Meko account (cloud.mekodata.ai, no card) + datapack + API key
- [ ] Run `node demo/meko-smoke.mjs` — verify real `memory_add` / `context_search` round-trip
- [ ] Wire the server to mirror writes to Meko when `MEKO_*` env vars are set (adapter exists; wiring is a ~30-line change in server.js)
- [ ] Record demo video (optional but recommended; ~2 min — see DEMO_SCRIPT.md)
- [ ] Push public GitHub repo under coral-fox-12 (code must be open source for judging)
- [ ] HackerEarth account + register for the challenge (parent: browser task)
- [ ] Submit tar/zip + run instructions on HackerEarth before **Mon 2027-01-18 00:30 VN**
- [ ] Re-verify in a live browser before registering: prize breakdown + full eligibility/rules tab

## 6. Risks

- **Prize breakdown unverified** ($10K total is from aggregators, not the official page). If the real split is top-heavy, the entry still competes the same way — but confirm before investing in video.
- **Eligibility tab not fetched server-side.** HackerEarth hackathons are generally global and the FAQ welcomes everyone, but a live-browser re-check is mandatory before registering.
- **Meko is new (docs show v2.1.0 breaking changes).** The adapter may need a small fix after the first live call; the local store keeps the demo working regardless.
- **320 registrations and counting** — low competition for $10K, but the field will grow over two months.
- **Winners may be asked to demo live at a physical event** — travel would be a decision for the user, not the agent.
