import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'

describe('Markdown rendering in report viewer', () => {
  it('renders ## headings as <h2> elements', async () => {
    const ReactMarkdown = (await import('react-markdown')).default
    const md = '## Executive Summary'
    const html = renderToString(React.createElement(ReactMarkdown, null, md))
    expect(html).toContain('<h2>')
    expect(html).toContain('Executive Summary')
    expect(html).not.toMatch(/(?<![<\w])##\s/)
  })

  it('renders **bold** as <strong> elements', async () => {
    const ReactMarkdown = (await import('react-markdown')).default
    const md = 'This is **important** text'
    const html = renderToString(React.createElement(ReactMarkdown, null, md))
    expect(html).toContain('<strong>')
    expect(html).toContain('important')
    expect(html).not.toContain('**important**')
  })

  it('renders bullet lists as <ul>/<li> elements', async () => {
    const ReactMarkdown = (await import('react-markdown')).default
    const md = '- Item one\n- Item two\n- Item three'
    const html = renderToString(React.createElement(ReactMarkdown, null, md))
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html).toContain('Item one')
    expect(html).toContain('Item two')
  })

  it('renders tables with remark-gfm plugin', async () => {
    const ReactMarkdown = (await import('react-markdown')).default
    const remarkGfm = (await import('remark-gfm')).default
    const md = '| Col A | Col B |\n|-------|-------|\n| val1  | val2  |'
    const html = renderToString(
      React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, md)
    )
    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect(html).toContain('Col A')
    expect(html).toContain('val1')
  })

  it('renders code blocks as <code> elements', async () => {
    const ReactMarkdown = (await import('react-markdown')).default
    const md = '```\nconsole.log("hello")\n```'
    const html = renderToString(React.createElement(ReactMarkdown, null, md))
    expect(html).toContain('<code')
    expect(html).toContain('console.log')
    expect(html).not.toContain('```')
  })

  it('renders a full report body with all section types', async () => {
    const ReactMarkdown = (await import('react-markdown')).default
    const remarkGfm = (await import('remark-gfm')).default
    const md = [
      '## Executive Summary',
      'Global markets showed **significant volatility** this week.',
      '',
      '## Key Themes & Patterns',
      '- Rising interest rates',
      '- Energy sector disruption',
      '',
      '## Critical Events',
      '| Event | Priority |',
      '|-------|----------|',
      '| Rate hike | HIGH |',
    ].join('\n')

    const html = renderToString(
      React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, md)
    )

    // Proper HTML rendering
    expect(html).toContain('<h2>')
    expect(html).toContain('<strong>')
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html).toContain('<table')

    // No raw markdown syntax visible
    expect(html).not.toMatch(/(?<![<\w])##\s/)
    expect(html).not.toContain('**significant volatility**')
    expect(html).toContain('significant volatility')
  })
})
