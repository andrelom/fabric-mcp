import { z } from 'zod'
import type { FastMCP } from 'fastmcp'
import type { ProviderServices } from '../../core/provider.js'
import { KNOWN_CLASSES, buildApiUrl } from './fabricjs.config.js'

/**
 * Generates a Table of Contents from level-2 Markdown headings.
 */
function buildToc(markdown: string): string {
  const lines = markdown.split('\n')
  const tocEntries: string[] = []
  for (const line of lines) {
    const match = line.match(/^(##)\s+(.+)$/)
    if (match?.[2]) {
      const text = match[2].trim()
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
      tocEntries.push(`- [${text}](#${id})`)
    }
  }
  if (tocEntries.length === 0) return ''
  return `## Table of Contents\n\n${tocEntries.join('\n')}\n\n---\n\n`
}

/**
 * Registers Fabric.js-specific tools that go beyond the generic factories:
 *
 * - `fabricjs_get_api_page` — resolves class shorthand + auto-generates TOC
 * - `fabricjs_get_guide` — validates URL belongs to /docs/ section
 */
export function registerFabricJsTools(server: FastMCP, services: ProviderServices): void {
  server.addTool({
    name: 'fabricjs_get_api_page',
    description:
      `ALWAYS USE THIS TOOL when you need to list all properties, methods, or constructor signatures of a Fabric.js class. ` +
      `Pass either a full URL (https://fabricjs.com/api/classes/canvas/) or just the class name (e.g. "Canvas"). ` +
      `Known classes: ${KNOWN_CLASSES.join(', ')}. ` +
      `Returns the full TypeDoc API reference page as Markdown with a Table of Contents.`,
    parameters: z.object({
      target: z
        .string()
        .describe("Full URL or class name shorthand (e.g. 'Canvas', 'FabricObject')"),
      forceRefresh: z
        .boolean()
        .default(false)
        .describe('If true, bypass cache and fetch fresh content'),
    }),
    execute: async (params) => {
      const url = buildApiUrl(params.target)
      const { record, fromCache } = await services.scraper.scrapePage(url, params.forceRefresh)

      const toc = buildToc(record.markdown)
      const source = fromCache ? 'cached' : 'freshly scraped'

      return `# ${record.title}\n\n> Source: ${url} (${source})\n\n${toc}${record.markdown}`
    },
  })

  server.addTool({
    name: 'fabricjs_get_guide',
    description:
      'USE THIS TOOL to fetch a full guide or tutorial page from the Fabric.js /docs/ section. ' +
      'You must provide a fabricjs.com/docs/ URL. Returns the guide content as Markdown.',
    parameters: z.object({
      url: z.string().describe('A fabricjs.com/docs/ URL to fetch'),
      forceRefresh: z
        .boolean()
        .default(false)
        .describe('If true, bypass cache and fetch fresh content'),
    }),
    execute: async (params) => {
      if (!params.url.includes('fabricjs.com/docs/')) {
        return (
          'Invalid URL: this tool only accepts fabricjs.com/docs/ URLs. ' +
          'For API reference pages, use fabricjs_get_api_page instead.'
        )
      }

      const { record, fromCache } = await services.scraper.scrapePage(
        params.url,
        params.forceRefresh,
      )
      const source = fromCache ? 'cached' : 'freshly scraped'

      return `# ${record.title}\n\n> Source: ${params.url} (${source})\n\n${record.markdown}`
    },
  })
}
