import { z } from 'zod'
import type { FastMCP } from 'fastmcp'
import type { Provider, ProviderServices } from './provider.js'
import type { SearchResult, IndexEntry } from './types.js'
import { logger } from './logger.js'

/**
 * Generic tool factory functions.
 *
 * Each factory generates a fully-configured MCP tool with the provider's
 * ID as a name prefix and the provider's display name in descriptions.
 * Providers call these in their `registerTools()` method and can add
 * custom tools alongside them.
 */

/**
 * Creates `{id}_search` — searches across all provider sections simultaneously.
 */
export function createSearchTool(
  server: FastMCP,
  provider: Provider,
  { search }: ProviderServices,
): void {
  server.addTool({
    name: `${provider.id}_search`,
    description:
      `THIS IS THE ENTRY POINT when you are unsure whether the answer lives in a guide or in the API reference. ` +
      `Always call this tool first when the user asks anything about ${provider.name}. ` +
      `Searches all sections simultaneously and returns results grouped by section with snippets.`,
    parameters: z.object({
      query: z.string().describe(`Search query for ${provider.name} documentation`),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(10)
        .describe('Maximum number of results (default 10, max 30)'),
    }),
    execute: async (params) => {
      const results = await search.search(params.query, params.limit)

      // Group results by section
      const grouped = new Map<string, SearchResult[]>()
      for (const r of results) {
        const list = grouped.get(r.section) ?? []
        list.push(r)
        grouped.set(r.section, list)
      }

      const formatResults = (items: SearchResult[]): string => {
        if (items.length === 0) return '  No results found.\n'
        return items
          .map(
            (r) =>
              `  - **${r.title}** (${r.kind}, score: ${r.score})\n    ${r.url}\n    ${r.snippet}`,
          )
          .join('\n\n')
      }

      let output = ''
      for (const section of provider.sections) {
        const sectionResults = grouped.get(section.name) ?? []
        output += `## ${section.name.charAt(0).toUpperCase() + section.name.slice(1)}\n${formatResults(sectionResults)}\n\n`
      }

      return output.trim()
    },
  })
}

/**
 * Creates `{id}_search_{section}` — searches within a single section.
 */
export function createSectionSearchTool(
  server: FastMCP,
  provider: Provider,
  { search }: ProviderServices,
  sectionName: string,
): void {
  server.addTool({
    name: `${provider.id}_search_${sectionName}`,
    description:
      `USE THIS TOOL when you need to search specifically within the ${provider.name} ${sectionName} section. ` +
      `Returns matching pages with relevance scores and snippets.`,
    parameters: z.object({
      query: z.string().describe(`Search query for ${sectionName}`),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(8)
        .describe('Maximum number of results (default 8)'),
    }),
    execute: async (params) => {
      const results = await search.search(params.query, params.limit, sectionName)

      if (results.length === 0) {
        return `No ${sectionName} results found. Try a different query or run ${provider.id}_reindex to populate the cache.`
      }

      return results
        .map((r) => `- **${r.title}** (${r.kind}, score: ${r.score})\n  ${r.url}\n  ${r.snippet}`)
        .join('\n\n')
    },
  })
}

/**
 * Creates `{id}_list_index` — lists all cached pages grouped by kind.
 */
export function createListIndexTool(
  server: FastMCP,
  provider: Provider,
  { search }: ProviderServices,
): void {
  const sectionChoices = ['all', ...provider.sections.map((s) => s.name)] as [string, ...string[]]

  server.addTool({
    name: `${provider.id}_list_index`,
    description:
      `USE THIS TOOL to browse all cached ${provider.name} documentation pages grouped by kind. ` +
      `Useful for discovering what documentation is available.`,
    parameters: z.object({
      section: z
        .enum(sectionChoices)
        .default('all')
        .describe('Filter by section or show all'),
    }),
    execute: async (params) => {
      const entries = await search.listIndex(params.section)

      if (entries.length === 0) {
        return (
          `The search index is empty. No pages have been cached yet.\n\n` +
          `To populate the index, run the **${provider.id}_reindex** tool with section="all". ` +
          `This will crawl ${provider.name} and cache all documentation pages.`
        )
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
}

/**
 * Creates `{id}_reindex` — discovers and scrapes all pages, then rebuilds
 * the search index.
 */
export function createReindexTool(
  server: FastMCP,
  provider: Provider,
  { scraper, search, cache }: ProviderServices,
): void {
  const sectionChoices = ['all', ...provider.sections.map((s) => s.name)] as [string, ...string[]]

  server.addTool({
    name: `${provider.id}_reindex`,
    description:
      `USE THIS TOOL to crawl ${provider.name} documentation and rebuild the cache and search index. ` +
      `Call this when the cache is empty or when you need fresh documentation.`,
    parameters: z.object({
      section: z
        .enum(sectionChoices)
        .default('all')
        .describe('Which section to crawl, or all'),
      purgeFirst: z
        .boolean()
        .default(false)
        .describe('If true, purge the cache before re-crawling'),
    }),
    execute: async (params) => {
      if (params.purgeFirst) {
        const purged = await cache.purgeAll()
        logger.info('purged cache before reindex', { provider: provider.id, purged })
      }

      let urls: string[]
      try {
        urls = await provider.discoverUrls(
          params.section === 'all' ? undefined : params.section,
        )
      } catch (err) {
        logger.error('url discovery failed', { provider: provider.id, error: String(err) })
        return `## Reindex Failed\n\nURL discovery failed: ${String(err)}\n\nThe documentation site may be down. Try again later.`
      }
      const result = await scraper.batchScrape(urls)
      const indexCount = await search.buildIndex()

      return (
        `## Reindex Complete\n\n` +
        `- **Provider**: ${provider.name}\n` +
        `- **Section**: ${params.section}\n` +
        `- **URLs discovered**: ${urls.length}\n` +
        `- **Succeeded**: ${result.succeeded}\n` +
        `- **Failed**: ${result.failed}\n` +
        `- **Search index entries**: ${indexCount}`
      )
    },
  })
}

/**
 * Creates `{id}_cache_status` — reports cache and index health.
 */
export function createCacheStatusTool(
  server: FastMCP,
  provider: Provider,
  { cache, search }: ProviderServices,
): void {
  server.addTool({
    name: `${provider.id}_cache_status`,
    description:
      `USE THIS TOOL to check the health of the ${provider.name} documentation cache and search index. ` +
      `Shows cached page count, cache size, oldest entry, and index stats.`,
    parameters: z.object({}),
    execute: async () => {
      const stats = await cache.stats()
      const indexInfo = search.getIndexStats()

      const sizeKb = (stats.totalBytes / 1024).toFixed(1)
      const oldest = stats.oldestAt > 0 ? new Date(stats.oldestAt).toISOString() : 'N/A'
      const lastBuilt = indexInfo.lastBuiltAt
        ? new Date(indexInfo.lastBuiltAt).toISOString()
        : 'Not built yet'

      let output = `## ${provider.name} — Cache & Index Status\n\n`
      output += `| Metric | Value |\n|--------|-------|\n`
      output += `| Cached pages | ${stats.entries} |\n`
      output += `| Cache size | ${sizeKb} KB |\n`
      output += `| Oldest entry | ${oldest} |\n`
      output += `| Search index entries | ${indexInfo.count} |\n`
      output += `| Index last built | ${lastBuilt} |\n`

      if (stats.entries === 0) {
        output += `\n**The cache is empty.** Run \`${provider.id}_reindex\` with section="all" to populate it.`
      }

      return output
    },
  })
}
