import { z } from 'zod'
import type { FastMCP } from 'fastmcp'
import { search, listIndex, buildIndex, getIndexStats } from './search.service.js'
import { cacheStats, cachePurgeAll } from '../cache/cache.service.js'
import { discoverUrls, batchScrape } from '../scraper/scraper.service.js'
import { logger } from '../../shared/logger.js'
import type { SearchResult, IndexEntry } from '../../shared/types.js'

export function registerSearchTools(server: FastMCP): void {
  server.addTool({
    name: 'fabricjs_search',
    description:
      'THIS IS THE ENTRY POINT when you are unsure whether the answer lives in a guide or in the API reference. Always call this tool first when the user asks anything about Fabric.js. Searches both /api/ and /docs/ simultaneously and returns results grouped by section with snippets.',
    parameters: z.object({
      query: z.string().describe('Search query for Fabric.js documentation'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(10)
        .describe('Maximum number of results (default 10, max 30)'),
    }),
    execute: async (params) => {
      const results = await search(params.query, params.limit)

      const apiResults = results.filter((r) => r.section === 'api')
      const docsResults = results.filter((r) => r.section === 'docs')

      const formatResults = (items: SearchResult[]): string => {
        if (items.length === 0) return '  No results found.\n'
        return items
          .map(
            (r) =>
              `  - **${r.title}** (${r.kind}, score: ${r.score})\n    ${r.url}\n    ${r.snippet}`,
          )
          .join('\n\n')
      }

      return `## API Reference\n${formatResults(apiResults)}\n\n## Guides & Tutorials\n${formatResults(docsResults)}`
    },
  })

  server.addTool({
    name: 'fabricjs_list_index',
    description:
      'USE THIS TOOL to browse all cached Fabric.js documentation pages grouped by kind (class, interface, type-alias, function, guide, etc.). Useful for discovering what documentation is available.',
    parameters: z.object({
      section: z
        .enum(['api', 'docs', 'all'])
        .default('all')
        .describe('Filter by section: api, docs, or all'),
    }),
    execute: async (params) => {
      const entries = await listIndex(params.section)

      if (entries.length === 0) {
        return 'The search index is empty. No pages have been cached yet.\n\nTo populate the index, run the **fabricjs_reindex** tool with section="all". This will crawl fabricjs.com and cache all documentation pages.'
      }

      const grouped = new Map<string, IndexEntry[]>()
      for (const entry of entries) {
        const list = grouped.get(entry.kind) ?? []
        list.push(entry)
        grouped.set(entry.kind, list)
      }

      let output = `## Cached Pages (${entries.length} total)\n\n`
      for (const [kind, items] of grouped) {
        output += `### ${kind} (${items.length})\n`
        for (const item of items) {
          output += `- [${item.title}](${item.url})\n`
        }
        output += '\n'
      }
      return output
    },
  })

  server.addTool({
    name: 'fabricjs_reindex',
    description:
      'USE THIS TOOL to crawl fabricjs.com and rebuild the cache and search index. Call this when the cache is empty or when you need fresh documentation. This may take a few minutes depending on the number of pages.',
    parameters: z.object({
      section: z
        .enum(['api', 'docs', 'all'])
        .default('all')
        .describe('Which section to crawl: api, docs, or all'),
      purgeFirst: z
        .boolean()
        .default(false)
        .describe('If true, purge the cache before re-crawling'),
    }),
    execute: async (params) => {
      if (params.purgeFirst) {
        const purged = await cachePurgeAll()
        logger.info('purged cache before reindex', { purged })
      }

      const urls = await discoverUrls(params.section)
      const result = await batchScrape(urls)
      const indexCount = await buildIndex()

      return `## Reindex Complete\n\n- **Section**: ${params.section}\n- **URLs discovered**: ${urls.length}\n- **Succeeded**: ${result.succeeded}\n- **Failed**: ${result.failed}\n- **Search index entries**: ${indexCount}`
    },
  })

  server.addTool({
    name: 'fabricjs_cache_status',
    description:
      'USE THIS TOOL to check the health of the documentation cache and search index. Shows cached page count, cache size, oldest entry, and index stats. Call this before searching to verify the cache is populated.',
    parameters: z.object({}),
    execute: async () => {
      const stats = await cacheStats()
      const indexInfo = getIndexStats()

      const sizeKb = (stats.totalBytes / 1024).toFixed(1)
      const oldest = stats.oldestAt > 0 ? new Date(stats.oldestAt).toISOString() : 'N/A'
      const lastBuilt = indexInfo.lastBuiltAt
        ? new Date(indexInfo.lastBuiltAt).toISOString()
        : 'Not built yet'

      let output = `## Cache & Index Status\n\n`
      output += `| Metric | Value |\n|--------|-------|\n`
      output += `| Cached pages | ${stats.entries} |\n`
      output += `| Cache size | ${sizeKb} KB |\n`
      output += `| Oldest entry | ${oldest} |\n`
      output += `| Search index entries | ${indexInfo.count} |\n`
      output += `| Index last built | ${lastBuilt} |\n`

      if (stats.entries === 0) {
        output +=
          '\n**The cache is empty.** Run `fabricjs_reindex` with section="all" to populate it.'
      }

      return output
    },
  })
}
