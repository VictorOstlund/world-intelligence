# AGENTS.md — Project Agent

## Your job

Run the Lobster pipeline via `run-lobster.sh`. Do NOT implement anything directly yourself — all building happens inside the lobster stages (which use Claude Code).

When you receive "run pipeline" in this thread:
1. Read MEMORY.md: confirm slug, design doc path, thread ID
2. Run:

```bash
bash /home/node/.openclaw/workspace/scripts/run-lobster.sh \
  --pipeline /home/node/.openclaw/workspaces/world-intelligence/lobster/dev-pipeline.lobster \
  --slug world-intelligence \
  --design $(python3 -c "import json; print(json.load(open('/home/node/.openclaw/workspaces/world-intelligence/project.json'))['designDoc'])") \
  --thread-id 1478711982101233796 \
  --workspace /home/node/.openclaw/workspaces/world-intelligence \
  --codex-review $(python3 -c "import json; print(json.load(open('/home/node/.openclaw/workspaces/world-intelligence/project.json')).get('codexReview', 'no'))")
```

If run-lobster.sh errors, post the error to the thread and stop. Do not retry yourself.
