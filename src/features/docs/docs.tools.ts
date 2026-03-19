import { z } from 'zod'
import type { FastMCP } from 'fastmcp'
import { scrapePage } from '../scraper/scraper.service.js'
import { search } from '../search/search.service.js'

export function registerDocsTools(server: FastMCP): void {
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
        throw new Error(
          'Invalid URL: this tool only accepts fabricjs.com/docs/ URLs. ' +
            'For API reference pages, use fabricjs_get_api_page instead.',
        )
      }

      const { record, fromCache } = await scrapePage(params.url, params.forceRefresh)
      const source = fromCache ? 'cached' : 'freshly scraped'

      return `# ${record.title}\n\n> Source: ${params.url} (${source})\n\n${record.markdown}`
    },
  })

  server.addTool({
    name: 'fabricjs_search_docs',
    description:
      'USE THIS TOOL when you need to search specifically within Fabric.js guides and tutorials (/docs/ section only). ' +
      'Returns matching guide pages with relevance scores and snippets.',
    parameters: z.object({
      query: z.string().describe('Search query for guides and tutorials'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(8)
        .describe('Maximum number of results (default 8)'),
    }),
    execute: async (params) => {
      const results = await search(params.query, params.limit, 'docs')

      if (results.length === 0) {
        return 'No guide/tutorial results found. Try a different query or run fabricjs_reindex to populate the cache.'
      }

      return results
        .map((r) => `- **${r.title}** (${r.kind}, score: ${r.score})\n  ${r.url}\n  ${r.snippet}`)
        .join('\n\n')
    },
  })
}
