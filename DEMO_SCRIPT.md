# Demo video script (~2:00, optional for submission)

The video is optional for ContextCon, but recommended. Record after the Meko live verification so the real datapack appears on screen.

**0:00–0:15 — The problem.** "Every coding session starts from zero. The agent re-learns your conventions, re-discovers your gotchas, re-asks decisions you already made."
**0:15–0:45 — Ingest.** Run `npm run demo`: the DEMO shop repo is scanned, 12 memories extracted — the JWT decision, the integer-cents rule, the paid-order immutability rule — each with file and line.
**0:45–1:15 — Recall.** Ask "how do we handle auth?" — the JWT decision comes back first with a score and its source. Then ask about Kubernetes deploys: the honest "nothing stored" answer, no invention.
**1:15–1:40 — Share.** Promote the JWT decision to shared knowledge; show it appearing in a second client (Meko portal / another agent) via `context_search`. Mention the hygiene gate: try to store an API key, watch it get refused.
**1:40–2:00 — Close.** "One datapack, every agent, every session. CodeMemory — the agent that remembers the codebase."

Record with the terminal + browser UI; no facecam needed (submission does not require a presenter).
