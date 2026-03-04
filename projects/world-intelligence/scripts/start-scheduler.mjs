#!/usr/bin/env node
/**
 * Scheduler sidecar — spawned by start.js alongside Next.js.
 * Reads schedule_hours from DB config (or env), starts the cron-based pipeline runner.
 */

// Wait for Next.js to be ready before starting the scheduler
await new Promise(resolve => setTimeout(resolve, 5000))

const { startScheduler } = await import('../lib/scheduler.js').catch(async () => {
  // Try ts-node/esbuild path if .js doesn't resolve
  const tsx = await import('../node_modules/tsx/dist/esm/index.js').catch(() => null)
  return import('../lib/scheduler.ts')
})

const { runPipeline } = await import('../lib/pipeline.js').catch(async () => {
  return import('../lib/pipeline.ts')
})

const { getConfig } = await import('../lib/db.js').catch(async () => {
  return import('../lib/db.ts')
})

let scheduleHours = parseInt(process.env.SCHEDULE_HOURS || '0', 10)
if (!scheduleHours) {
  try {
    const config = getConfig()
    scheduleHours = config.schedule_hours || 6
  } catch {
    scheduleHours = 6
  }
}

console.log(`[scheduler] Starting pipeline scheduler — every ${scheduleHours} hour(s)`)

startScheduler(scheduleHours, async (now) => {
  console.log(`[scheduler] Pipeline run triggered at ${now.toISOString()}`)
  try {
    const result = await runPipeline()
    console.log(`[scheduler] Run complete — report ${result.reportId}, cost $${result.costUsd.toFixed(4)}, ${result.itemCount} items`)
  } catch (err) {
    console.error('[scheduler] Run failed:', err)
  }
})
