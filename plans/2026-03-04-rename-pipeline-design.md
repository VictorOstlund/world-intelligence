# Design: Rename "Pipeline" to "Run Report"

**Date:** 2026-03-04
**Status:** Approved

---

## Purpose

"Pipeline" is corporate jargon. Replace all user-facing instances with "Run Report" (action) and "report" (output). Internal code names (lib/pipeline.ts, API routes, variable names) stay as-is — this is a UI/UX rename only.

---

## Requirements (IMMUTABLE)

- R1: All user-visible text containing "pipeline" is replaced — buttons, labels, headings, notifications, settings sections, empty states
- R2: The action button reads "Run Report" (not "Run Pipeline")
- R3: Settings sections previously titled "Pipeline" or similar → "Report Schedule" or "Schedule"
- R4: Any toast/notification text saying "pipeline" → "report run" or "report"
- R5: Internal code (lib/pipeline.ts, /api/pipeline/run URL, variable names, test descriptions) is NOT renamed — only user-facing strings
- R6: The report heading "# World Intelligence Report" stays as-is (already correct)
- R7: No functional changes — purely cosmetic text replacement

---

## Success Criteria (MUST ALL BE TRUE)

- [ ] Zero occurrences of "pipeline" (case-insensitive) visible in the UI
- [ ] "Run Report" button present on reports list page
- [ ] Settings schedule section clearly labelled without "pipeline"
- [ ] npm run build clean
- [ ] All tests pass (update any test assertions that check for "pipeline" UI text)

---

## Anti-Patterns (FORBIDDEN)

- **No renaming of lib/pipeline.ts, /api/pipeline/run, or any internal variable** — breakage risk, no user value
- **No functional changes** of any kind

---

## Approach

Grep all TSX/TS files for user-facing "pipeline" strings and replace:
- "Run Pipeline" → "Run Report"
- "pipeline" in UI labels/headings → context-appropriate replacement
- Settings "Pipeline" section header → "Schedule"
- Notification/toast text → updated

---

## Architecture

Files likely affected: app/reports/page.tsx, app/settings/page.tsx, app/layout.tsx, possibly NavBar.tsx
