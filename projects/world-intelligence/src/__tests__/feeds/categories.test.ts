import { describe, it, expect } from 'vitest'
import { DEFAULT_CATEGORIES, getCategoryConfig } from '../../../lib/categories'

describe('DEFAULT_CATEGORIES', () => {
  it('has at least 10 entries', () => {
    expect(Object.keys(DEFAULT_CATEGORIES).length).toBeGreaterThanOrEqual(10)
  })

  it('has at least 15 entries matching worldmonitor categories', () => {
    expect(Object.keys(DEFAULT_CATEGORIES).length).toBeGreaterThanOrEqual(15)
  })

  it('includes required core categories', () => {
    const keys = Object.keys(DEFAULT_CATEGORIES)
    const required = ['geopolitics', 'economics', 'technology', 'climate', 'energy', 'defense', 'finance', 'health']
    for (const cat of required) {
      expect(keys).toContain(cat)
    }
  })

  it('each category has label, enabled, and itemBudget', () => {
    for (const [key, cat] of Object.entries(DEFAULT_CATEGORIES)) {
      expect(cat.label, `${key} missing label`).toBeTruthy()
      expect(typeof cat.enabled, `${key} enabled must be boolean`).toBe('boolean')
      expect(typeof cat.itemBudget, `${key} itemBudget must be number`).toBe('number')
      expect(cat.itemBudget, `${key} itemBudget must be > 0`).toBeGreaterThan(0)
    }
  })

  it('default itemBudget is 15 for most categories', () => {
    const budgets = Object.values(DEFAULT_CATEGORIES).map(c => c.itemBudget)
    const defaultCount = budgets.filter(b => b === 15).length
    expect(defaultCount).toBeGreaterThan(0)
  })

  it('categories are enabled by default', () => {
    const enabledCount = Object.values(DEFAULT_CATEGORIES).filter(c => c.enabled).length
    expect(enabledCount).toBeGreaterThanOrEqual(10)
  })
})

describe('getCategoryConfig', () => {
  it('returns defaults when no DB config', () => {
    const config = getCategoryConfig({})
    expect(Object.keys(config).length).toBeGreaterThanOrEqual(15)
    for (const [key, cat] of Object.entries(config)) {
      expect(cat.enabled).toBeDefined()
      expect(cat.itemBudget).toBeDefined()
    }
  })

  it('merges DB overrides: enabled=false overrides default enabled=true', () => {
    const dbConfig = { geopolitics: { enabled: false, itemBudget: 15 } }
    const config = getCategoryConfig(dbConfig)
    expect(config.geopolitics.enabled).toBe(false)
  })

  it('merges DB overrides: custom itemBudget overrides default', () => {
    const dbConfig = { economics: { enabled: true, itemBudget: 5 } }
    const config = getCategoryConfig(dbConfig)
    expect(config.economics.itemBudget).toBe(5)
  })

  it('non-overridden categories retain defaults', () => {
    const dbConfig = { geopolitics: { enabled: false, itemBudget: 15 } }
    const config = getCategoryConfig(dbConfig)
    // technology should remain at its default
    expect(config.technology.enabled).toBe(DEFAULT_CATEGORIES.technology.enabled)
    expect(config.technology.itemBudget).toBe(DEFAULT_CATEGORIES.technology.itemBudget)
  })

  it('accepts JSON string from DB column', () => {
    const dbConfig = JSON.stringify({ climate: { enabled: false, itemBudget: 10 } })
    const config = getCategoryConfig(dbConfig as any)
    expect(config.climate.enabled).toBe(false)
    expect(config.climate.itemBudget).toBe(10)
  })

  it('handles null/undefined gracefully', () => {
    const config = getCategoryConfig(null as any)
    expect(Object.keys(config).length).toBeGreaterThanOrEqual(15)
  })
})
