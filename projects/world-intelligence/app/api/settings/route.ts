import { NextResponse } from 'next/server'
import { getConfig, saveConfig } from '../../../lib/db'

const MASKED_KEY_SENTINEL = '__masked__'

function redactProviders(providers: unknown): unknown {
  if (!providers || typeof providers !== 'object') return providers
  const result: Record<string, unknown> = {}
  for (const [name, prov] of Object.entries(providers as Record<string, unknown>)) {
    if (prov && typeof prov === 'object') {
      const redacted: Record<string, unknown> = { ...(prov as Record<string, unknown>) }
      if (redacted.apiKey) {
        redacted.apiKey = MASKED_KEY_SENTINEL
      }
      result[name] = redacted
    } else {
      result[name] = prov
    }
  }
  return result
}

export async function GET(_req: Request) {
  const config = await getConfig() as Record<string, unknown>
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

  // Merge provider keys: if sentinel, preserve existing DB value
  if (body.providers && typeof body.providers === 'object') {
    const incoming = body.providers as Record<string, Record<string, unknown>>
    const existing = await getConfig()
    let existingProviders: Record<string, Record<string, unknown>> = {}
    try {
      const raw = existing.providers
      existingProviders = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, Record<string, unknown>>) || {}
    } catch {
      existingProviders = {}
    }

    for (const [provName, prov] of Object.entries(incoming)) {
      if (prov && typeof prov === 'object' && prov.apiKey === MASKED_KEY_SENTINEL) {
        // Preserve existing key from DB
        const existingKey = existingProviders[provName]?.apiKey
        if (existingKey) {
          prov.apiKey = existingKey as string
        } else {
          delete prov.apiKey
        }
      }
    }

    body = { ...body, providers: JSON.stringify(incoming) }
  }

  await saveConfig(body)
  return NextResponse.json({ ok: true })
}
