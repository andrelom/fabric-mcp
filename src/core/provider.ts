import type { FastMCP } from 'fastmcp'
import type { ICacheService, IScraperService, ISearchService } from './types.js'

/**
 * Describes a navigable section of a documentation site.
 *
 * Each section maps to a URL path prefix (e.g. `/api/`, `/docs/`) and
 * is used for discovery, caching, and filtering search results.
 */
export interface ProviderSection {
  /** Human-readable section label (e.g. `'api'`, `'docs'`). */
  name: string
  /** Full URL to the section index page used for link discovery. */
  indexUrl: string
  /** URL path prefix used to match links during discovery (e.g. `'api'`). */
  urlPrefix: string
}

/**
 * Infrastructure services injected into a provider at registration time.
 *
 * Each provider receives its own scoped instances — the cache writes
 * to an isolated subdirectory, and the search index is independent.
 */
export interface ProviderServices {
  cache: ICacheService
  scraper: IScraperService
  search: ISearchService
}

/**
 * Configuration for the HTML → Markdown extraction stage.
 *
 * Providers supply this to control how raw HTML is parsed into
 * structured Markdown content.
 */
export interface ExtractionConfig {
  /** CSS selector for the main content element (e.g. `'div.sl-markdown-content'`). */
  contentSelector: string
  /** Base URL used to resolve relative links to absolute URLs. */
  baseUrl: string
  /** Maps a page URL to its section name (e.g. `'api'` or `'docs'`). */
  detectSection: (url: string) => string
}

/**
 * The core contract every documentation provider must implement.
 *
 * A provider encapsulates all knowledge about a specific documentation site:
 * its URL structure, how to discover pages, how to classify them, and what
 * MCP tools and prompts to expose. The framework handles scraping, caching,
 * indexing, and serving — providers just describe *what* and *where*.
 *
 * ## Adding a new provider
 *
 * 1. Create a folder under `src/providers/{id}/`
 * 2. Implement this interface as the default export of `index.ts`
 * 3. The server auto-discovers and registers providers at startup
 *
 * @example
 * ```ts
 * // src/providers/mylib/index.ts
 * import type { Provider } from '../../core/provider.js'
 *
 * const provider: Provider = {
 *   id: 'mylib',
 *   name: 'MyLib',
 *   baseUrl: 'https://mylib.dev',
 *   sections: [{ name: 'docs', indexUrl: 'https://mylib.dev/docs/', urlPrefix: 'docs' }],
 *   // ... implement remaining methods
 * }
 *
 * export default provider
 * ```
 */
export interface Provider {
  /** Unique slug used for tool prefixing and cache isolation (e.g. `'fabricjs'`). */
  id: string

  /** Human-readable display name (e.g. `'Fabric.js'`). */
  name: string

  /** Root URL of the documentation site (e.g. `'https://fabricjs.com'`). */
  baseUrl: string

  /** Navigable documentation sections to scrape and index. */
  sections: ProviderSection[]

  /** Configuration for the HTML extraction stage. */
  extraction: ExtractionConfig

  /**
   * Resolves a user-friendly shorthand to a full URL.
   *
   * For example, `'Canvas'` → `'https://fabricjs.com/api/classes/canvas/'`.
   * Return `null` if the target is not a recognized shorthand.
   */
  resolveTarget(target: string): string | null

  /**
   * Classifies a page URL into a kind label for the search index.
   *
   * @returns A kind string like `'class'`, `'guide'`, `'function'`, etc.
   */
  classifyPage(url: string): string

  /**
   * Checks whether a URL belongs to this provider's documentation site.
   */
  ownsUrl(url: string): boolean

  /**
   * Discovers all scrapable URLs for the given section (or all sections).
   *
   * Called during reindex to build the list of pages to crawl.
   */
  discoverUrls(section?: string): Promise<string[]>

  /**
   * Optional post-processing hook for Markdown output.
   *
   * Called after the generic transform stage. Use this to apply
   * provider-specific cleanups (e.g. stripping TypeDoc backlinks).
   */
  transformMarkdown?(markdown: string): string

  /**
   * Registers provider-specific MCP tools on the server.
   *
   * Use the generic tool factories from `core/tool-factories.ts` for
   * standard tools (search, reindex, cache status), and add custom
   * tools for provider-specific functionality.
   */
  registerTools(server: FastMCP, services: ProviderServices): void

  /**
   * Registers provider-specific MCP prompts on the server.
   */
  registerPrompts(server: FastMCP): void
}
