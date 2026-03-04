/**
 * Scheduler — node-cron wrapper for the pipeline.
 * Singleton: startScheduler / stopScheduler manage a single cron job.
 */

import cron, { type ScheduledTask } from 'node-cron'

let _task: ScheduledTask | null = null

/**
 * Start the pipeline scheduler.
 * scheduleHours: run every N hours (1–24). Defaults to 6.
 * onRun: called on each scheduled tick (receives current Date).
 */
export function startScheduler(
  scheduleHours: number,
  onRun: (now: Date) => void | Promise<void>,
): void {
  if (_task) {
    _task.stop()
    _task = null
  }

  const hours = Math.max(1, Math.min(24, Math.round(scheduleHours)))
  // Run at minute 0 every N hours: "0 */N * * *"
  const expression = `0 */${hours} * * *`

  _task = cron.schedule(expression, () => {
    void Promise.resolve(onRun(new Date())).catch(err => {
      console.error('[scheduler] Pipeline run failed:', err)
    })
  })
}

/**
 * Stop the scheduler and clean up.
 */
export function stopScheduler(): void {
  if (_task) {
    _task.stop()
    _task = null
  }
}
