export interface CategoryMeta {
  label: string
  enabled: boolean
  itemBudget: number
}

export type CategoryConfig = Record<string, { enabled: boolean; itemBudget: number }>

export const DEFAULT_CATEGORIES: Record<string, CategoryMeta> = {
  geopolitics: { label: 'Geopolitics', enabled: true, itemBudget: 15 },
  economics: { label: 'Economics', enabled: true, itemBudget: 15 },
  technology: { label: 'Technology', enabled: true, itemBudget: 15 },
  climate: { label: 'Climate & Environment', enabled: true, itemBudget: 15 },
  energy: { label: 'Energy', enabled: true, itemBudget: 15 },
  defense: { label: 'Defense & Security', enabled: true, itemBudget: 15 },
  finance: { label: 'Finance & Markets', enabled: true, itemBudget: 15 },
  health: { label: 'Health', enabled: true, itemBudget: 15 },
  science: { label: 'Science', enabled: true, itemBudget: 15 },
  society: { label: 'Society & Politics', enabled: true, itemBudget: 15 },
  media: { label: 'Media', enabled: false, itemBudget: 15 },
  conflict: { label: 'Conflict & Crisis', enabled: true, itemBudget: 15 },
  trade: { label: 'Trade & Supply Chain', enabled: true, itemBudget: 15 },
  infrastructure: { label: 'Infrastructure', enabled: false, itemBudget: 15 },
  'emerging-markets': { label: 'Emerging Markets', enabled: true, itemBudget: 15 },
}

/**
 * Merges stored DB config with defaults. DB wins on enabled/budget.
 * Accepts either a parsed object or a JSON string (as stored in SQLite).
 */
export function getCategoryConfig(dbConfig: CategoryConfig | string | null | undefined): CategoryConfig {
  let parsed: Partial<CategoryConfig> = {}

  if (typeof dbConfig === 'string') {
    try {
      parsed = JSON.parse(dbConfig)
    } catch {
      parsed = {}
    }
  } else if (dbConfig && typeof dbConfig === 'object') {
    parsed = dbConfig
  }

  const result: CategoryConfig = {}
  for (const [key, meta] of Object.entries(DEFAULT_CATEGORIES)) {
    const override = parsed[key]
    result[key] = {
      enabled: override?.enabled !== undefined ? override.enabled : meta.enabled,
      itemBudget: override?.itemBudget !== undefined ? override.itemBudget : meta.itemBudget,
    }
  }
  return result
}
