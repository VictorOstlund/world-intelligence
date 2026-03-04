#!/usr/bin/env tsx
/**
 * A1 Orchestrator — OpenClaw-native path.
 * Spawned by OpenClaw cron. Calls the two-tier pipeline, writes report to
 * /home/node/.openclaw/workspace/reports/ and logs outcome to workspace memory.
 */

import fs from 'fs'
import path from 'path'
import { runPipeline } from '../lib/pipeline'

const WORKSPACE_REPORTS_DIR = '/home/node/.openclaw/workspace/reports'
const WORKSPACE_MEMORY_DIR = '/home/node/.openclaw/workspace/memory'

async function main() {
  const startTime = new Date()
  console.log(`[a1-orchestrator] Starting pipeline run at ${startTime.toISOString()}`)

  // Ensure output directories exist
  fs.mkdirSync(WORKSPACE_REPORTS_DIR, { recursive: true })
  fs.mkdirSync(WORKSPACE_MEMORY_DIR, { recursive: true })

  try {
    const result = await runPipeline()

    const dateStr = startTime.toISOString().slice(0, 10) // YYYY-MM-DD
    const reportFile = path.join(WORKSPACE_REPORTS_DIR, `${dateStr}-${result.reportId}.md`)

    // The report body is stored in DB; retrieve it for file write
    const { getReport } = await import('../lib/db')
    const report = await getReport(result.reportId)

    if (report) {
      fs.writeFileSync(reportFile, report.body, 'utf8')
      console.log(`[a1-orchestrator] Report written to ${reportFile}`)
    }

    // Append to workspace memory log
    const memoryFile = path.join(WORKSPACE_MEMORY_DIR, `${dateStr}.md`)
    const timeStr = startTime.toISOString().slice(11, 16) // HH:MM
    const logLine = `[${timeStr} UTC] a1-orchestrator — report ${result.reportId}, cost $${result.costUsd.toFixed(4)}, ${result.itemCount} items from ${result.sourceCount} categories\n`
    fs.appendFileSync(memoryFile, logLine, 'utf8')

    console.log(`[a1-orchestrator] Done — report ${result.reportId}, $${result.costUsd.toFixed(4)}, ${result.itemCount} items`)
    process.exit(0)
  } catch (err) {
    const dateStr = startTime.toISOString().slice(0, 10)
    const timeStr = startTime.toISOString().slice(11, 16)
    const errMsg = err instanceof Error ? err.message : String(err)

    // Log failure to memory
    try {
      const memoryFile = path.join(WORKSPACE_MEMORY_DIR, `${dateStr}.md`)
      fs.appendFileSync(memoryFile, `[${timeStr} UTC] a1-orchestrator — FAILED: ${errMsg}\n`, 'utf8')
    } catch {
      // best effort
    }

    console.error('[a1-orchestrator] Pipeline failed:', err)
    process.exit(1)
  }
}

main()
