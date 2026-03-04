You are working on the world-intelligence epic. This is one iteration of an adaptive execute loop.
The bash runner will re-launch you with fresh context after each task.

## Setup
1. Load epic: npx bd show wi-eeg (immutable requirements, success criteria, anti-patterns)
2. Find ready task: npx bd ready
Read /home/node/.openclaw/workspaces/world-intelligence/plans/learnings.md for learnings from previous tasks.

## CRITICAL RULE — NO DELETION
NEVER remove, delete, comment out, or stub out any existing feature, function, test, wiring, or UI element.
If something is broken or not wired up: FIX the wiring. Deletion is NEVER an acceptable fix.
Violating this rule wastes tokens and breaks the product.

## If a ready task exists — Execute it:
1. Mark in progress: npx bd update <task_id> --status in_progress
2. Read task: npx bd show <task_id>
3. TDD: write failing tests → implement → pass → run full test suite → fix regressions
4. Close task: npx bd close <task_id> --reason "Implemented"

## After executing — Review and plan next:
1. Re-read epic: npx bd show wi-eeg
2. Review what you learned from this task
3. Check: are ALL epic success criteria now met?
   - **YES** → skip creating next task, go to "Write checkpoint" below
   - **NO** → create the next logical task based on what you learned:
     npx bd create "Task N: [deliverable]" --type feature --priority 1 --design "## Goal\n[based on learnings]\n## Implementation\n[TDD steps, exact files]\n## Success Criteria\n[specific outcomes]"
     npx bd dep add <new-task-id> wi-eeg --type parent-child

## Write checkpoint (REQUIRED — this is how the bash runner knows what happened):

Append learnings to /home/node/.openclaw/workspaces/world-intelligence/plans/learnings.md:
```
## Task <task_id> — <title>
- What was done: [summary]
- What was learned: [discoveries, patterns, gotchas]
- Codebase state: [what exists now that didn't before]
```

Write /home/node/.openclaw/workspaces/world-intelligence/plans/iteration-result.json:
- If next task was created: {"done": false, "completed_task": "<task_id>", "next_task": "<new_task_id>"}
- If all criteria met (no next task): {"done": true, "completed_task": "<task_id>", "summary": "All N tasks complete"}
- If NO ready task found (epic might already be done): {"done": true, "completed_task": null, "summary": "No ready tasks — epic may be complete"}

Do NOT implement more than ONE task. Do NOT skip the checkpoint file.
