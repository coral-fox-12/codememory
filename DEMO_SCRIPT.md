# Demo video script (~2:00, optional for submission)

Record against the LIVE demo: **https://codememory-contextcon.surge.sh** (no sign-in needed; works in any browser). The video is optional for ContextCon, but recommended. No facecam needed (submission does not require a presenter) — record the browser + voiceover (or captions).

Before recording: open the demo in a fresh/private window so localStorage is empty and the take is clean (user-added memories persist in the recorder's browser only — click “Reset demo” first if you have added any).

**0:00–0:15 — The problem.** "Every coding session starts from zero. The agent re-learns your conventions, re-discovers your gotchas, re-asks decisions you already made."
**0:15–0:40 — Ingest.** Click “Reset demo” (store clears to 0), then “Ingest the DEMO repo” — 12 memories appear: the JWT decision (`shop.js:4`), the integer-cents rule (`README.md:10`), the paid-order rule (`README.md:7` + `shop.js:9`), the tax gotcha, the exports. Each carries file + line provenance.
**0:40–1:05 — Recall.** Ask "how do we handle auth?" — the JWT decision comes back first, score 0.594, matched token “auth”, source `shop.js:4`. Then ask "how do we deploy to Kubernetes?" — the honest “nothing stored” box, no invention.
**1:05–1:30 — Add + hygiene + promote.** Type a new decision (“DECISION: We retry the payment gateway once on a 5xx before failing the order.”) and store it — it appears as a private memory. Then click “Try storing a secret instead” — the write is refused on screen (`generic-api-key`), nothing stored. Promote the JWT decision — it flips to “Shared ✓” (one-way, like Meko).
**1:30–1:50 — Trace + Meko.** Click “Trace this memory” on the JWT decision — everything the project remembers about `shop.js` (refund convention, tax gotcha, exports) in one view: test → symbol → file → decisions. Scroll to section 5, the Meko mirror panel: datapack `codememory`, live round-trip verified 2026-11-17 (`memory_add` id `58c18de3…`, `context_search` score 0.395, server mirror `mirrored: 1`).
**1:50–2:00 — Close.** "One datapack, every agent, every session. CodeMemory — the agent that remembers the codebase."

Notes for the recorder:
- The static demo runs the same memory model as the Node server (same ranking, same hygiene rules, same promote semantics — scores reproduce the server exactly). The live Meko mirror itself runs on the server (`npm start` with `MEKO_API_KEY` + `MEKO_DATAPACK_ID`); the page shows the verified-live evidence rather than calling Meko from the browser, so no API key is ever exposed.
- If a step ever looks off, the terminal fallback is `npm run demo` (ingest + recall in the terminal) — same 12 memories, same scores.
