import { NextResponse } from 'next/server'
import { getReports, getReportCount, searchReports } from '../../../lib/db'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')

  if (q) {
    const reports = await searchReports(q, 50)
    return NextResponse.json({ reports })
  }

  const limit = parseInt(url.searchParams.get('limit') || '20', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const reports = await getReports(limit, offset)
  const total = await getReportCount()
  return NextResponse.json({ reports, total })
}
