import { NextResponse } from 'next/server'
import { getConfig, saveConfig } from '../../../lib/db'

function redactProviders(providers: unknown): unknown {
  if (!providers || typeof providers !== 'object') return providers
  const result: Record<string, unknown> = {}
  for (const [name, prov] of Object.entries(providers as Record<string, unknown>)) {
    if (prov && typeof prov === 'object') {
      const redacted: Record<string, unknown> = { ...(prov as Record<string, unknown>) }
      if (redacted.apiKey) {
        redacted.apiKey = '*****'
      }
      result[name] = redacted
    } else {
      result[name] = prov
    }
  }
  return result
}

export async function GET(_req: Request) {
  const config = getConfig() as Record<string, unknown>
  // Parse providers JSON if stored as string
  let providers: unknown = config.providers
  if (typeof providers === 'string') {
    try {
      providers = JSON.parse(providers)
    } catch {
      providers = {}
    }
  }
  const redacted = redactProviders(providers)
  return NextResponse.json({ ...config, providers: redacted })
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  // Serialize providers as JSON string if present
  if (body.providers && typeof body.providers === 'object') {
    body = { ...body, providers: JSON.stringify(body.providers) }
  }

  saveConfig(body)
  return NextResponse.json({ ok: true })
}
