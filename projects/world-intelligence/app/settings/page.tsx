'use client'

import { useState, useEffect } from 'react'
import { getModelsWithCustom, PROVIDER_MODELS } from '../../lib/models'

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

interface ProviderModelMemory {
  triage: string
  synthesis: string
  triageFallbacks: string[]
  synthFallbacks: string[]
}

function getDefaultModels(provider: string): { triage: string; synthesis: string } {
  const models = PROVIDER_MODELS[provider] || []
  return {
    triage: models[0]?.value || '',
    synthesis: models[models.length - 1]?.value || '',
  }
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
      className="w-full mt-1 px-3 py-2 text-sm border border-wi-border rounded-lg bg-wi-input text-wi-text focus:outline-none focus:ring-2 focus:ring-wi-accent/40 focus:border-wi-accent transition-colors"
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

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-wi-secondary mb-4">{title}</h2>
  )
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>({})
  const [categories, setCategories] = useState<Record<string, CategoryConfig>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})
  const [modelMemory, setModelMemory] = useState<Record<string, ProviderModelMemory>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/settings/categories').then(r => r.json()),
    ]).then(([cfg, cats]) => {
      const keySaved: Record<string, boolean> = {}
      if (cfg.providers && typeof cfg.providers === 'object') {
        for (const [prov, provCfg] of Object.entries(cfg.providers as Record<string, ProviderEntry>)) {
          if (provCfg?.apiKey === MASKED_KEY_SENTINEL) {
            keySaved[prov] = true
            provCfg.apiKey = ''
          }
        }
      }
      setSavedKeys(keySaved)
      setConfig(cfg)
      setCategories(cats)
      const initProvider = cfg.active_provider || 'anthropic'
      setModelMemory({
        [initProvider]: {
          triage: cfg.triage_model || '',
          synthesis: cfg.synthesis_model || '',
          triageFallbacks: parseFallbacks(cfg.triage_fallbacks),
          synthFallbacks: parseFallbacks(cfg.synthesis_fallbacks),
        },
      })
    }).finally(() => setLoading(false))
  }, [])

  function setConfigField(key: keyof Config, value: unknown) {
    setConfig(c => ({ ...c, [key]: value }))
  }

  function setProviderKey(provider: string, field: keyof ProviderEntry, value: string) {
    if (field === 'apiKey' && value !== '') {
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

  function handleProviderChange(newProvider: string) {
    const oldProvider = config.active_provider || 'anthropic'
    const snapshot: ProviderModelMemory = {
      triage: config.triage_model || '',
      synthesis: config.synthesis_model || '',
      triageFallbacks: parseFallbacks(config.triage_fallbacks),
      synthFallbacks: parseFallbacks(config.synthesis_fallbacks),
    }
    setModelMemory(mem => ({ ...mem, [oldProvider]: snapshot }))

    const remembered = modelMemory[newProvider]
    const defaults = getDefaultModels(newProvider)

    setConfig(c => ({
      ...c,
      active_provider: newProvider,
      triage_model: remembered?.triage ?? defaults.triage,
      synthesis_model: remembered?.synthesis ?? defaults.synthesis,
      triage_fallbacks: JSON.stringify(remembered?.triageFallbacks ?? []),
      synthesis_fallbacks: JSON.stringify(remembered?.synthFallbacks ?? []),
    }))
  }

  function handleModelChange(field: 'triage_model' | 'synthesis_model', value: string) {
    const provider = config.active_provider || 'anthropic'
    setConfigField(field, value)
    setModelMemory(mem => {
      const prev = mem[provider] || { triage: '', synthesis: '', triageFallbacks: [], synthFallbacks: [] }
      const memField = field === 'triage_model' ? 'triage' : 'synthesis'
      return { ...mem, [provider]: { ...prev, [memField]: value } }
    })
  }

  function handleFallbackChange(key: 'triage_fallbacks' | 'synthesis_fallbacks', idx: number, value: string) {
    const provider = config.active_provider || 'anthropic'
    setFallback(key, idx, value)
    setModelMemory(mem => {
      const prev = mem[provider] || { triage: '', synthesis: '', triageFallbacks: [], synthFallbacks: [] }
      const fbKey = key === 'triage_fallbacks' ? 'triageFallbacks' : 'synthFallbacks'
      const updated = [...prev[fbKey]]
      updated[idx] = value
      return { ...mem, [provider]: { ...prev, [fbKey]: updated.filter(Boolean) } }
    })
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const configToSend = { ...config }
      if (configToSend.providers) {
        const providers = { ...configToSend.providers }
        for (const prov of PROVIDERS) {
          if (savedKeys[prov] && !providers[prov]?.apiKey) {
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
        setSaveMsg('Settings saved successfully.')
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
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-wi-secondary text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          Loading settings...
        </div>
      </div>
    )
  }

  const triageFallbacks = parseFallbacks(config.triage_fallbacks)
  const synthFallbacks = parseFallbacks(config.synthesis_fallbacks)

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="space-y-8">

        {/* Provider Section */}
        <section className="bg-wi-surface border border-wi-border rounded-xl p-5">
          <SectionHeader title="Provider" />
          <label className="block text-xs text-wi-secondary mb-1.5">Active provider</label>
          <select
            value={config.active_provider || 'anthropic'}
            onChange={e => handleProviderChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-wi-border rounded-lg bg-wi-input text-wi-text focus:outline-none focus:ring-2 focus:ring-wi-accent/40 focus:border-wi-accent transition-colors"
          >
            {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <div className="mt-4 space-y-3">
            {PROVIDERS.map(provider => (
              <div key={provider} className="border border-wi-border rounded-lg p-3">
                <p className="text-xs font-medium text-wi-text mb-2 capitalize">{provider}</p>
                <input
                  type="password"
                  placeholder={savedKeys[provider] ? 'API key saved (enter new to change)' : 'API Key'}
                  value={config.providers?.[provider]?.apiKey || ''}
                  onChange={e => setProviderKey(provider, 'apiKey', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-wi-border rounded-lg bg-wi-input text-wi-text placeholder:text-wi-secondary focus:outline-none focus:ring-2 focus:ring-wi-accent/40 transition-colors"
                />
                {provider === 'azure' && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      placeholder="Base URL"
                      value={config.providers?.[provider]?.baseURL || ''}
                      onChange={e => setProviderKey(provider, 'baseURL', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-wi-border rounded-lg bg-wi-input text-wi-text placeholder:text-wi-secondary focus:outline-none focus:ring-2 focus:ring-wi-accent/40 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Deployment ID"
                      value={config.providers?.[provider]?.deploymentId || ''}
                      onChange={e => setProviderKey(provider, 'deploymentId', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-wi-border rounded-lg bg-wi-input text-wi-text placeholder:text-wi-secondary focus:outline-none focus:ring-2 focus:ring-wi-accent/40 transition-colors"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Models Section */}
        <section className="bg-wi-surface border border-wi-border rounded-xl p-5">
          <SectionHeader title="Models" />
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-wi-secondary mb-1">Triage model</label>
              <ModelSelect
                provider={config.active_provider || 'anthropic'}
                value={config.triage_model || ''}
                onChange={v => handleModelChange('triage_model', v)}
              />
              <p className="text-[11px] text-wi-secondary mt-1.5">Fallbacks (up to 2):</p>
              {[0, 1].map(i => (
                <ModelSelect
                  key={i}
                  provider={config.active_provider || 'anthropic'}
                  value={triageFallbacks[i] || ''}
                  onChange={v => handleFallbackChange('triage_fallbacks', i, v)}
                  placeholder={`Fallback ${i + 1}`}
                />
              ))}
            </div>
            <div>
              <label className="block text-xs text-wi-secondary mb-1">Synthesis model</label>
              <ModelSelect
                provider={config.active_provider || 'anthropic'}
                value={config.synthesis_model || ''}
                onChange={v => handleModelChange('synthesis_model', v)}
              />
              <p className="text-[11px] text-wi-secondary mt-1.5">Fallbacks (up to 2):</p>
              {[0, 1].map(i => (
                <ModelSelect
                  key={i}
                  provider={config.active_provider || 'anthropic'}
                  value={synthFallbacks[i] || ''}
                  onChange={v => handleFallbackChange('synthesis_fallbacks', i, v)}
                  placeholder={`Fallback ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Schedule Section */}
        <section className="bg-wi-surface border border-wi-border rounded-xl p-5">
          <SectionHeader title="Schedule" />
          <label className="block text-xs text-wi-secondary mb-1.5">Run pipeline every N hours (1-24)</label>
          <input
            type="number"
            min={1}
            max={24}
            value={config.schedule_hours ?? 6}
            onChange={e => setConfigField('schedule_hours', parseInt(e.target.value, 10))}
            className="w-24 px-3 py-2 text-sm border border-wi-border rounded-lg bg-wi-input text-wi-text focus:outline-none focus:ring-2 focus:ring-wi-accent/40 transition-colors"
          />
        </section>

        {/* Categories Section */}
        <section className="bg-wi-surface border border-wi-border rounded-xl p-5">
          <SectionHeader title="Categories" />
          <div className="space-y-2">
            {Object.entries(categories).map(([name, cfg]) => (
              <div key={name} className="flex items-center gap-3 px-3 py-2.5 border border-wi-border rounded-lg hover:border-wi-accent/30 transition-colors">
                <input
                  type="checkbox"
                  id={`cat-${name}`}
                  checked={cfg.enabled}
                  onChange={e => setCategoryField(name, 'enabled', e.target.checked)}
                  className="h-4 w-4 rounded border-wi-border accent-wi-accent"
                />
                <label htmlFor={`cat-${name}`} className="flex-1 text-sm text-wi-text capitalize cursor-pointer">
                  {name.replace(/-/g, ' ')}
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-wi-secondary">Budget:</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={cfg.itemBudget}
                    onChange={e => setCategoryField(name, 'itemBudget', parseInt(e.target.value, 10))}
                    className="w-14 px-2 py-1 text-xs border border-wi-border rounded bg-wi-input text-wi-text focus:outline-none focus:ring-1 focus:ring-wi-accent/40"
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
            className="px-6 py-2.5 text-sm font-medium bg-wi-accent text-white rounded-lg hover:bg-wi-accent/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg.includes('success') ? 'text-wi-success' : 'text-wi-danger'}`}>
              {saveMsg}
            </span>
          )}
        </div>

      </div>
    </main>
  )
}
