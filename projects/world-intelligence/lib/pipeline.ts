/**
 * Two-tier pipeline: per-category triage (cheap model) → synthesis (premium model).
 * Triage scores items, fetches full article for high-importance items.
 * Synthesis writes markdown report and tracks cost.
 */

import { callLLM, estimateCost, type LLMConfig, type FallbackModel } from './llm'
import { fetchFullArticle, fetchCategory, loadFeedList, type FeedItem } from './feeds'
import { getConfig, getActiveCategoryConfig, saveReport, markArticlesSeen, filterSeenUrls, type Report } from './db'

export interface ScoredItem extends FeedItem {
  relevanceScore: number
  noveltyScore: number
  importanceScore: number
  contrarian_signal?: boolean
}

function extractJson(text: string): unknown {
  // Strip markdown code block if present
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = match ? match[1].trim() : text.trim()
  return JSON.parse(raw)
}

/**
 * Truncate to first complete report if LLM repeats the report multiple times.
 */
function truncateToFirstReport(text: string): string {
  const heading = '# World Intelligence Report'
  const first = text.indexOf(heading)
  if (first === -1) return text
  const second = text.indexOf(heading, first + heading.length)
  if (second === -1) return text
  return text.slice(0, second).trim()
}

/**
 * Format a pubDate string to a readable UTC format.
 */
function formatPubDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw || 'Unknown date'
  return d.toUTCString().replace(' GMT', ' UTC')
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
Also flag contrarian_signal: true if the item presents a view that contradicts mainstream coverage, highlights something major outlets are underweighting, or reveals a notable silence/gap in coverage.
Return ONLY a JSON array with objects: { url, relevanceScore, noveltyScore, importanceScore, contrarian_signal }.
No explanations, no markdown, just the JSON array.

Items:
${items.map(i => `- url: ${i.url}\n  title: ${i.title}\n  published: ${formatPubDate(i.pubDate)}\n  description: ${i.description}`).join('\n\n')}`

  let result
  try {
    result = await callLLM(prompt, config)
  } catch {
    return []
  }

  let parsed: Array<{ url: string; relevanceScore: number; noveltyScore: number; importanceScore: number; contrarian_signal?: boolean }>
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
      contrarian_signal: s.contrarian_signal ?? false,
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
  const categories = [...new Set(scoredItems.map(i => i.category))].filter(Boolean)
  const contrarianItems = scoredItems.filter(i => i.contrarian_signal)

  const prompt = `You are a world intelligence analyst. Write a factual, analytical report.
This report is used for daily briefings — it must be structured, factual, and actionable.

Write a comprehensive markdown report covering today's most important global events using the pre-scored news items below.

**Report header** (include at the top, before the first section):
# World Intelligence Report — ${new Date().toISOString().split('T')[0]}
**Categories covered:** ${categories.join(', ')} (${categories.length} total) | **Articles reviewed:** ${scoredItems.length} items

**You MUST include all 6 sections in exactly this order. Use these exact numbered ## headings:**

## 1. Executive Summary
3-5 sentences synthesizing the most significant developments across all categories.

## 2. Key Themes & Patterns
Cross-category synthesis — identify threads connecting events across different categories. Not just per-category recap.

## 3. Critical Events
Priority-flagged events. Mark each as **HIGH** or **MEDIUM** priority. For every article you reference, include a [Source](url) citation with the actual article URL.

## 4. Opportunities
Forward-looking observations — emerging trends, strategic implications, sectors to watch. Be specific.

## 5. Contrarian Angles
What major outlets are underweighting or missing entirely.${contrarianItems.length > 0 ? `\nItems flagged as contrarian by triage: ${contrarianItems.map(i => `"${i.title}"`).join(', ')}` : ''}

## 6. Coverage Gaps
Topics that should have news but don't — notable silences. What's NOT being covered that matters.

Write the complete report exactly once. After ## 6. Coverage Gaps, stop. Do not repeat, summarise, or re-state content after the final section.

**Source items:**
${scoredItems.map(i =>
  `### ${i.title} [${i.category}]${i.contrarian_signal ? ' 🔄 CONTRARIAN' : ''}\nURL: ${i.url}\nPublished: ${formatPubDate(i.pubDate)}\nImportance: ${i.importanceScore}/10\n${i.fullText || i.description}`
).join('\n\n')}

For every article you reference, include a [Source](url) citation with the actual article URL.
Keep it factual and analytical. Every claim must be traceable to a source item.`

  const result = await callLLM(prompt, config)
  const body = truncateToFirstReport(result.text)

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

  // Intra-run URL dedup: remove duplicate URLs within this single run (no DB side effects)
  const seenUrls = new Set<string>()
  const uniqueItems = allScoredItems.filter(item => {
    if (!item.url || seenUrls.has(item.url)) return false
    seenUrls.add(item.url)
    return true
  })

  // Cross-run dedup: filter out articles already seen in previous reports
  const dedupedItems = await filterSeenUrls(uniqueItems)

  const itemCount = dedupedItems.length
  const sourceCount = enabledCategories.length

  const { body, summary, costUsd } = await synthesizeReport(dedupedItems, synthesisConfig)

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

  // Mark all included article URLs as seen for future dedup
  const articleUrls = dedupedItems.map(i => i.url).filter(Boolean)
  await markArticlesSeen(articleUrls, reportId)

  return { reportId, costUsd, itemCount, sourceCount }
}
