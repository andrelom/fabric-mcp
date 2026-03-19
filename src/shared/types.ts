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

export type Section = 'api' | 'docs'

export interface ExtractedPage {
  url: string
  title: string
  section: Section
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
  section: Section
  kind: string
  score: number
  snippet: string
}

export interface IndexEntry {
  url: string
  title: string
  section: Section
  kind: string
}

export interface IndexDoc {
  url: string
  title: string
  section: Section
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
