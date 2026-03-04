# dev-pipeline.lobster
# Lobster dev pipeline — metadata/documentation only.
# Stage execution is handled by scripts/run-lobster.sh (hardcoded bash).
#
# Pipeline always runs no-gates (no approval checkpoints).
# Models: create-epic/execute/review = Opus, finish = Sonnet
#
# Variables used by run-lobster.sh at runtime:
#   {slug}        — project slug (e.g. my-project)
#   {design_path} — path to design doc (e.g. plans/2026-02-26-my-project-design.md)
#   {thread_id}   — Discord thread ID for this project
#   {workspace}   — absolute path to project workspace

pipeline:
  name: "dev-pipeline"
  version: "3.0"
  description: "create-epic → execute → review → finish (no approval gates)"

  stages:

    - id: create-epic
      label: "📐 Create Epic"
      model: "opus"
      description: "Claude Code/Opus reads design.md → bd create epic (immutable requirements, success criteria, anti-patterns, approach, architecture) + Task 1. Saves epic ID to plans/epic.json."

    - id: execute
      label: "⚙️ Execute"
      model: "opus"
      description: "HyperPowers execute-plan — learn-by-doing from Task 1. Creates tasks adaptively from learnings. No stops between tasks. TDD throughout. Runs until epic complete."

    - id: review
      label: "🔍 Review"
      model: "opus"
      description: "HyperPowers review-implementation — compares finished code against bd epic. Fixes any gaps found, once. Continues to finish regardless."

    - id: finish
      label: "✅ Finish"
      model: "sonnet"
      description: "Verify tests pass. git commit + push. Deploy per project.json deploy field (vercel/electron/none). Post results to Discord."
