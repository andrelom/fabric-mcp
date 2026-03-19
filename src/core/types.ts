export interface RawPage {
  url: string
  html: string
  fetchedAt: number
}

export interface Heading {
  level: number
  text: string
  id: string
}

export interface ExtractedPage {
  url: string
  title: string
  section: string
  markdown: string
  headings: Heading[]
  fetchedAt: number
}

export interface PageRecord extends ExtractedPage {
  hash: string
}

export interface CacheEntry<T> {
  data: T
  storedAt: number
  ttlSeconds: number
}

export type CacheStatus = 'hit' | 'miss' | 'stale'

export interface CacheGetResult<T> {
  status: CacheStatus
  data: T | null
}

export interface CacheStatsResult {
  entries: number
  totalBytes: number
  oldestAt: number
}

export interface SearchResult {
  url: string
  title: string
  section: string
  kind: string
  score: number
  snippet: string
}

export interface IndexEntry {
  url: string
  title: string
  section: string
  kind: string
}

export interface IndexDoc {
  url: string
  title: string
  section: string
  kind: string
  text: string
}

export interface DocPageResult {
  url: string
  title: string
  markdown: string
  toc: string
  fromCache: boolean
}

export interface ScrapeResult {
  record: PageRecord
  fromCache: boolean
}

export interface BatchScrapeResult {
  succeeded: number
  failed: number
}

export interface IndexStats {
  count: number
  lastBuiltAt: number | null
}

// --- Service interfaces (core contracts implemented by infrastructure) ---

/**
 * Filesystem cache scoped to a single provider.
 */
export interface ICacheService {
  get<T>(url: string): Promise<CacheGetResult<T>>
  set<T>(url: string, data: T, ttlSeconds?: number): Promise<void>
  delete(url: string): Promise<void>
  stats(): Promise<CacheStatsResult>
  purgeAll(): Promise<number>
  readAll<T>(): Promise<CacheEntry<T>[]>
}

/**
 * Scraping pipeline scoped to a single provider.
 */
export interface IScraperService {
  scrapePage(url: string, forceRefresh?: boolean): Promise<ScrapeResult>
  batchScrape(
    urls: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<BatchScrapeResult>
}

/**
 * In-memory search index scoped to a single provider.
 */
export interface ISearchService {
  search(query: string, limit?: number, section?: string): Promise<SearchResult[]>
  listIndex(section?: string): Promise<IndexEntry[]>
  buildIndex(): Promise<number>
  getIndexStats(): IndexStats
}
