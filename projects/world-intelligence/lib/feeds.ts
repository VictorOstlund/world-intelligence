import { XMLParser } from 'fast-xml-parser'

export interface FeedItem {
  title: string
  description: string
  url: string
  pubDate: string
  category: string
  fullText?: string
}

const DEFAULT_ITEM_BUDGET = 15

// In-memory cache for the feed list
let _feedListCache: Record<string, string[]> | null = null
let _feedListCachedAt = 0
const FEED_LIST_TTL_MS = 60 * 60 * 1000 // 1 hour

// Hardcoded fallback feeds per category (5 per category minimum)
const FALLBACK_FEEDS: Record<string, string[]> = {
  geopolitics: [
    'https://foreignpolicy.com/feed/',
    'https://www.cfr.org/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://rss.dw.com/rdf/rss-en-world',
    'https://feeds.bbci.co.uk/news/world/rss.xml',
  ],
  economics: [
    'https://www.economist.com/rss/the_world_this_week_rss.xml',
    'https://feeds.reuters.com/reuters/businessNews',
    'https://www.project-syndicate.org/rss',
    'https://feeds.ft.com/rss/home/uk',
    'https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml',
  ],
  technology: [
    'https://www.wired.com/feed/rss',
    'https://techcrunch.com/feed/',
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://www.theverge.com/rss/index.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
  ],
  climate: [
    'https://www.climatechangenews.com/feed/',
    'https://insideclimatenews.org/feed/',
    'https://www.carbonbrief.org/feed',
    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    'https://www.theguardian.com/environment/climate-crisis/rss',
  ],
  energy: [
    'https://www.energymonitor.ai/feed/',
    'https://oilprice.com/rss/main',
    'https://www.renewableenergyworld.com/feed/',
    'https://energynews.us/feed/',
    'https://www.iea.org/rss',
  ],
  defense: [
    'https://www.defenseone.com/rss/all/',
    'https://warontherocks.com/feed/',
    'https://breakingdefense.com/feed/',
    'https://www.defensenews.com/arc/outboundfeeds/rss/',
    'https://taskandpurpose.com/feed/',
  ],
  finance: [
    'https://feeds.reuters.com/reuters/financialsNews',
    'https://www.ft.com/markets?format=rss',
    'https://feeds.bloomberg.com/markets/news.rss',
    'https://www.marketwatch.com/rss/topstories',
    'https://feeds.wsj.com/xml/rss/3_7031.xml',
  ],
  health: [
    'https://www.statnews.com/feed/',
    'https://www.fiercehealthcare.com/rss/xml',
    'https://feeds.reuters.com/reuters/healthNews',
    'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
    'https://feeds.bbci.co.uk/news/health/rss.xml',
  ],
  science: [
    'https://www.nature.com/nature.rss',
    'https://www.sciencemag.org/rss/news_current.xml',
    'https://feeds.newscientist.com/full-feed',
    'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  ],
  society: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://www.theguardian.com/world/rss',
    'https://feeds.reuters.com/reuters/worldNews',
  ],
  media: [
    'https://www.niemanlab.org/feed/',
    'https://pressgazette.co.uk/feed/',
    'https://www.poynter.org/feed/',
    'https://mediabriefing.com/feed/',
    'https://www.journalism.co.uk/rss/',
  ],
  conflict: [
    'https://acleddata.com/feed/',
    'https://www.crisisgroup.org/rss.xml',
    'https://reliefweb.int/headlines/rss.xml',
    'https://feeds.reuters.com/reuters/worldNews',
    'https://www.aljazeera.com/xml/rss/all.xml',
  ],
  trade: [
    'https://feeds.reuters.com/reuters/businessNews',
    'https://www.wto.org/english/news_e/rss_e/rss_e.htm',
    'https://www.ft.com/global-economy?format=rss',
    'https://www.tradefinanceglobal.com/feed/',
    'https://supplychainbrain.com/rss/news',
  ],
  infrastructure: [
    'https://www.constructionmanagermagazine.com/feed/',
    'https://www.infrastructureintelligence.com/rss.xml',
    'https://feeds.reuters.com/reuters/businessNews',
    'https://www.globalconstructionreview.com/feed/',
    'https://www.enr.com/rss/all',
  ],
  'emerging-markets': [
    'https://feeds.reuters.com/reuters/emergingMarketsNews',
    'https://feeds.bloomberg.com/economics/news.rss',
    'https://www.ft.com/emerging-markets?format=rss',
    'https://www.africareport.com/feed/',
    'https://latamreports.com/feed/',
  ],
}

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: false,
})

/**
 * Pure function: parse RSS or Atom XML into FeedItems.
 * Deduplicates by URL. Respects itemBudget.
 */
export function parseRssFeed(xml: string, category: string, itemBudget: number = DEFAULT_ITEM_BUDGET): FeedItem[] {
  if (!xml || !xml.trim()) return []

  let parsed: any
  try {
    parsed = XML_PARSER.parse(xml)
  } catch {
    return []
  }

  const items: FeedItem[] = []

  // RSS 2.0
  const channel = parsed?.rss?.channel
  if (channel) {
    const rssItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : []
    for (const item of rssItems) {
      const url = item.link || item.guid || ''
      if (!url) continue
      items.push({
        title: stripTags(String(item.title || '')),
        description: stripTags(String(item.description || '')),
        url: String(url).trim(),
        pubDate: String(item.pubDate || item.dc?.date || ''),
        category,
      })
    }
  }

  // Atom feed
  const feed = parsed?.feed
  if (feed) {
    const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : []
    for (const entry of entries) {
      let url = ''
      if (entry.link) {
        if (typeof entry.link === 'string') url = entry.link
        else if (entry.link['@_href']) url = entry.link['@_href']
        else if (Array.isArray(entry.link)) {
          const alternate = entry.link.find((l: any) => !l['@_rel'] || l['@_rel'] === 'alternate')
          url = alternate?.['@_href'] || entry.link[0]?.['@_href'] || ''
        }
      }
      if (!url) continue
      items.push({
        title: stripTags(String(entry.title || '')),
        description: stripTags(String(entry.summary || entry.content || '')),
        url: String(url).trim(),
        pubDate: String(entry.updated || entry.published || ''),
        category,
      })
    }
  }

  if (items.length === 0) return []

  // Deduplicate by URL
  const seen = new Set<string>()
  const deduped = items.filter(item => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })

  return deduped.slice(0, itemBudget)
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

/**
 * Fetches the curated feed list from worldmonitor GitHub.
 * Falls back to hardcoded feeds if GitHub is unavailable.
 * Caches result in memory with 1h TTL.
 */
export async function loadFeedList(): Promise<Record<string, string[]>> {
  const now = Date.now()
  if (_feedListCache && now - _feedListCachedAt < FEED_LIST_TTL_MS) {
    return _feedListCache
  }

  try {
    const res = await fetch('https://raw.githubusercontent.com/worldmonitor/worldmonitor/main/feeds.json', {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as Record<string, string[]>
    if (typeof data === 'object' && data !== null) {
      _feedListCache = data
      _feedListCachedAt = now
      return data
    }
    throw new Error('Unexpected feed list format')
  } catch {
    // Return fallback feeds (always fresh — no TTL needed for hardcoded data)
    return FALLBACK_FEEDS
  }
}

/**
 * Fetches all RSS feeds for a category in parallel, merges, deduplicates, and returns top N by recency.
 */
export async function fetchCategory(
  category: string,
  feeds: string[],
  itemBudget: number = DEFAULT_ITEM_BUDGET
): Promise<FeedItem[]> {
  const results = await Promise.allSettled(
    feeds.map(url => fetchOneFeed(url, category))
  )

  const allItems: FeedItem[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value)
    }
  }

  // Deduplicate by URL across all feeds
  const seen = new Set<string>()
  const deduped = allItems.filter(item => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })

  // Sort by recency (most recent first)
  deduped.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0
    return db - da
  })

  return deduped.slice(0, itemBudget)
}

async function fetchOneFeed(url: string, category: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'world-intelligence/1.0 (news aggregator)' },
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRssFeed(xml, category)
  } catch {
    return []
  }
}

/**
 * Fetches full article text for high-scored items (score ≥8).
 * Returns plain text with HTML tags stripped.
 */
export async function fetchFullArticle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'world-intelligence/1.0 (news aggregator)' },
    })
    if (!res.ok) return null
    const html = await res.text()
    // Basic extraction: strip tags, collapse whitespace
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    return text || null
  } catch {
    return null
  }
}
