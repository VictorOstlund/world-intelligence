Read the design doc at /home/node/.openclaw/workspaces/world-intelligence/plans/2026-03-04-postgres-migration-design.md.

Create a bd epic and first task:

1. Run: npx bd create "Feature: world-intelligence" --type epic --priority 1 --design "..."
   The --design field must contain ALL of these sections derived from the design doc:
   ## Requirements (IMMUTABLE)
   ## Success Criteria (MUST ALL BE TRUE)
   ## Anti-Patterns (FORBIDDEN)
   ## Approach
   ## Architecture
   ## Design Rationale

2. Run: npx bd create "Task 1: [first logical deliverable]" --type feature --priority 1 --design "..."
   Task 1 --design must contain: ## Goal, ## Implementation (TDD steps, exact file paths, what to change), ## Success Criteria
   Link to epic: npx bd dep add <task1-id> <epic-id> --type parent-child

3. Save to /home/node/.openclaw/workspaces/world-intelligence/plans/epic.json:
   {"epic_id": "bd-N", "task1_id": "bd-M", "slug": "world-intelligence"}

Do not write any code yet. Do not ask questions — requirements are already approved.
