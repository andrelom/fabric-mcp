import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { JSDOM } from 'jsdom'
import { config } from '../../../shared/config.js'
import type { RawPage, ExtractedPage, Heading, Section } from '../../../shared/types.js'

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  td.use(gfm)

  // Remove "Defined in:" lines (TypeDoc noise)
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

function detectSection(url: string): Section {
  if (url.includes('/api/')) return 'api'
  return 'docs'
}

function makeLinksAbsolute(html: string): string {
  return html.replace(/href="\/([^"]*?)"/g, `href="${config.fabricjs.baseUrl}/$1"`)
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

export function extractStage(raw: RawPage): ExtractedPage {
  const dom = new JSDOM(raw.html)
  const doc = dom.window.document

  // Extract main content
  const contentEl = doc.querySelector('div.sl-markdown-content')
  const contentHtml = contentEl ? contentEl.innerHTML : doc.body.innerHTML

  // Make relative links absolute
  const absoluteHtml = makeLinksAbsolute(contentHtml)

  // Convert to Markdown
  const td = createTurndown()
  const markdown = td.turndown(absoluteHtml)

  // Extract title
  const h1 = doc.querySelector('h1[id="_top"]')
  const titleEl = doc.querySelector('title')
  const title = h1?.textContent?.trim() ?? titleEl?.textContent?.trim() ?? 'Untitled'

  // Extract headings from markdown
  const headings = extractHeadings(markdown)

  // Detect section
  const section = detectSection(raw.url)

  return {
    url: raw.url,
    title,
    section,
    markdown,
    headings,
    fetchedAt: raw.fetchedAt,
  }
}
