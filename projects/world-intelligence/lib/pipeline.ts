/**
 * Two-tier pipeline: per-category triage (cheap model) → synthesis (premium model).
 * Triage scores items, fetches full article for high-importance items.
 * Synthesis writes markdown report and tracks cost.
 */

import { callLLM, estimateCost, type LLMConfig, type FallbackModel } from './llm'
import { fetchFullArticle, fetchCategory, loadFeedList, type FeedItem } from './feeds'
import { getConfig, getActiveCategoryConfig, saveReport, type Report } from './db'

export interface ScoredItem extends FeedItem {
  relevanceScore: number
  noveltyScore: number
  importanceScore: number
}

function extractJson(text: string): unknown {
  // Strip markdown code block if present
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = match ? match[1].trim() : text.trim()
  return JSON.parse(raw)
}

/**
 * Triage a category: score items using cheap model, fetch full article for score >= 8.
 */
export async function triageCategory(
  category: string,
  items: FeedItem[],
  config: LLMConfig,
  itemBudget = 15,
): Promise<ScoredItem[]> {
  if (items.length === 0) return []

  const prompt = `You are a news triage agent for the "${category}" category.
Score each item below for relevance (to ${category}), novelty, and importance (each 0-10).
Return ONLY a JSON array with objects: { url, relevanceScore, noveltyScore, importanceScore }.
No explanations, no markdown, just the JSON array.

Items:
${items.map(i => `- url: ${i.url}\n  title: ${i.title}\n  description: ${i.description}`).join('\n\n')}`

  let result
  try {
    result = await callLLM(prompt, config)
  } catch {
    return []
  }

  let parsed: Array<{ url: string; relevanceScore: number; noveltyScore: number; importanceScore: number }>
  try {
    parsed = extractJson(result.text) as typeof parsed
    if (!Array.isArray(parsed)) return []
  } catch {
    return []
  }

  // Merge scores onto original FeedItems
  const urlMap = new Map(items.map(i => [i.url, i]))
  const scored: ScoredItem[] = []
  for (const s of parsed) {
    const item = urlMap.get(s.url)
    if (!item) continue
    scored.push({
      ...item,
      relevanceScore: s.relevanceScore ?? 0,
      noveltyScore: s.noveltyScore ?? 0,
      importanceScore: s.importanceScore ?? 0,
    })
  }

  // Fetch full article for high-importance items
  const highImportance = scored.filter(i => i.importanceScore >= 8)
  await Promise.all(
    highImportance.map(async item => {
      try {
        item.fullText = await fetchFullArticle(item.url) ?? undefined
      } catch {
        // Best-effort
      }
    })
  )

  // Sort by importanceScore desc, apply budget
  scored.sort((a, b) => b.importanceScore - a.importanceScore)
  return scored.slice(0, itemBudget)
}

/**
 * Synthesize a full markdown report from all scored items.
 * Returns body, summary (first paragraph or Summary section), and costUsd.
 */
export async function synthesizeReport(
  scoredItems: ScoredItem[],
  config: LLMConfig,
): Promise<{ body: string; summary: string; costUsd: number }> {
  const prompt = `You are a world intelligence analyst. Write a comprehensive markdown report covering today's most important global events.
Use the following pre-scored news items as your source material.

Items:
${scoredItems.map(i =>
  `### ${i.title} [${i.category}]\nURL: ${i.url}\nImportance: ${i.importanceScore}/10\n${i.fullText || i.description}`
).join('\n\n')}

Write a structured markdown report with:
1. A "# World Intelligence Report" heading with today's date
2. An "## Executive Summary" section (2-3 sentences)
3. Sections per category for notable events
4. Keep it factual and analytical.`

  const result = await callLLM(prompt, config)
  const body = result.text

  // Extract summary from ## Executive Summary / ## Summary section, or first paragraph
  let summary = ''
  const summaryMatch = body.match(/##\s+(?:Executive\s+)?Summary\s*\n+([\s\S]*?)(?=\n##|\n#|$)/i)
  if (summaryMatch) {
    summary = summaryMatch[1].trim().split('\n\n')[0].trim()
  } else {
    // First non-heading paragraph
    const paragraphs = body.split('\n\n').filter(p => p.trim() && !p.trim().startsWith('#'))
    summary = paragraphs[0]?.trim() || body.slice(0, 200).trim()
  }

  const costUsd = estimateCost(config.provider, config.model, result.inputTokens, result.outputTokens)

  return { body, summary, costUsd }
}

function buildLLMConfig(config: Record<string, unknown>, modelKey: 'triage_model' | 'synthesis_model', fallbacksKey: 'triage_fallbacks' | 'synthesis_fallbacks'): LLMConfig {
  let providers: Record<string, { apiKey?: string; baseURL?: string; deploymentId?: string }> = {}
  try {
    const raw = config.providers
    providers = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof providers) || {}
  } catch {
    providers = {}
  }

  const activeProvider = (config.active_provider as string) || 'anthropic'
  const model = (config[modelKey] as string) || 'gemini-1.5-flash-8b'
  const providerCreds = providers[activeProvider] || {}

  let fallbacks: FallbackModel[] = []
  try {
    const raw = config[fallbacksKey]
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw as FallbackModel[]) || []
    if (Array.isArray(parsed)) {
      fallbacks = parsed.map((f: any) => {
        const creds = providers[f.provider] || {}
        return {
          provider: f.provider,
          model: f.model,
          apiKey: creds.apiKey || '',
          baseURL: creds.baseURL,
          deploymentId: creds.deploymentId,
        }
      })
    }
  } catch {
    fallbacks = []
  }

  return {
    provider: activeProvider,
    model,
    apiKey: providerCreds.apiKey || '',
    baseURL: providerCreds.baseURL,
    deploymentId: providerCreds.deploymentId,
    fallbacks,
  }
}

export interface PipelineResult {
  reportId: string
  costUsd: number
  itemCount: number
  sourceCount: number
}

/**
 * Run the full two-tier pipeline:
 * - Reads config + active categories from DB
 * - Fetches RSS feeds per category
 * - Triages each category in parallel
 * - Synthesizes report
 * - Saves to DB
 */
export async function runPipeline(): Promise<PipelineResult> {
  const config = await getConfig() as Record<string, unknown>
  const categoryConfig = await getActiveCategoryConfig()

  const triageConfig = buildLLMConfig(config, 'triage_model', 'triage_fallbacks')
  const synthesisConfig = buildLLMConfig(config, 'synthesis_model', 'synthesis_fallbacks')

  const enabledCategories = Object.entries(categoryConfig)
    .filter(([, cfg]) => cfg.enabled)
    .map(([name, cfg]) => ({ name, itemBudget: cfg.itemBudget }))

  // Load feed URLs per category (uses cache, falls back to hardcoded feeds)
  const feedList = await loadFeedList()

  // Fetch + triage all enabled categories in parallel
  const categoryResults = await Promise.all(
    enabledCategories.map(async ({ name, itemBudget }) => {
      try {
        const feeds = feedList[name] || []
        const items = await fetchCategory(name, feeds, itemBudget)
        const scored = await triageCategory(name, items, triageConfig, itemBudget)
        return scored
      } catch {
        return []
      }
    })
  )

  const allScoredItems = categoryResults.flat()
  const itemCount = allScoredItems.length
  const sourceCount = enabledCategories.length

  const { body, summary, costUsd } = await synthesizeReport(allScoredItems, synthesisConfig)

  const { v4: uuidv4 } = await import('uuid')
  const reportId = uuidv4()
  const enabledCategoryNames = enabledCategories.map(c => c.name)

  const report: Report = {
    id: reportId,
    created_at: Date.now(),
    schedule: `${(config.schedule_hours as number) || 6}h`,
    categories: JSON.stringify(enabledCategoryNames),
    summary,
    body,
    cost_usd: costUsd,
    triage_model: triageConfig.model,
    synthesis_model: synthesisConfig.model,
    item_count: itemCount,
    source_count: sourceCount,
  }

  await saveReport(report)

  return { reportId, costUsd, itemCount, sourceCount }
}
