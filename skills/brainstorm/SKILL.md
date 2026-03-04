---
name: brainstorm
description: "Design-first brainstorming workflow for any new feature, component, project, or non-trivial change. Use BEFORE any implementation work. Explores requirements through Socratic questioning, proposes approaches with trade-offs, gets design approval section-by-section. Triggers when user wants to build, create, design, or plan something new. Also triggers on: 'brainstorm', 'let's design', 'I want to build', 'new feature', 'how should we architect'."
---

# Brainstorming Ideas Into Designs

> **OpenClaw Note:** Sub-agents are async (`sessions_spawn`). Design docs and plan files are the shared state between orchestrator and sub-agents. This skill runs interactively in the main session — no sub-agents needed.

## Overview

Turn ideas into approved designs through collaborative Socratic dialogue. Understand context, ask questions one at a time, propose approaches, present design in sections, get approval.

## Human vs Autonomous Mode

The brainstorm mode is set by the `brainstorm` field in `pending-pipeline.json` (written before brainstorm starts). Read it from there. If no pending-pipeline.json exists (standalone brainstorm), default to **human**.

**Human mode** — ask ALL questions, including technical ones (architecture, framework, data model, testing strategy, error handling). Victor answers everything. Full design control.

**Autonomous mode** — ask only **product questions** that affect what gets built or how it feels to use. Skip technical implementation questions — decide those yourself based on best practice.

Product questions (always ask in both modes):
- What does it do / what problem does it solve?
- Who uses it?
- What are the core features for v1? (ruthlessly cut scope)
- Does it need to save or remember data?
- Are there any hard constraints? (budget, timeline, must-use tech)

Technical questions (human mode only — decide yourself in autonomous mode):
- What framework / language?
- What's the data model / schema?
- What's the API design?
- How should errors be handled?
- What's the testing strategy?
- What does the folder structure look like?

<HARD-GATE>
🚫 DO NOT write any code, create any files (except the design doc), scaffold any project, install any dependencies, or take ANY implementation action until the design document is fully approved by the user. This applies to EVERY project regardless of perceived simplicity. A "simple" project still needs a short design (even 5 lines) that gets explicit approval.

Violation of this gate — even "just setting up the project structure" — is a failure of this skill.
</HARD-GATE>

## Process

### 1. Explore Project Context
- Read existing files, docs, recent git commits via `exec("git log --oneline -10")`
- Understand the codebase structure and conventions
- Note relevant technologies and patterns already in use

### 2. Ask Clarifying Questions (One at a Time)
- Ask ONE question per message — do not overwhelm
- Prefer multiple-choice when possible ("Would you prefer A, B, or C?")
- Focus on: purpose, constraints, success criteria, users, edge cases
- Continue until you have enough to propose approaches (usually 3-7 questions)

### 3. Propose 2-3 Approaches
- Present each approach with clear trade-offs
- Lead with your recommendation and explain why
- Format:

```
**Approach A: [Name]** ⭐ Recommended
- How: [2-3 sentences]
- Pros: [bullets]
- Cons: [bullets]

**Approach B: [Name]**
- How: [2-3 sentences]
- Pros: [bullets]
- Cons: [bullets]
```

- Get user's choice before proceeding
- **Record rejected approaches** — note why each was rejected (feeds Anti-Patterns section)

### 4. Present Design in Sections
- Scale each section to its complexity (a sentence for simple, a paragraph for complex)
- Ask "Does this look right?" after each section
- Sections to cover (skip irrelevant ones):
  - **Requirements** — what must be true when complete (immutable, testable)
  - **Success Criteria** — objective, measurable checkboxes
  - **Anti-Patterns** — what's forbidden, derived from rejected approaches and stated constraints
  - **Architecture** — components, how they connect
  - **Data model** — schemas, state shape
  - **API/Interface** — inputs, outputs, contracts
  - **Error handling** — failure modes, recovery
  - **Testing strategy** — what to test, how
  - **Design Rationale** — why chosen approach, why alternatives rejected
- Be ready to revise any section based on feedback

### 5. Save Design Document
Once ALL sections are approved:

```
plans/YYYY-MM-DD-<topic>-design.md
```

The design doc MUST contain ALL of these sections (required for HyperPowers epic creation):

```markdown
## Purpose
[What this project does and why]

## Requirements (IMMUTABLE)
[What MUST be true when complete — specific, testable]
- Requirement 1
- Requirement 2

## Success Criteria
- [ ] Criterion 1 (objective, testable)
- [ ] Criterion 2
- [ ] All tests passing

## Anti-Patterns (FORBIDDEN)
[Derived from rejected approaches and stated constraints]
- ❌ [Pattern] — [reason]
- ❌ [Pattern] — [reason]

## Approach
[Chosen approach — 2-3 paragraphs]

## Architecture
[Key components, data flow, integration points]

## Design Rationale
### Approaches Considered
#### [Chosen approach] ✓
- Chosen because: [reason]

#### [Rejected approach A] ❌
- Rejected because: [reason]

#### [Rejected approach B] ❌
- Rejected because: [reason]

## Stack
[Technologies, frameworks, hosting]

## Data Model
[Schema, if applicable]

## API / Routes
[Endpoints or page routes, if applicable]
```

Create `plans/` directory if it doesn't exist. Use `Write` tool to save. Commit via:
```
exec("mkdir -p plans && git add plans/ && git commit -m 'docs: design for <topic>'")
```

### 6. Transition to Implementation
After saving, say:

> "Design approved and saved to `plans/YYYY-MM-DD-<topic>-design.md`. Design approved and saved. The Lobster pipeline will handle the rest — `create-epic` → `execute` → `review` → `finish`."

<HARD-GATE>
**The terminal state of this skill is an approved design doc saved to plans/.** The main agent then creates the project agent via create-project-agent.js.
Do NOT invoke create-epic, execute, review, finish, or any other skill. Do NOT start writing code.
The Lobster pipeline handles create-epic as its first stage — brainstorm does NOT invoke it directly.
</HARD-GATE>

## Key Principles
- **One question at a time** — don't overwhelm
- **YAGNI ruthlessly** — cut features that aren't essential for v1
- **Explore alternatives** — always 2-3 approaches before settling
- **Incremental validation** — approve section by section
- **No implementation** — design doc is the ONLY output of this skill

## Anti-Pattern: "This Is Too Simple"
Every project goes through this. A config change, a single function, a todo app — all of them. The design can be 5 lines for truly simple projects, but it MUST exist and MUST be approved.
