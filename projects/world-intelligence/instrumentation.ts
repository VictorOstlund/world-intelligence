/**
 * Next.js instrumentation hook — runs once on server startup.
 * Starts the pipeline scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler')
    const { runPipeline } = await import('./lib/pipeline')
    const { getConfig, seedIfEmpty } = await import('./lib/db')

    // Seed initial admin user on startup (before any request is handled)
    try {
      await seedIfEmpty()
    } catch (err) {
      console.error('[instrumentation] seedIfEmpty failed:', err)
    }

    let scheduleHours = parseInt(process.env.SCHEDULE_HOURS || '0', 10)
    if (!scheduleHours) {
      try {
        const config = await getConfig() as Record<string, unknown>
        scheduleHours = (config.schedule_hours as number) || 6
      } catch {
        scheduleHours = 6
      }
    }

    console.log(`[instrumentation] Starting pipeline scheduler — every ${scheduleHours} hour(s)`)

    startScheduler(scheduleHours, async (now: Date) => {
      console.log(`[scheduler] Pipeline run triggered at ${now.toISOString()}`)
      try {
        const result = await runPipeline()
        console.log(`[scheduler] Run complete — report ${result.reportId}, cost $${result.costUsd.toFixed(4)}, ${result.itemCount} items`)
      } catch (err) {
        console.error('[scheduler] Run failed:', err)
      }
    })
  }
}
