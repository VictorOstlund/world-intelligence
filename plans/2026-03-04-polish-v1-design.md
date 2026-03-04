# Design: Polish v1 — Report Quality, UI Fixes, Deduplication

**Date:** 2026-03-04
**Status:** Draft — awaiting approval

---

## Purpose

Five targeted improvements to the live app at world-intelligence.vercel.app:

1. **API key display** — settings page always shows "not configured" even after saving a key
2. **Markdown rendering** — report body displays as raw markdown text, not rendered HTML
3. **Report depth** — synthesis prompt missing the high-value sections (Contrarian Angles, Coverage Gaps, Opportunities/HY credit angles) that were in the original spec
4. **Model selection UX** — free-text model fields replaced with dropdowns of real, current models per provider
5. **Deduplication** — no mechanism to avoid re-reporting the same article across consecutive runs

---

## Requirements (IMMUTABLE)

**R1 — API key display**
- Settings GET response returns `apiKey: '*****'` for saved keys — the UI must treat this as "configured" and display a masked indicator, not an empty field
- If the user types a new value in the API key field, that new value is saved; if they leave the masked value, the existing key is preserved (not overwritten with `'*****'`)
- Applies to all provider apiKey fields

**R2 — Markdown rendering**
- Report body (`body` field) is stored as markdown; the report viewer page must render it as HTML using a markdown parser
- Code blocks, headers, bullet lists, bold/italic, tables — all rendered properly
- No raw `#` or `**` visible to the user

**R3 — Report sections (synthesis prompt)**
- Synthesis prompt must instruct the model to produce ALL sections from the original spec:
  - `## Executive Summary` (3-5 sentences across all categories)
  - `## Key Themes & Patterns` (cross-category synthesis, not just per-category recap)
  - `## Critical Events` (priority-flagged: HIGH / MEDIUM)
  - `## Opportunities` (market angles — HY credit, macro positioning, spread implications)
  - `## Contrarian Angles` (what major outlets are underweighting or missing entirely)
  - `## Coverage Gaps` (topics that should have news but don't — notable silences)
- The report header must include: timestamp, categories covered, sources count, items reviewed, estimated cost
- Triage prompt must explicitly instruct the model to flag items for Contrarian/Coverage Gap potential

**R4 — Model dropdowns**
- Replace free-text model inputs with `<select>` dropdowns
- Dropdowns are per-provider (options change when active provider changes)
- Must include current models (as of early 2026) for each provider:
  - **Anthropic**: claude-haiku-3-5, claude-sonnet-4-6, claude-opus-4-6
  - **OpenAI**: gpt-4o-mini, gpt-4o, o3-mini, o3
  - **Azure**: same as OpenAI (deployment name field stays free-text)
  - **Gemini**: gemini-3.1-flash-lite-preview, gemini-2.5-flash, gemini-3.1-pro
- Triage model and synthesis model each have their own dropdown (filtered to active provider)
- Fallback models also use dropdowns
- If a saved model value isn't in the dropdown list, it appears as a disabled "custom: [value]" option so existing config isn't silently broken

**R5 — Deduplication**
- A `seen_articles` table (url TEXT PRIMARY KEY, first_seen_at BIGINT, report_id TEXT) tracks every article URL that has been included in a report
- Before synthesis, already-seen URLs are filtered from the scored items
- Items whose URL is already in `seen_articles` are excluded unless their importance score is ≥9 (breaking developments on ongoing stories are allowed through)
- After a report is saved, all included article URLs are written to `seen_articles`
- No UI needed — this runs transparently in the pipeline
- `seen_articles` is NOT purged automatically — keeps growing forever (same philosophy as reports)
- Articles older than 30 days are exempt from dedup (stale seen_articles don't block fresh coverage)

---

## Success Criteria (MUST ALL BE TRUE)

- [ ] Save a Gemini API key → reload settings page → key field shows `•••••` (not empty)
- [ ] Change provider or leave masked value → save → existing key still works for pipeline
- [ ] Report viewer renders `## Heading`, `**bold**`, bullet lists as proper HTML
- [ ] Generated report contains all 6 sections: Executive Summary, Key Themes, Critical Events, Opportunities, Contrarian Angles, Coverage Gaps
- [ ] Model dropdowns appear for triage and synthesis fields; options match active provider
- [ ] Switching active provider updates model dropdown options
- [ ] Running pipeline twice on same feeds → second report has fewer items (dupes filtered)
- [ ] Item with importance ≥9 passes through dedup even if URL was seen before
- [ ] All existing tests pass; new tests cover dedup logic and masked key preservation
- [ ] `npm run build` clean, deploy to Vercel works

---

## Anti-Patterns (FORBIDDEN)

- **No overwriting saved API keys with `'*****'`** — the POST handler must detect and skip masked values
- **No client-side markdown parsing with dangerouslySetInnerHTML without sanitisation** — use a safe renderer (react-markdown or marked with DOMPurify)
- **No hardcoded model lists in multiple places** — single source of truth in a `lib/models.ts` constant
- **No dedup table that purges itself** — dedup is append-only; age-based exemption is a filter at query time, not a delete
- **No blocking the pipeline on dedup failures** — if `seen_articles` write fails, log and continue (report is more important than perfect dedup)
- **No changes to the Report interface or DB schema for reports** — dedup is a separate table

---

## Approach

### Fix 1 — API key display (settings API + UI)
- **API**: `GET /api/settings` returns `apiKey: '•••••configured•••••'` (sentinel value) when a key exists, empty string when not. UI checks for sentinel → shows masked indicator.
- **API**: `POST /api/settings` — for each provider apiKey field, if value matches the sentinel pattern, skip updating that field (preserve existing DB value). Only save if it's a new non-sentinel value.
- **UI**: API key input is `type="password"`. If loaded value is sentinel → placeholder "API key saved (enter new to change)" and input is empty. User must type to replace.

### Fix 2 — Markdown rendering
- Install `react-markdown` (already likely in project, check first) + `remark-gfm` for tables/strikethrough
- Report viewer page: wrap `{report.body}` in `<ReactMarkdown remarkPlugins={[remarkGfm]}>` instead of `<pre>` or plain text
- Add basic prose styling via Tailwind `prose` class (already in most Next.js projects with @tailwindcss/typography)

### Fix 3 — Synthesis prompt upgrade
- Rewrite `synthesizeReport` prompt in `lib/pipeline.ts` to explicitly request all 6 sections
- Add context about the use case: "This report is for a European high-yield credit analyst. Opportunities and Contrarian Angles sections should consider credit market implications, spread movements, and macro positioning."
- Update triage prompt to add a `contrarian_signal` boolean field to the JSON output — true if the item appears undercovered relative to its importance
- Synthesis model uses `contrarian_signal: true` items to populate the Contrarian Angles section

### Fix 4 — Model dropdowns
- Create `lib/models.ts` — exported constant `PROVIDER_MODELS` mapping provider → array of `{value, label, tier}` (tier = 'fast'|'balanced'|'powerful')
- Settings page: when `active_provider` changes, update dropdown options for triage/synthesis model fields
- Triage model defaults to a 'fast' tier model, synthesis to 'powerful' — suggested in UI but user can change
- Fallback model fields also become dropdowns (same provider options)

### Fix 5 — Deduplication
- New table: `seen_articles (url TEXT PRIMARY KEY, first_seen_at BIGINT, report_id TEXT)`
- `lib/db.ts`: add `markArticlesSeen(urls: string[], reportId: string)` and `filterSeenUrls(urls: string[], cutoffAge: number): Promise<string[]>` (returns which URLs were recently seen)
- `lib/pipeline.ts`: after triage, before synthesis:
  1. Collect all scored item URLs
  2. Query `seen_articles` for recently-seen (< 30 days) matches
  3. Filter: keep item if URL not seen OR importanceScore >= 9
  4. After report saved: call `markArticlesSeen` with all included URLs

---

## Architecture

### Files changed
| File | Change |
|------|--------|
| `app/api/settings/route.ts` | Sentinel masking on GET; skip-sentinel logic on POST |
| `app/settings/page.tsx` | Password inputs for API keys; sentinel detection |
| `app/reports/[id]/page.tsx` | ReactMarkdown renderer instead of raw text |
| `lib/pipeline.ts` | New synthesis prompt; triage prompt adds contrarian_signal; dedup filter |
| `lib/models.ts` | New file — PROVIDER_MODELS constant |
| `lib/db.ts` | seen_articles table + markArticlesSeen + filterSeenUrls |
| `app/settings/page.tsx` | Model dropdowns using PROVIDER_MODELS |
| `package.json` | Add react-markdown, remark-gfm if not present |

### Sentinel value
```
const MASKED_KEY_SENTINEL = '__masked__'
```
GET: if `apiKey` truthy in DB → return `'__masked__'`. 
POST: if received `apiKey === '__masked__'` → skip update for that field.
UI: if loaded value is `'__masked__'` → show placeholder, empty input (user types to replace).

### Dedup table
```sql
CREATE TABLE IF NOT EXISTS seen_articles (
  url TEXT PRIMARY KEY,
  first_seen_at BIGINT NOT NULL,
  report_id TEXT NOT NULL
);
```

### PROVIDER_MODELS structure
```typescript
export const PROVIDER_MODELS = {
  anthropic: [
    { value: 'claude-haiku-3-5',  label: 'Claude Haiku 3.5 (fast)',     tier: 'fast' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (balanced)', tier: 'balanced' },
    { value: 'claude-opus-4-6',   label: 'Claude Opus 4.6 (powerful)',   tier: 'powerful' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast)',     tier: 'fast' },
    { value: 'gpt-4o',      label: 'GPT-4o (balanced)',      tier: 'balanced' },
    { value: 'o3-mini',     label: 'o3-mini (reasoning)',    tier: 'balanced' },
    { value: 'o3',          label: 'o3 (powerful)',          tier: 'powerful' },
  ],
  azure: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast)',     tier: 'fast' },
    { value: 'gpt-4o',      label: 'GPT-4o (balanced)',      tier: 'balanced' },
    { value: 'o3',          label: 'o3 (powerful)',          tier: 'powerful' },
  ],
  gemini: [
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview (fast)',     tier: 'fast' },
    { value: 'gemini-2.5-flash-lite',         label: 'Gemini 2.5 Flash Lite (fast)',            tier: 'fast' },
    { value: 'gemini-2.5-flash',              label: 'Gemini 2.5 Flash (balanced)',              tier: 'balanced' },
    { value: 'gemini-3.1-pro',                label: 'Gemini 3.1 Pro (powerful)',               tier: 'powerful' },
  ],
}
```

---

## Design Rationale

**Sentinel vs. re-fetching key from DB on every request:** Sentinel is cleaner — the API never returns actual key values to the browser (security requirement R5 from original spec). The UI knows a key is configured without ever seeing it.

**react-markdown over dangerouslySetInnerHTML + marked:** react-markdown is a proper React component, safer by default, and integrates cleanly with Tailwind prose classes. No XSS risk from report body content.

**contrarian_signal in triage JSON:** The triage model is cheaper and runs per-category. Having it flag potential contrarian items at triage time means the synthesis model gets a pre-labelled signal rather than having to infer it from the full corpus — cheaper and more reliable.

**30-day dedup window:** Prevents stale `seen_articles` entries from blocking legitimate re-coverage of a story that resurfaces. A story from 31+ days ago that gets new coverage is genuinely new.

**importance ≥9 bypass:** Breaking developments (war escalation, rate decision, bankruptcy) often update the same article URL. Hard score threshold means genuinely urgent stories always get through.
