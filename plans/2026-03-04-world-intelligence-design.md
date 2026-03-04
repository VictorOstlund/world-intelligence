# World Intelligence — Design Document
*2026-03-04*

---

## Purpose

A self-contained news intelligence platform that aggregates 170+ live global feeds every N hours (configurable) using a two-tier AI pipeline — cheap triage models per category, premium synthesis model for the final report. Reports are browsable via a clean web interface, stored forever, fully portable. Runs inside OpenClaw immediately (A1) and as a standalone deployable product (A2) with no OpenClaw runtime dependency.

Built on worldmonitor.app's curated feed list (extracted from their open-source GitHub) plus GDELT and FRED APIs — no scraping worldmonitor itself, direct feed access only.

---

## Requirements (IMMUTABLE)

- R1: Reports generated on configurable schedule (default every 6 hours)
- R2: Two-tier model pipeline — triage model per category, synthesis model for final report
- R3: Each tier has its own configurable fallback chain (up to 3 models)
- R4: News categories are fully modular — toggled per-run and globally in UI
- R5: All LLM provider credentials stored server-side only, never exposed to browser
- R6: Single active provider at runtime, configurable in UI; multiple providers can be pre-configured
- R7: Supported providers:
  - **Anthropic**: API key AND OAuth — both configurable simultaneously, UI selects which takes priority
  - **OpenAI**: API key AND Codex OAuth — both configurable simultaneously, UI selects which takes priority
  - **Azure OpenAI**: API key + endpoint + deployment name
  - **Gemini**: API key
  - Sovereign's multi-auth implementation is the reference — replicate that pattern exactly
- R8: Simple auth — hashed username/password pairs, JWT sessions, self-managed user list
- R9: Reports stored forever (no auto-deletion), full-text searchable in UI
- R10: A2 path deployable anywhere with `npm start` — no OpenClaw dependency at runtime
- R11: A1 path runs inside OpenClaw via cron + sessions_spawn immediately after build
- R12: Fetch headlines + descriptions only (RSS) — full article fetch only for items above relevance threshold
- R13: Per-category item budget (configurable, default 15 items per category)
- R14: Cost per run displayed in UI after each report

---

## Success Criteria

- [ ] Report generated end-to-end with real data from ≥5 categories
- [ ] Two-tier pipeline confirmed: triage model and synthesis model are different, configurable
- [ ] Fallback chain fires correctly when primary model returns rate limit error
- [ ] Categories toggle on/off — disabled categories produce no LLM calls
- [ ] Provider credentials not visible in browser network tab or page source
- [ ] Auth blocks unauthenticated access to all routes including API
- [ ] Reports browsable, searchable, and persistent across restarts
- [ ] A2 starts cleanly with `npm start` on a fresh machine with only `.env` configured
- [ ] A1 cron fires inside OpenClaw and writes report to expected path
- [ ] Cost estimate shown per report in UI
- [ ] Fallback chain: up to 3 models per tier, auto-advances on rate limit / error
- [ ] All tests passing

---

## Anti-Patterns (FORBIDDEN)

- ❌ Scraping worldmonitor.app frontend — use direct RSS feeds and APIs from their source list
- ❌ LLM calls on raw unfiltered feed (full firehose to expensive model) — triage first, always
- ❌ API keys or session tokens returned to browser in any response
- ❌ Single model for both triage and synthesis — tiers must be independently configurable
- ❌ Auto-deleting reports — keep everything forever
- ❌ OpenClaw-specific imports in A2 standalone path
- ❌ Hardcoded feed lists — categories and feeds configurable, sourced from worldmonitor GitHub
- ❌ Blocking report generation on a single provider failure — fallback chain must fire automatically

---

## Approach

**Two parallel build paths:**

**A1 (OpenClaw-native, immediate):** OpenClaw cron fires every N hours, spawns parallel category sub-agents via `sessions_spawn`, each fetches its RSS feeds, triages with cheap model, returns scored JSON. Orchestrator receives all JSON, synthesises with premium model, writes markdown report to disk, pushes to a GitHub repo. A Vercel-deployed Next.js frontend reads reports from that GitHub repo.

**A2 (Standalone portable product):** Self-contained Node.js service with `node-cron` scheduler, same two-tier pipeline logic, Next.js frontend, SQLite report storage, full multi-provider LLM support including Azure. Deployable to any VPS, Docker, or Vercel. No OpenClaw code. A fund can run this by cloning the repo, filling in `.env`, and running `npm start`.

Both paths share the same data layer (feed list, triage/synthesis logic) and report format. A2 is the canonical product; A1 is the OpenClaw integration layer on top.

---

## Architecture

```
Data Layer
├── worldmonitor GitHub → extract curated RSS feed list (170+ sources, 15 categories)
├── GDELT API (public, no auth — conflict/geopolitical events)
├── FRED API (free key — economic indicators)
└── Direct RSS fetching (no intermediary)

Two-Tier Pipeline (per scheduled run)
├── Orchestrator
│   ├── Reads active categories from config
│   ├── Spawns one triage sub-agent per enabled category (parallel)
│   └── Collects scored JSON → runs synthesis → saves report
│
├── Triage Sub-Agent (per category)
│   ├── Fetches RSS headlines + descriptions (no full article by default)
│   ├── Scores each item: relevance / novelty / importance (0-10)
│   ├── Fetches full article text only for items scoring ≥8 importance
│   ├── Keeps top N items (configurable, default 15)
│   ├── Returns structured JSON — no prose
│   └── Model: Triage model (configurable, default Gemini Flash Lite)
│
└── Synthesis Agent
    ├── Receives pre-filtered JSON from all categories
    ├── Writes full report (see Report Format)
    ├── Tracks token usage → cost estimate
    └── Model: Synthesis model (configurable, default Sonnet/GPT-4o)

Model Fallback Chain (per tier)
└── Model 1 → on rate limit/error → Model 2 → on error → Model 3 → fail with partial report

A1 — OpenClaw Path
├── OpenClaw cron (node-cron in jobs.json) → triggers orchestrator
├── sessions_spawn for parallel category agents
├── Report saved to workspace/reports/ + pushed to GitHub
└── Vercel Next.js frontend reads reports from GitHub

A2 — Standalone Path
├── Node.js service (node-cron built-in)
├── Next.js frontend
│   ├── Report browser (list, search, filter by date/category)
│   ├── Report viewer (rendered markdown)
│   ├── Settings panel (providers, triage model, synthesis model, fallbacks, categories, schedule)
│   └── Auth (username/password, JWT, server-side only)
├── SQLite (reports, config, users — single file, portable)
├── API routes (Next.js API) — all auth-gated, keys never returned to client
└── .env: provider keys, initial admin credentials
```

---

## Report Format (every run)

```markdown
# Intelligence Report — [timestamp]
**Categories:** [list of enabled categories]
**Sources:** [N feeds] | **Items reviewed:** [N] | **Est. cost:** $0.0X

## Executive Summary
[3-5 sentences across all categories]

## Key Themes & Patterns
[Per-category findings, bullet points]

## Critical Events
[Priority-flagged items — HIGH / MEDIUM]

## Opportunities
[Market angles — relevant for HY credit, macro positioning]

## Contrarian Angles
[What major outlets aren't covering]

## Coverage Gaps
[Topics that should have news but don't]

## Source Index
[Every source cited, linked, with title and timestamp]
```

---

## Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 22 |
| Frontend | Next.js 15 (App Router) |
| Database | SQLite (better-sqlite3) |
| Scheduler | node-cron |
| Auth | bcrypt passwords, JWT (jose), httpOnly cookies |
| LLM providers | Anthropic SDK, OpenAI SDK (covers Azure + Codex), Google Generative AI SDK |
| RSS fetching | fast-xml-parser + node fetch |
| Deployment | Vercel (A1 frontend) / anywhere (A2) |
| Language | TypeScript |

---

## Data Model

```typescript
// Report
{
  id: string,           // uuid
  createdAt: number,    // unix ms
  schedule: string,     // "6h", "12h", etc.
  categories: string[], // enabled categories for this run
  summary: string,      // executive summary
  body: string,         // full markdown report
  costUsd: number,      // estimated cost
  triageModel: string,  // model used for triage
  synthesisModel: string,
  itemCount: number,    // total items reviewed
  sourceCount: number,
}

// Config (single row)
{
  activeProvider: string,
  triageModel: string,
  synthesisModel: string,
  triageFallbacks: string[],   // up to 2
  synthesisFallbacks: string[], // up to 2
  scheduleHours: number,       // default 6
  categoryConfig: Record<string, { enabled: boolean, itemBudget: number }>,
  providers: {
    anthropic: { apiKey?: string, oauthToken?: string, preferOauth: boolean },
    openai:    { apiKey?: string, oauthToken?: string, preferOauth: boolean },  // oauthToken = Codex OAuth
    azure:     { apiKey?: string, endpoint?: string, deployment?: string },
    gemini:    { apiKey?: string },
  }, // ALL stored server-side only, never returned to client
}

// User
{
  id: string,
  username: string,
  passwordHash: string,
  createdAt: number,
}
```

---

## Design Rationale

### Approaches Considered

#### Two-tier pipeline with direct RSS access ✓
- Chosen because: maximises quality (premium model on pre-filtered signal), minimises cost (cheap model for classification), no worldmonitor.app runtime dependency, feeds are stable public RSS

#### Scrape worldmonitor.app frontend ❌
- Rejected because: fragile (breaks on UI changes), potential ToS violation, adds worldmonitor uptime as a dependency, not portable to a fund environment

#### Single model end-to-end ❌
- Rejected because: 10-50x more expensive for no quality gain on triage tasks; classification (relevance scoring) does not benefit from frontier models

#### Use worldmonitor's own API endpoints ❌
- Rejected because: undocumented internal API, no stability guarantees, would require reverse-engineering their auth

---

## Build Plan (Lobster)

Project agent: new agent `world-intelligence`
GitHub repo: `VictorOstlund/world-intelligence`
Vercel: `world-intelligence.vercel.app`

Lobster stages:
1. `create-epic` — Opus reads this design → bd epic with tasks
2. `execute` — implement task by task
3. `review` — verify against success criteria
4. `finish` — push to GitHub + deploy to Vercel

A1 OpenClaw integration added as final epic task after A2 is working.

---

*Awaiting Victor's approval to proceed.*
