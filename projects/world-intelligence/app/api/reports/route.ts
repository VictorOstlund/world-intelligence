import { NextResponse } from 'next/server'
import { getReports, searchReports } from '../../../lib/db'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')

  if (q) {
    const reports = searchReports(q, 50)
    return NextResponse.json({ reports })
  }

  const limit = parseInt(url.searchParams.get('limit') || '20', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const reports = getReports(limit, offset)
  // Count total
  const { getDb } = await import('../../../lib/db')
  const total = (getDb().prepare('SELECT COUNT(*) as n FROM reports').get() as { n: number }).n
  return NextResponse.json({ reports, total })
}
