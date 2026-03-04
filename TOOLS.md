# TOOLS.md — Agent Reference

---

## ⚠️ MANDATORY RULE: ALL CODING GOES THROUGH A CLI

**You must NEVER write, edit, or generate code yourself as a direct LLM response.**

Every coding task — bug fix, feature, refactor, test, script — MUST be executed via one of two CLIs:

1. **Claude Code CLI** — primary tool for all implementation work
2. **Codex CLI** — primary use is audits/reviews; also used for implementation when Victor directs

**Do not write code in your own responses.** Your job is to orchestrate the CLI, not to be the CLI.

---

## 🔴 TOOL SELECTION — READ THIS FIRST

Before reaching for any implementation tool, answer one question:

**Does this project have a `project.json`, a GitHub repo, and a Vercel deployment created by the Lobster pipeline?**

- **YES** → `run-lobster.sh` is valid (but Victor will tell you explicitly)
- **NO** → Use Mode 1, 2, or 3 below. Full stop.

`run-lobster.sh` is ONLY for brand-new projects bootstrapped by Victor through the full project creation flow. It is NOT a general "start implementing" tool. You will almost never invoke it yourself.

**If Victor asks you to implement something on an existing project — bugs, features, refactors, improvements — that is always Mode 1, 2, or 3. Never run-lobster.sh.**

---

---

## What "Claude Code CLI" Means

**Claude Code CLI** = the `claude` binary at `/home/node/.local/bin/claude`

It is a full autonomous coding agent that reads/writes files, runs shell commands and tests, fixes bugs it introduces, and iterates until the task is done. It is NOT an API call to Claude, not a model you're chatting with, not something that just gives advice.

**Invocation (both flags required — always):**
```bash
# Sonnet (default):
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "your task here"

# Opus (for complex work):
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --model claude-opus-4-6 \
  --print "your task here"
```

- `--dangerously-skip-permissions` — disables interactive approval prompts (required for automation; without it Claude Code blocks waiting for user confirmation)
- `--print` — one-shot non-interactive mode; without it Claude Code opens a REPL and blocks forever
- `CLAUDE_CONFIG_DIR` — points to the OAuth session (Max subscription, already authenticated, persists on Docker volume)

**Auth:** If it 401s, alert Victor. Do not attempt to re-auth yourself.

---

## What "Codex CLI" Means

**Codex CLI** = the `codex` binary at `/home/node/.openclaw/tools/node_modules/.bin/codex`

OpenAI's agent CLI. Primary use is cold-read audits and security reviews. Also used for full implementation when Victor directs (e.g. due to token allocation) — no HyperPowers skills needed for Codex implementation, just give it the task directly.

**Invocation (always use `-m gpt-5.3-codex`):**
```bash
/home/node/.openclaw/tools/node_modules/.bin/codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.3-codex \
  "your task here"
```

**Auth:** OAuth token already stored. If 401: run `codex login --device-auth` (gives a code + URL — do NOT use bare `codex login`, it redirects to localhost and hangs).

---

## Implementation Playbook

### Mode 1: Direct (bug fixes, small well-understood tasks)

Inline prompt straight to the CLI. No design doc needed for small, clear tasks.

```bash
cd /home/node/.openclaw/workspaces/{your-slug}/projects

# Claude Code CLI (Sonnet):
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "your task description here"

# Claude Code CLI (Opus for complex work):
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --model claude-opus-4-6 \
  --print "your task description here"

# Codex CLI (when Victor directs):
/home/node/.openclaw/tools/node_modules/.bin/codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.3-codex \
  "your task description here"
```

---

### Mode 2: Brainstorm → Design → Epic → Execute adaptively (standard for complex work)

Use this for any non-trivial task. Claude Code learns as it goes — implements one task, reviews learnings, creates the next task based on reality, then exits. Bash re-launches with fresh context for the next iteration.

**▶ After design.md is approved, invoke the pipeline script:**
```bash
bash /home/node/.openclaw/workspace/scripts/run-auto-dev.sh \
  --slug {slug} \
  --design /home/node/.openclaw/workspaces/{slug}/plans/{design-file}.md \
  --workspace /home/node/.openclaw/workspaces/{slug} \
  --thread-id {discord-thread-id} \
  [--model opus] \
  [--resume]
```
This runs: create-epic (epic + Task 1) → adaptive execute loop (implement → learn → create next → re-launch) → review.
The manual steps below explain what each stage does.

#### Step 1 — Get the spec

The `--design` flag accepts any document that describes what to build or fix. Three valid sources:

- **Brainstorm** (new features / greenfield): Run the OpenClaw brainstorm skill with Victor. Explores requirements through Socratic questioning, proposes 2-3 approaches, gets approval section by section. Agent writes `plans/YYYY-MM-DD-{topic}-design.md`.
- **Existing review or audit** (fixes / refactors): Point `--design` directly at the review doc (e.g. `plans/codex-review-v3.md`). The review IS the spec — list of findings = list of things to implement. No brainstorm needed.
- **Direct instruction** (small / clear): Skip the pipeline entirely, use Mode 1.

**Brainstorm is for exploring requirements, not a mandatory ceremony.** Use it when requirements need to be discovered. Skip it when the spec already exists.

The brainstorm skill produces an approved design doc saved to:
```
plans/YYYY-MM-DD-{topic}-design.md
```

#### Step 2 — Write design.md

**This is the output of brainstorm** — it is written by you (the agent) during the brainstorm conversation, section by section, as Victor approves each part. It is NOT the HyperPowers `write-plan` skill (that is a different, later step that expands bd tasks — see Mode 3).

The design doc MUST contain all of these sections:
```
## Purpose
## Requirements (IMMUTABLE)
## Success Criteria
## Anti-Patterns (FORBIDDEN)
## Approach
## Architecture
## Design Rationale
```

Save to `plans/YYYY-MM-DD-{topic}-design.md`. Do not proceed until Victor approves.

#### Step 3 — Create bd epic + Task 1 (Claude Code CLI)

The script handles this automatically. If running manually, Claude Code reads the approved design.md and creates the bd epic and first task:

```bash
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "Read the design doc at /home/node/.openclaw/workspaces/{slug}/plans/{design-file}.md.

Create a bd epic and first task:

1. npx bd create 'Feature: {name}' --type epic --priority 1 --design '...'
   The --design field must include ALL sections from the design doc:
   ## Requirements (IMMUTABLE)
   ## Success Criteria (MUST ALL BE TRUE)
   ## Anti-Patterns (FORBIDDEN)
   ## Approach
   ## Architecture
   ## Design Rationale

2. npx bd create 'Task 1: [first logical deliverable]' --type feature --priority 1 --design '...'
   Task 1 --design must include: ## Goal, ## Implementation (TDD steps, exact file paths, what to change), ## Success Criteria
   Link to epic: npx bd dep add <task1-id> <epic-id> --type parent-child

3. Save to /home/node/.openclaw/workspaces/{slug}/plans/epic.json:
   {\"epic_id\": \"bd-N\", \"task1_id\": \"bd-M\", \"slug\": \"{slug}\"}

Do not write any code yet. Do not ask questions — requirements are already approved."
```

#### Step 4 — Execute (adaptive loop)

The script runs a bash loop that re-launches Claude Code with fresh context each iteration. Each iteration:

1. Claude Code: load epic → find ready task via `bd ready` → implement it (TDD) → close it
2. Claude Code: review learnings → create next task in bd based on what was discovered → write checkpoint → EXIT
3. Bash: read checkpoint (`plans/iteration-result.json`) → if `done: false`, re-launch Claude Code
4. Repeat until Claude Code writes `done: true` (all epic success criteria met)

Learnings accumulate in `plans/learnings.md` across iterations — each call reads previous learnings to maintain continuity.

**This mirrors HyperPowers executing-plans but with automatic context clearing between tasks.** No context overflow possible.

#### Step 5 — Review (optional, recommended for large epics)

```bash
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "Read /home/node/.openclaw/workspaces/{slug}/plans/epic.json to get the epic ID.
Run: npx bd show <epic_id>
Read the codebase.

Use the HyperPowers review-implementation skill:
- Review every requirement with evidence from the code
- Run all tests and linting
- Fix each gap immediately — do not just report
- Fix ONCE — do not loop endlessly
- Re-run tests to confirm"
```

---

### Mode 3: Full Spec Path (when Codex will review the plan before execution)

**▶ After design.md is approved, invoke the pipeline script:**
```bash
bash /home/node/.openclaw/workspace/scripts/run-auto-dev-full.sh \
  --slug {slug} \
  --design /home/node/.openclaw/workspaces/{slug}/plans/{design-file}.md \
  --workspace /home/node/.openclaw/workspaces/{slug} \
  --thread-id {discord-thread-id} \
  [--model opus] \
  [--skip-codex-review]   # skip sre-refine + codex-review, go straight to execute \
  [--resume]
```
This runs: create-epic → write-plan → sre-refine → codex-review → execute → review.
The manual steps below explain what each stage does.

Same brainstorm + design.md + epic creation as Mode 2 (Steps 1–3), then:

#### Step A — Expand all tasks upfront (HyperPowers write-plan)

**This is NOT the same as writing design.md.** `write-plan` is a HyperPowers skill that reads the epic requirements and expands ALL tasks in bd upfront — rather than creating them one at a time during execution. Use it only when you want the full plan visible before any code is written (e.g. for Codex review).

```bash
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "Read /home/node/.openclaw/workspaces/{slug}/plans/epic.json to get the epic ID.
Run: npx bd show <epic_id> to load the epic.
Read the codebase at /home/node/.openclaw/workspaces/{slug}/projects.

Use the HyperPowers write-plan skill to expand the full epic into all tasks:
- Write out every task (not just Task 1) with: Goal, Implementation steps (TDD, exact file paths), Success Criteria
- Create each task in bd and link to the epic: npx bd dep add <task-id> <epic-id> --type parent-child
- Update /home/node/.openclaw/workspaces/{slug}/plans/epic.json with all task IDs"
```

#### Step B — SRE task refinement (HyperPowers sre-task-refinement)

Run BEFORE Codex review so Codex sees the hardened plan:

```bash
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "Read /home/node/.openclaw/workspaces/{slug}/plans/epic.json.
Load each task via: npx bd show <task_id>

Use the HyperPowers sre-task-refinement skill to refine each bd task:
- Ensure all corner cases and requirements are understood
- Add failure modes, edge cases, rollback paths
- Update each task in bd with refined implementation notes"
```

#### Step C — Codex cold review of the hardened plan

```bash
/home/node/.openclaw/tools/node_modules/.bin/codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.3-codex \
  "Run: npx bd show <epic_id> to load the full epic and all tasks.

Review every task for: correctness, completeness, edge cases, security gaps, and architectural risks.
Be specific: for each issue state what is wrong and what the fix should be.

Save findings to /home/node/.openclaw/workspaces/{slug}/plans/epic-review.md:
## Epic Review
### Gaps
### Unclear Criteria
### Missing Anti-Patterns
### Architectural Risks
### Scope Concerns"
```

Then execute using the **per-task loop** (Mode 3 execute): bash iterates `all_task_ids` from `epic.json`, one fresh Claude Code call per task. Each call reads `plans/learnings.md` from previous tasks and appends to it after completing. See `run-auto-dev-full.sh` — the `run_execute_loop` function handles this.

---

## Key Design Decisions

These are deliberate architectural choices — understand the reasoning before changing anything.

**Why bash re-launches Claude Code between tasks (not one long session):**
Claude Code `--print` mode is one-shot. There is no session persistence and no auto-compaction. When context fills mid-task, Claude Code silently dies with no recovery. By exiting after each task and re-launching fresh, context is always bounded. The cost is that previous conversation is lost — mitigated by `plans/learnings.md` which carries forward structured discoveries.

**Why Mode 2 doesn't use write-plan (all tasks upfront):**
Mode 2 is learn-as-you-go. Each task is created *after* the previous task is done, informed by what was actually found in the codebase. Writing all tasks upfront (write-plan) produces a plan based on assumptions. Reality always differs — APIs behave differently, existing code has unexpected patterns, dependencies aren't what you thought. Mode 2 adapts to reality; Mode 3 trades that adaptivity for the ability to run a full Codex review before any code is written.

**Why Mode 3 uses write-plan + Codex review:**
When you need a cold external review before execution (security audit, architecture check, large complex epic), you need the full plan written out first so Codex can read it. Codex has no prior context — it's a genuine external critic. The trade-off is losing adaptive task creation; you accept that upfront.

**Why we don't use executing-plans skill directly:**
See the executing-plans entry below. TL;DR: designed for interactive human checkpoints, not automated pipelines. Context overflow kills it silently on long epics.

**Why prompts go to files, not --print args:**
Shell argument length limits. Long prompts passed directly to `--print "..."` fail with "Prompt is too long". Every stage writes its prompt to `plans/prompt-{stage}.md` and passes only `"Read and follow the instructions in {file} exactly."` — the `--print` arg is always ~60 chars.

**Why learnings.md and not just re-reading the codebase:**
Re-reading code shows the current state. Learnings capture *why* things are the way they are — unexpected patterns, rejected approaches, gotchas found during implementation. Task 5 knowing "Task 2 tried X and it failed because Y" prevents re-discovering the same dead ends.

---

## HyperPowers Skills Reference

Skills are loaded automatically by Claude Code CLI via the plugin at `/home/node/.openclaw/tools/hyperpowers/`. No config needed — reference by name in the `--print` prompt.

Codex has the same skills installed at `~/.agents/skills/` but has no hook system — auto-activation does not work. You must name the skill explicitly in the prompt.

---

### executing-plans
**Status: NOT USED directly by scripts.**

**Why not:** The skill was designed for interactive sessions where the human manually clears context and re-runs between tasks. In `--print` mode (one-shot, non-interactive), Claude Code has no auto-compaction — when context fills it silently dies. The skill also loads all bd task content at once, which overflows context on large epics. Our bash runner replaces this: it re-launches Claude Code with fresh context after each task automatically, no human intervention needed.

**What we do instead:** The bash loop in `run-auto-dev.sh` implements the same adaptive logic (execute one task → review learnings → create next task → exit → re-launch) but with bounded context per iteration. Do not invoke this skill directly.

---

### write-plan
**What it does:** Reads the epic requirements and writes out ALL tasks upfront in bd — full implementation detail for every task before any code is written. This is NOT the same as writing design.md (that's the brainstorm output). This expands the epic into a complete task list.

**When to use:** Mode 3 (full spec) only. After create-epic. Run BEFORE sre-task-refinement and Codex review, so the full plan exists to be hardened and reviewed.

**Do NOT use in Mode 2** — Mode 2 creates tasks adaptively because each task is informed by what the previous task actually discovered in the codebase. Writing all tasks upfront defeats this — the plan would be based on assumptions, not reality. Only use write-plan when you need Codex to review the full plan before any code is written (Mode 3).

```bash
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "Read /home/node/.openclaw/workspaces/{slug}/plans/epic.json to get the epic ID.
Run: npx bd show <epic_id> to load the epic requirements.
Read the codebase.

Use the HyperPowers write-plan skill to expand the full epic into ALL tasks upfront:
- Write every task with full detail: ## Goal, ## Implementation (TDD steps, exact file paths, what to change), ## Success Criteria
- Create each task in bd: npx bd create 'Task N: ...' --type feature --priority 1 --design '...'
- Link every task to the epic: npx bd dep add <task-id> <epic-id> --type parent-child
- Update plans/epic.json with all task IDs:
  {\"epic_id\": \"bd-N\", \"task1_id\": \"bd-M\", \"all_task_ids\": [\"bd-M\", ...], \"slug\": \"{slug}\"}"
```

---

### sre-task-refinement
**What it does:** Reads every task in bd and hardens it — adds corner cases, failure modes, edge cases, rollback paths, and error handling that the initial task design likely missed. Updates each task in bd with the refined notes.

**When to use:** Mode 3 only. After write-plan, BEFORE Codex review — so Codex sees the hardened plan, not the naive one.

```bash
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "Read /home/node/.openclaw/workspaces/{slug}/plans/epic.json to get all task IDs.
Load each task: npx bd show <task_id>

Use the HyperPowers sre-task-refinement skill to refine every bd task:
- Ensure all corner cases and requirements are understood
- Add failure modes, edge cases, rollback paths, error handling
- Update each task in bd: npx bd update <task_id> --design '...<refined design>...'"
```

---

### review-implementation
**What it does:** Reviews the completed implementation against every epic requirement with evidence from the actual code. Runs all tests and linting. Fixes any gaps immediately — does not just report them. Fixes once and stops, does not loop.

**When to use:** After execute completes (both Mode 2 and Mode 3).

```bash
CLAUDE_CONFIG_DIR=/home/node/.openclaw/.claude-auth \
  /home/node/.local/bin/claude \
  --dangerously-skip-permissions \
  --print "Read /home/node/.openclaw/workspaces/{slug}/plans/epic.json to get the epic ID.
Run: npx bd show <epic_id> to load the full epic.
Read the codebase.

Use the HyperPowers review-implementation skill:
- Review every requirement with evidence from the code
- Run all automated checks (tests, linting)
- For each gap: fix it immediately — do not just report
- Fix gaps ONCE — do not loop endlessly
- Re-run tests after fixing to confirm
- Write plans/stage_summary.json: {\"stage\": \"review\", \"gaps_found\": N, \"gaps_fixed\": N}"
```

---

## Auth (env vars, always available)
- `GITHUB_TOKEN` — GitHub CLI (`gh`) auth
- `VERCEL_TOKEN` — Vercel CLI (`vercel`) auth, no expiry
- `SUPABASE_ACCESS_TOKEN` — Supabase CLI auth

## CLI Paths
- `gh`: `/home/node/.openclaw/tools/node_modules/.bin/gh`
- `vercel`: `/home/node/.openclaw/tools/node_modules/.bin/vercel`
- `supabase`: `/home/node/.openclaw/tools/node_modules/.bin/supabase`

## Scraping
- **Scrapling** at `/home/node/.openclaw/pyenv/bin/python3`
- Use for: anti-bot sites, Cloudflare-protected pages, stealth browsing
- Don't use for: clean JSON APIs — urllib/curl is fine
- Import: `from scrapling import Fetcher, StealthFetcher, PlayWrightFetcher`
- When a scraper breaks due to anti-bot, migrate to Scrapling.

## Playwright
- Shared at `/home/node/.openclaw/node_modules/playwright`
- For browser automation and PDF generation

## Deploy
- Vercel: `vercel deploy --prod --yes`
- GitHub: `git push origin main`
- Supabase: `supabase db push` / `supabase functions deploy`

## Rules
- Python urllib is Cloudflare-blocked from Docker. Use curl subprocess or Scrapling.
- Stay in your workspace. Don't touch other agent workspaces.
- All coding = Claude Code CLI or Codex CLI. No exceptions.
