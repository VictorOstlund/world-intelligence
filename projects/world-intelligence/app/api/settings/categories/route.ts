import { NextResponse } from 'next/server'
import { getActiveCategoryConfig, saveConfig } from '../../../../lib/db'

export async function GET(_req: Request) {
  const categories = getActiveCategoryConfig()
  return NextResponse.json(categories)
}

export async function POST(req: Request) {
  let body: { categoryConfig?: Record<string, { enabled: boolean; itemBudget: number }> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  if (!body.categoryConfig || typeof body.categoryConfig !== 'object') {
    return NextResponse.json({ error: 'categoryConfig is required' }, { status: 400 })
  }

  saveConfig({ category_config: JSON.stringify(body.categoryConfig) })
  return NextResponse.json({ ok: true })
}
