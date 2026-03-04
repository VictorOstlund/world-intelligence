import { NextResponse } from 'next/server'
import { runPipeline } from '../../../../lib/pipeline'

export async function POST(_req: Request) {
  const start = Date.now()
  try {
    const result = await runPipeline()
    const durationMs = Date.now() - start
    return NextResponse.json({
      reportId: result.reportId,
      costUsd: result.costUsd,
      itemCount: result.itemCount,
      sourceCount: result.sourceCount,
      durationMs,
    })
  } catch (err) {
    console.error('[pipeline/run] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pipeline failed' },
      { status: 500 }
    )
  }
}
