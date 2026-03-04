import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseRssFeed, FeedItem } from '../../../lib/feeds'

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test News</title>
    <link>https://example.com</link>
    <description>Test RSS feed</description>
    <item>
      <title>Breaking: Major Event Happens</title>
      <link>https://example.com/story1</link>
      <description>A major event has occurred today in a significant region.</description>
      <pubDate>Wed, 04 Mar 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second Story: Economic Data Released</title>
      <link>https://example.com/story2</link>
      <description>New economic indicators show growth.</description>
      <pubDate>Wed, 04 Mar 2026 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Third Story: Technology Advances</title>
      <link>https://example.com/story3</link>
      <description>Tech company announces new product.</description>
      <pubDate>Wed, 04 Mar 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

const RSS_WITH_DUPLICATES = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test News</title>
    <item>
      <title>Unique Story</title>
      <link>https://example.com/unique</link>
      <description>Unique content</description>
      <pubDate>Wed, 04 Mar 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Duplicate Story</title>
      <link>https://example.com/duplicate</link>
      <description>First occurrence</description>
      <pubDate>Wed, 04 Mar 2026 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Duplicate Story Again</title>
      <link>https://example.com/duplicate</link>
      <description>Second occurrence (same URL)</description>
      <pubDate>Wed, 04 Mar 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://example.com/atom1"/>
    <summary>Summary of atom entry one</summary>
    <updated>2026-03-04T10:00:00Z</updated>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://example.com/atom2"/>
    <summary>Summary of atom entry two</summary>
    <updated>2026-03-04T09:00:00Z</updated>
  </entry>
</feed>`

describe('parseRssFeed', () => {
  it('extracts title, description, url, pubDate from RSS items', () => {
    const items = parseRssFeed(SAMPLE_RSS, 'geopolitics')
    expect(items.length).toBeGreaterThanOrEqual(1)
    const item = items[0]
    expect(item.title).toBeTruthy()
    expect(item.description).toBeTruthy()
    expect(item.url).toBeTruthy()
    expect(item.category).toBe('geopolitics')
  })

  it('extracts all 3 items from sample RSS', () => {
    const items = parseRssFeed(SAMPLE_RSS, 'geopolitics')
    expect(items).toHaveLength(3)
  })

  it('extracts correct title and url for first item', () => {
    const items = parseRssFeed(SAMPLE_RSS, 'geopolitics')
    expect(items[0].title).toBe('Breaking: Major Event Happens')
    expect(items[0].url).toBe('https://example.com/story1')
    expect(items[0].description).toContain('major event')
  })

  it('deduplicates items by URL', () => {
    const items = parseRssFeed(RSS_WITH_DUPLICATES, 'economics')
    const urls = items.map(i => i.url)
    const uniqueUrls = new Set(urls)
    expect(urls.length).toBe(uniqueUrls.size)
    expect(items).toHaveLength(2) // 3 items, 1 duplicate removed
  })

  it('handles Atom feeds', () => {
    const items = parseRssFeed(ATOM_FEED, 'technology')
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].url).toBeTruthy()
    expect(items[0].title).toBeTruthy()
    expect(items[0].category).toBe('technology')
  })

  it('returns empty array for invalid XML', () => {
    const items = parseRssFeed('not xml at all!!!', 'geopolitics')
    expect(items).toEqual([])
  })

  it('returns empty array for empty string', () => {
    const items = parseRssFeed('', 'geopolitics')
    expect(items).toEqual([])
  })

  it('sets category on all items', () => {
    const items = parseRssFeed(SAMPLE_RSS, 'climate')
    expect(items.every(i => i.category === 'climate')).toBe(true)
  })

  it('fullText is undefined by default', () => {
    const items = parseRssFeed(SAMPLE_RSS, 'geopolitics')
    expect(items.every(i => i.fullText === undefined)).toBe(true)
  })
})

describe('item budget truncation', () => {
  it('respects item budget when more items exist', () => {
    const items = parseRssFeed(SAMPLE_RSS, 'geopolitics', 2)
    expect(items).toHaveLength(2)
  })

  it('returns all items when budget exceeds feed size', () => {
    const items = parseRssFeed(SAMPLE_RSS, 'geopolitics', 100)
    expect(items).toHaveLength(3)
  })

  it('default budget is applied when not specified', () => {
    const items = parseRssFeed(SAMPLE_RSS, 'geopolitics')
    expect(items.length).toBeLessThanOrEqual(15) // default budget
  })
})
