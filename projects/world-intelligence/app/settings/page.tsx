'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getModelsWithCustom, type ModelOption } from '../../lib/models'

interface ProviderEntry {
  apiKey?: string
  baseURL?: string
  deploymentId?: string
}

interface Config {
  active_provider?: string
  triage_model?: string
  synthesis_model?: string
  triage_fallbacks?: string
  synthesis_fallbacks?: string
  schedule_hours?: number
  providers?: Record<string, ProviderEntry>
}

interface CategoryConfig {
  enabled: boolean
  itemBudget: number
}

const PROVIDERS = ['anthropic', 'openai', 'azure', 'gemini'] as const
const MASKED_KEY_SENTINEL = '__masked__'

function ModelSelect({ provider, value, onChange, placeholder }: {
  provider: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const options = getModelsWithCustom(provider, value || undefined)
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full mt-1 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
    >
      <option value="">{placeholder || 'Select model...'}</option>
      {options.map(m => (
        <option key={m.value} value={m.value} disabled={m.disabled}>
          {m.label}
        </option>
      ))}
    </select>
  )
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>({})
  const [categories, setCategories] = useState<Record<string, CategoryConfig>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  // Track which providers had a saved key on load (sentinel detected)
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/settings/categories').then(r => r.json()),
    ]).then(([cfg, cats]) => {
      // Detect sentinel values and track which providers have saved keys
      const keySaved: Record<string, boolean> = {}
      if (cfg.providers && typeof cfg.providers === 'object') {
        for (const [prov, provCfg] of Object.entries(cfg.providers as Record<string, ProviderEntry>)) {
          if (provCfg?.apiKey === MASKED_KEY_SENTINEL) {
            keySaved[prov] = true
            provCfg.apiKey = '' // Clear sentinel from local state
          }
        }
      }
      setSavedKeys(keySaved)
      setConfig(cfg)
      setCategories(cats)
    }).finally(() => setLoading(false))
  }, [])

  function setConfigField(key: keyof Config, value: unknown) {
    setConfig(c => ({ ...c, [key]: value }))
  }

  function setProviderKey(provider: string, field: keyof ProviderEntry, value: string) {
    if (field === 'apiKey' && value !== '') {
      // User typed a new value — clear saved state so sentinel won't be sent
      setSavedKeys(s => ({ ...s, [provider]: false }))
    }
    setConfig(c => ({
      ...c,
      providers: {
        ...(c.providers || {}),
        [provider]: {
          ...(c.providers?.[provider] || {}),
          [field]: value,
        },
      },
    }))
  }

  function setFallback(key: 'triage_fallbacks' | 'synthesis_fallbacks', idx: number, value: string) {
    const existing = parseFallbacks(config[key])
    const updated = [...existing]
    updated[idx] = value
    setConfigField(key, JSON.stringify(updated.filter(Boolean)))
  }

  function parseFallbacks(raw: string | undefined): string[] {
    try {
      const arr = JSON.parse(raw || '[]')
      if (Array.isArray(arr)) return arr.map((f: any) => typeof f === 'string' ? f : f?.model || '')
    } catch {}
    return []
  }

  function setCategoryField(name: string, field: keyof CategoryConfig, value: boolean | number) {
    setCategories(c => ({ ...c, [name]: { ...c[name], [field]: value } }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    try {
      // Build config to send — restore sentinel for unchanged saved keys
      const configToSend = { ...config }
      if (configToSend.providers) {
        const providers = { ...configToSend.providers }
        for (const prov of PROVIDERS) {
          if (savedKeys[prov] && !providers[prov]?.apiKey) {
            // User didn't type a new value — send sentinel to preserve existing key
            providers[prov] = { ...(providers[prov] || {}), apiKey: MASKED_KEY_SENTINEL }
          }
        }
        configToSend.providers = providers
      }
      const [settingsRes, categoriesRes] = await Promise.all([
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configToSend),
        }),
        fetch('/api/settings/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryConfig: categories }),
        }),
      ])
      if (settingsRes.ok && categoriesRes.ok) {
        setSaveMsg('Saved.')
      } else {
        setSaveMsg('Save failed.')
      }
    } catch {
      setSaveMsg('Network error.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    )
  }

  const triageFallbacks = parseFallbacks(config.triage_fallbacks)
  const synthFallbacks = parseFallbacks(config.synthesis_fallbacks)

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">World Intelligence</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/reports" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Reports</Link>
          <span className="font-medium">Settings</span>
        </nav>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* Provider */}
        <section>
          <h2 className="text-base font-semibold mb-3">Active Provider</h2>
          <select
            value={config.active_provider || 'anthropic'}
            onChange={e => setConfigField('active_provider', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </section>

        {/* Provider credentials */}
        <section>
          <h2 className="text-base font-semibold mb-3">Provider Credentials</h2>
          <div className="space-y-4">
            {PROVIDERS.map(provider => (
              <div key={provider} className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                <p className="text-sm font-medium mb-2 capitalize">{provider}</p>
                <input
                  type="password"
                  placeholder={savedKeys[provider] ? 'API key saved (enter new to change)' : 'API Key'}
                  value={config.providers?.[provider]?.apiKey || ''}
                  onChange={e => setProviderKey(provider, 'apiKey', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 mb-2"
                />
                {provider === 'azure' && (
                  <>
                    <input
                      type="text"
                      placeholder="Base URL"
                      value={config.providers?.[provider]?.baseURL || ''}
                      onChange={e => setProviderKey(provider, 'baseURL', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 mb-2"
                    />
                    <input
                      type="text"
                      placeholder="Deployment ID"
                      value={config.providers?.[provider]?.deploymentId || ''}
                      onChange={e => setProviderKey(provider, 'deploymentId', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Models */}
        <section>
          <h2 className="text-base font-semibold mb-3">Models</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Triage model</label>
              <ModelSelect
                provider={config.active_provider || 'anthropic'}
                value={config.triage_model || ''}
                onChange={v => setConfigField('triage_model', v)}
              />
              <p className="text-xs text-zinc-400 mt-1">Fallbacks (up to 2 additional):</p>
              {[0, 1].map(i => (
                <ModelSelect
                  key={i}
                  provider={config.active_provider || 'anthropic'}
                  value={triageFallbacks[i] || ''}
                  onChange={v => setFallback('triage_fallbacks', i, v)}
                  placeholder={`Fallback ${i + 1}`}
                />
              ))}
            </div>
            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Synthesis model</label>
              <ModelSelect
                provider={config.active_provider || 'anthropic'}
                value={config.synthesis_model || ''}
                onChange={v => setConfigField('synthesis_model', v)}
              />
              <p className="text-xs text-zinc-400 mt-1">Fallbacks (up to 2 additional):</p>
              {[0, 1].map(i => (
                <ModelSelect
                  key={i}
                  provider={config.active_provider || 'anthropic'}
                  value={synthFallbacks[i] || ''}
                  onChange={v => setFallback('synthesis_fallbacks', i, v)}
                  placeholder={`Fallback ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Schedule */}
        <section>
          <h2 className="text-base font-semibold mb-3">Schedule</h2>
          <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Run every N hours (1–24)</label>
          <input
            type="number"
            min={1}
            max={24}
            value={config.schedule_hours ?? 6}
            onChange={e => setConfigField('schedule_hours', parseInt(e.target.value, 10))}
            className="w-24 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </section>

        {/* Categories */}
        <section>
          <h2 className="text-base font-semibold mb-3">Categories</h2>
          <div className="space-y-2">
            {Object.entries(categories).map(([name, cfg]) => (
              <div key={name} className="flex items-center gap-3 p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                <input
                  type="checkbox"
                  id={`cat-${name}`}
                  checked={cfg.enabled}
                  onChange={e => setCategoryField(name, 'enabled', e.target.checked)}
                  className="h-4 w-4 accent-zinc-700"
                />
                <label htmlFor={`cat-${name}`} className="flex-1 text-sm capitalize cursor-pointer">
                  {name.replace(/-/g, ' ')}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-zinc-400">Budget:</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={cfg.itemBudget}
                    onChange={e => setCategoryField(name, 'itemBudget', parseInt(e.target.value, 10))}
                    className="w-16 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Save */}
        <div className="flex items-center gap-4 pb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saveMsg && <span className="text-sm text-zinc-500">{saveMsg}</span>}
        </div>

      </main>
    </div>
  )
}
