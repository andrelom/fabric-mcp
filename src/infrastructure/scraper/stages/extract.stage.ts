import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { JSDOM } from 'jsdom'
import type { ExtractionConfig } from '../../../core/provider.js'
import type { RawPage, ExtractedPage, Heading } from '../../../core/types.js'

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  td.use(gfm)

  // Remove "Defined in:" lines (TypeDoc noise) — harmless for non-TypeDoc sites
  td.addRule('removeDefinedIn', {
    filter: (node) => {
      if (node.nodeName === 'P') {
        const text = node.textContent ?? ''
        return text.startsWith('Defined in:')
      }
      return false
    },
    replacement: () => '',
  })

  return td
}

function makeLinksAbsolute(html: string, baseUrl: string): string {
  return html.replace(/href="\/([^"]*?)"/g, `href="${baseUrl}/$1"`)
}

function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  const re = /^(#{1,4})\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown)) !== null) {
    if (!match[1] || !match[2]) continue
    const level = match[1].length
    const text = match[2].trim()
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
    headings.push({ level, text, id })
  }
  return headings
}

/**
 * Converts a raw HTML page into structured Markdown.
 *
 * Uses the provider's {@link ExtractionConfig} to determine which DOM
 * element holds the main content, how to resolve relative links, and
 * how to classify the page's section.
 */
export function extractStage(raw: RawPage, extraction: ExtractionConfig): ExtractedPage {
  const dom = new JSDOM(raw.html)
  const doc = dom.window.document

  // Extract main content using the provider's CSS selector
  const contentEl = doc.querySelector(extraction.contentSelector)
  const contentHtml = contentEl ? contentEl.innerHTML : doc.body.innerHTML

  // Make relative links absolute
  const absoluteHtml = makeLinksAbsolute(contentHtml, extraction.baseUrl)

  // Convert to Markdown
  const td = createTurndown()
  const markdown = td.turndown(absoluteHtml)

  // Extract title
  const h1 = doc.querySelector('h1[id="_top"]')
  const titleEl = doc.querySelector('title')
  const title = h1?.textContent?.trim() ?? titleEl?.textContent?.trim() ?? 'Untitled'

  // Extract headings from markdown
  const headings = extractHeadings(markdown)

  // Detect section via provider callback
  const section = extraction.detectSection(raw.url)

  return {
    url: raw.url,
    title,
    section,
    markdown,
    headings,
    fetchedAt: raw.fetchedAt,
  }
}
