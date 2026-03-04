# Design: Polish v2 — Report Quality, UI Overhaul, UX Fixes

**Date:** 2026-03-04
**Status:** Draft — awaiting approval

---

## Purpose

Nine issues raised after first real use of the deployed app. Mix of pipeline bugs, UX, and UI polish.

---

## Issues & Requirements (IMMUTABLE)

### R1 — Report body generated multiple times within one report
The synthesis model outputs the full report 2-3× in a single response (e.g. "Geopolitical Escalation & Economic Fallout" headline appears 3 times because the full report is repeated). Root cause: synthesis prompt or model output contains multiple complete report blocks. Fix: (a) add explicit synthesis prompt instruction "Write the report exactly once. Do not repeat, summarise, or re-state content after the final section." (b) add a post-processing step in `synthesizeReport` that detects and strips repeated content — if the response contains the same `# World Intelligence Report` heading more than once, truncate after the first complete report (end of `## 6. Coverage Gaps` section). Also add intra-run URL dedup (same article in multiple category feeds) as a secondary fix.

### R2 — Missing article links
Some items in the rendered report have no clickable link. Root cause: synthesis prompt passes items as plain text context — the model reconstructs article references from text and drops URLs it can't attribute. Fix: synthesis prompt must explicitly include the URL for every item in the input block, and instruct the model to include a `[Source](url)` citation for every referenced article.

### R3 — Cost always shows $0
Root cause: price table in `lib/llm.ts` doesn't include the new Gemini model IDs (`gemini-3.1-flash-lite-preview`, `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-3.1-pro`). `estimateCost` returns 0 when model not found. Fix: add all models from `lib/models.ts` PROVIDER_MODELS to the price table with accurate pricing.

### R4 — HY credit references in reports
Synthesis prompt explicitly says "European high-yield credit analyst" and mentions "HY credit, macro positioning, spread implications". Victor does not want domain-specific framing in the report for now — the platform should be general-purpose. Fix: remove all HY credit / spread / analyst framing from both synthesis and triage prompts. Keep the report analytical and factual but domain-neutral.

### R5 — No PDF download button
Reports should be downloadable as PDF. Fix: add a "Download PDF" button on the report viewer page. Use browser `window.print()` with a print-specific CSS stylesheet that formats the report cleanly for print/PDF (hides nav, buttons, applies proper page breaks). No server-side PDF generation needed — `Ctrl+P / Save as PDF` already works in all browsers; the button just triggers it with correct print styles.

### R6 — UI holistic overhaul
Current UI is functional but rough. Needs a proper design pass:
- Dark/light mode toggle — persisted to localStorage; default dark
- Clean, professional dark-mode-first design (dark background, off-white text, subtle borders)
- Light mode: clean off-white background (`#f8f9fc`), dark text, same accent colours
- Consistent typography: proper heading hierarchy, readable body text (prose width ~70ch)
- Reports list: card-based layout with title preview, date, category pills, cost badge, item count
- Report viewer: full-width readable layout, sticky header with back button + download button
- Settings page: grouped sections with clear labels, consistent input styling
- Navigation: minimal top bar with app name + nav links (Reports, Settings, Run Pipeline button) + theme toggle button (sun/moon icon)
- Mobile-responsive
- No placeholder/lorem text anywhere

### R7 — Delete reports
Add a delete button on each report (in the report viewer and in the reports list). Soft confirmation (browser `confirm()` dialog is sufficient). API route: `DELETE /api/reports/[id]`. Also removes the report's entries from `seen_articles` so those URLs can be re-covered if the report is deleted.

### R8 — Article publish date/time
Each article sourced in a report should show its publish date. `pubDate` already exists in `FeedItem` and flows through `ScoredItem` — it just needs to be:
1. Included in the synthesis prompt input block per item (alongside URL and title)
2. Instructed in the synthesis prompt: include publish date next to each source citation
3. The `ScoredItem.pubDate` value is already a string from RSS — format it as `DD Mon YYYY HH:MM UTC` before passing to prompt

### R9 — Consistent report formatting
Reports vary in structure between runs because the synthesis prompt doesn't enforce strict section ordering or format. Fix: synthesis prompt must use an explicit template with numbered section headings that the model must follow exactly. Add a format compliance instruction: "You MUST include all 6 sections in exactly this order. Do not add, remove, or rename sections."

---

## Success Criteria (MUST ALL BE TRUE)

- [ ] Single report contains no duplicate article URLs
- [ ] Every article referenced in a report has a clickable `[Source](url)` link
- [ ] Cost shows a non-zero value for Gemini reports (and all other providers)
- [ ] Zero references to "high-yield", "HY", "credit spreads", "spread implications" in generated reports or prompts
- [ ] "Download PDF" button on report viewer triggers browser print dialog
- [ ] Print CSS hides nav/buttons, formats report cleanly on A4
- [ ] UI uses consistent dark theme throughout all pages
- [ ] Reports list shows cards with: title, date, category pills, cost badge, item count
- [ ] Delete button present on report viewer and list; confirmation dialog shown; report removed from DB
- [ ] Each article citation in report shows publish date
- [ ] Two consecutive reports on same feeds have identical section structure (same 6 headings, same order)
- [ ] All existing tests pass; new tests cover: intra-run dedup, delete API, cost calculation for new models
- [ ] `npm run build` clean, deploy to Vercel succeeds

---

## Anti-Patterns (FORBIDDEN)

- **No server-side PDF generation** (no puppeteer, no headless chrome) — print CSS only
- **No domain-specific framing** in prompts (no HY, credit, spreads, analyst persona)
- **No soft-deletes** — DELETE removes the row from the DB entirely
- **No changing the Report DB schema** — reports table stays as-is; delete is a simple `DELETE WHERE id = ?`
- **No external CSS frameworks added** — use Tailwind only (already installed)
- **No intra-run dedup side effects** — the dedup within a run must not affect `seen_articles` (only cross-run dedup writes to that table)
- **No model list duplication** — price table entries must reference the same model ID strings as `lib/models.ts`

---

## Approach

### R1 — Prevent report repetition + intra-run dedup
Two fixes:

**1. Prompt fix** — add to synthesis prompt end: `"Write the complete report exactly once. After ## 6. Coverage Gaps, stop. Do not repeat, summarise, or re-output any part of the report."`

**2. Post-processing truncation** — in `synthesizeReport`, after getting `result.text`:
```typescript
function truncateToFirstReport(text: string): string {
  // Find second occurrence of the report heading
  const heading = '# World Intelligence Report'
  const first = text.indexOf(heading)
  if (first === -1) return text
  const second = text.indexOf(heading, first + heading.length)
  if (second === -1) return text
  return text.slice(0, second).trim()
}
```

**3. Intra-run URL dedup** — after `categoryResults.flat()`:
```typescript
const seenUrls = new Set<string>()
const uniqueItems = allScoredItems.filter(item => {
  if (!item.url || seenUrls.has(item.url)) return false
  seenUrls.add(item.url)
  return true
})
```
Then pass `uniqueItems` to `filterSeenUrls` (cross-run dedup) as before.

### R2 — Source links
Synthesis prompt item block format:
```
### {title} [{category}]
URL: {url}
Published: {pubDate formatted}
Importance: {score}/10
{contrarian flag if applicable}
{description or fullText}
```
Prompt instruction: "For every article you reference or quote from, include a citation as `[Source]({url})` immediately after the reference. Never omit a URL."

### R3 — Cost calculation
Add to price table in `lib/llm.ts`:
```typescript
'gemini-3.1-flash-lite-preview': { input: 0.01, output: 0.04 },
'gemini-2.5-flash-lite':         { input: 0.02, output: 0.08 },
'gemini-2.5-flash':              { input: 0.075, output: 0.30 },
'gemini-3.1-pro':                { input: 1.25, output: 5.00 },
'gemini-3.1-flash-lite':         { input: 0.01, output: 0.04 }, // stable alias
```
Also add Claude haiku-3-5 entry (currently missing):
```typescript
'claude-haiku-3-5': { input: 0.25, output: 1.25 },
```

### R4 — Remove HY framing
Remove from synthesis prompt: "European high-yield credit analyst", "HY credit", "macro positioning", "spread implications", "credit market implications".
Replace analyst persona with: "You are a world intelligence analyst. Write a factual, analytical report."
Remove from triage prompt any domain-specific language.

### R5 — PDF download
Add `<button onClick={() => window.print()}>Download PDF</button>` to report viewer.
Add `@media print` CSS in globals.css:
- Hide: nav, back button, download button, sidebar
- Show: full report body at 100% width
- Font: serif for print readability
- Page breaks: `break-before: avoid` on h3/h4, `break-after: avoid` on headings

### R6 — UI overhaul
Full redesign of all pages using Tailwind. Key design tokens:
- Background: `#0f1117` (near-black)
- Surface: `#1a1d27` (dark card)
- Border: `#2d3148`
- Text primary: `#e8eaf6`
- Text secondary: `#8892b0`
- Accent: `#4f8ef7` (blue)
- Success/cost badge: `#22c55e` green
- Danger: `#ef4444` red

Pages:
- `/reports` — grid of cards, each showing title (truncated), date, category pills (max 3 + "+N more"), cost, item count, delete button
- `/reports/[id]` — sticky top bar (back + title + download), full-width prose body (max-w-3xl centered), metadata bar (date, cost, model used, item count)
- `/settings` — 4 collapsible sections: Provider, Models, Schedule, Categories
- `/login` — centered card, clean

### R7 — Delete reports
- `DELETE /api/reports/[id]` route: deletes from `reports` table + deletes matching `seen_articles` rows for that report_id
- Report list: trash icon button per card (red on hover), confirm dialog
- Report viewer: "Delete Report" button in sticky header (red), confirm dialog, redirect to `/reports` on success

### R8 — Article dates
`pubDate` already in `ScoredItem`. Format helper:
```typescript
function formatPubDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw || 'Unknown date'
  return d.toUTCString().replace(' GMT', ' UTC')
}
```
Include in synthesis prompt item block.

### R9 — Consistent format
Synthesis prompt must use explicit numbered template:
```
Your response MUST follow this exact structure with these exact headings in this order:

# World Intelligence Report — {DATE}
**Categories covered:** {LIST} | **Articles reviewed:** {N} | **Estimated cost:** ${X}

## 1. Executive Summary
[3-5 sentences]

## 2. Key Themes & Patterns
[Cross-category threads]

## 3. Critical Events
[HIGH/MEDIUM priority items with citations]

## 4. Opportunities
[Forward-looking observations]

## 5. Contrarian Angles
[Items flagged contrarian_signal, underweighted stories]

## 6. Coverage Gaps
[Topics with notable absence of coverage]

Do not add, remove, or rename any section. Do not change the numbering.
```

---

## Architecture

### Files changed
| File | Change |
|------|--------|
| `lib/pipeline.ts` | Intra-run dedup; updated prompts (R1, R2, R4, R8, R9) |
| `lib/llm.ts` | Add new Gemini + Haiku model prices (R3) |
| `app/api/reports/[id]/route.ts` | Add DELETE handler (R7) |
| `app/reports/page.tsx` | Card grid layout, delete button (R6, R7) |
| `app/reports/[id]/page.tsx` | Full redesign, PDF button, delete button (R5, R6, R7) |
| `app/settings/page.tsx` | Grouped sections redesign (R6) |
| `app/login/page.tsx` | Clean card redesign (R6) |
| `app/globals.css` | Print CSS, design tokens (R5, R6) |
| `app/layout.tsx` | Top nav redesign (R6) |

---

## Design Rationale

**Print CSS over server PDF:** Zero dependencies, works in every browser, Victor can use "Save as PDF" natively. Server-side PDF (puppeteer) would add 80MB to the Docker image and complexity for no benefit.

**Intra-run dedup separate from cross-run dedup:** Cross-run dedup touches `seen_articles` and is intentionally persistent. Intra-run dedup is a pure in-memory Set — no DB writes, no side effects, happens before `filterSeenUrls`.

**Numbered section headings:** LLMs follow numbered lists more reliably than named headings alone. Adding "Do not add, remove, or rename" is the single most effective instruction for format consistency.

**Delete also cleans seen_articles:** If a report is deleted, its URLs should be eligible for re-coverage. Keeping them in `seen_articles` would silently block future reports from covering those stories — wrong behaviour.
