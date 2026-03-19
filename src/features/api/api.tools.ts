import { z } from 'zod'
import type { FastMCP } from 'fastmcp'
import { config } from '../../shared/config.js'
import { scrapePage } from '../scraper/scraper.service.js'
import { search } from '../search/search.service.js'

const KNOWN_CLASSES = [
  'ActiveSelection',
  'BaseBrush',
  'Canvas',
  'Circle',
  'CircleBrush',
  'Color',
  'Control',
  'Ellipse',
  'FabricImage',
  'FabricObject',
  'FabricText',
  'Gradient',
  'Group',
  'IText',
  'InteractiveFabricObject',
  'Intersection',
  'LayoutManager',
  'Line',
  'Observable',
  'Path',
  'Pattern',
  'PatternBrush',
  'PencilBrush',
  'Point',
  'Polygon',
  'Polyline',
  'Rect',
  'Shadow',
  'SprayBrush',
  'StaticCanvas',
  'Textbox',
  'Triangle',
  'WebGLFilterBackend',
]

function buildApiUrl(target: string): string {
  if (target.startsWith('http')) return target
  const name = target.toLowerCase()
  return `${config.fabricjs.baseUrl}/api/classes/${name}/`
}

function buildToc(markdown: string): string {
  const lines = markdown.split('\n')
  const tocEntries: string[] = []
  for (const line of lines) {
    const match = line.match(/^(##)\s+(.+)$/)
    if (match && match[2]) {
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

export function registerApiTools(server: FastMCP): void {
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
      const { record, fromCache } = await scrapePage(url, params.forceRefresh)

      const toc = buildToc(record.markdown)
      const source = fromCache ? 'cached' : 'freshly scraped'

      return `# ${record.title}\n\n> Source: ${url} (${source})\n\n${toc}${record.markdown}`
    },
  })

  server.addTool({
    name: 'fabricjs_search_api',
    description:
      'USE THIS TOOL when you need to search specifically within the Fabric.js API reference (/api/ section only). ' +
      'Returns matching API pages with relevance scores and snippets.',
    parameters: z.object({
      query: z.string().describe('Search query for the API reference'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(8)
        .describe('Maximum number of results (default 8)'),
    }),
    execute: async (params) => {
      const results = await search(params.query, params.limit, 'api')

      if (results.length === 0) {
        return 'No API reference results found. Try a different query or run fabricjs_reindex to populate the cache.'
      }

      return results
        .map((r) => `- **${r.title}** (${r.kind}, score: ${r.score})\n  ${r.url}\n  ${r.snippet}`)
        .join('\n\n')
    },
  })
}
