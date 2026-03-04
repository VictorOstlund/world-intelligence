Read /home/node/.openclaw/workspaces/world-intelligence/plans/epic.json to get the epic ID.
Run: npx bd show <epic_id> to load the full epic.
Read the codebase.

## CRITICAL RULE — NO DELETION
NEVER remove, delete, comment out, or stub out any existing feature, function, test, wiring, or UI element.
If something is broken or not wired up: FIX the wiring. Deletion is NEVER an acceptable fix.

Use the HyperPowers review-implementation skill:
- Review every requirement with evidence from the code
- Run all automated checks (tests, linting)
- For each gap: fix it immediately — do not just report
- Fix gaps ONCE — do not loop endlessly
- Re-run tests after fixing to confirm

Write /home/node/.openclaw/workspaces/world-intelligence/plans/stage_summary.json:
{"stage": "review", "summary": "approved|gaps-fixed", "gaps_found": N, "gaps_fixed": N}
