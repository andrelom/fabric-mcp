import { logger } from '../../core/logger.js'
import type {
  PageRecord,
  IndexDoc,
  IndexEntry,
  SearchResult,
  IndexStats,
  ISearchService,
} from '../../core/types.js'
import type { CacheService } from '../cache/cache.service.js'

/**
 * In-memory search index scoped to a single provider.
 *
 * Built lazily from cached {@link PageRecord} entries. Uses simple
 * TF-scoped scoring: title matches get +5, URL matches +3, and
 * body occurrences +1 each.
 */
export class SearchService implements ISearchService {
  private index: IndexDoc[] = []
  private lastBuiltAt: number | null = null

  constructor(
    private readonly cache: CacheService,
    private readonly kindClassifier: (url: string) => string,
  ) {}

  async buildIndex(): Promise<number> {
    const entries = await this.cache.readAll<PageRecord>()
    this.index = entries.map((entry) => {
      const d = entry.data
      const headingsText = d.headings.map((h) => h.text).join(' ')
      const bodySnippet = d.markdown.slice(0, 3000)
      return {
        url: d.url,
        title: d.title,
        section: d.section,
        kind: this.kindClassifier(d.url),
        text: `${d.title} ${headingsText} ${bodySnippet}`.toLowerCase(),
      }
    })
    this.lastBuiltAt = Date.now()
    logger.info('search index built', { count: this.index.length })
    return this.index.length
  }

  async search(
    query: string,
    limit = 10,
    section?: string,
  ): Promise<SearchResult[]> {
    await this.ensureIndex()
    const tokens = this.tokenize(query)
    if (tokens.length === 0) return []

    const scored: Array<{ doc: IndexDoc; score: number }> = []

    for (const doc of this.index) {
      if (section && doc.section !== section) continue

      let score = 0
      const titleLower = doc.title.toLowerCase()
      const urlLower = doc.url.toLowerCase()

      for (const token of tokens) {
        if (titleLower.includes(token)) score += 5
        if (urlLower.includes(token)) score += 3

        let pos = 0
        let count = 0
        while ((pos = doc.text.indexOf(token, pos)) !== -1) {
          count++
          pos += token.length
        }
        score += count
      }

      if (score > 0) {
        scored.push({ doc, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)

    return scored.slice(0, limit).map(({ doc, score }) => ({
      url: doc.url,
      title: doc.title,
      section: doc.section,
      kind: doc.kind,
      score,
      snippet: this.extractSnippet(doc.text, tokens),
    }))
  }

  async listIndex(section?: string): Promise<IndexEntry[]> {
    await this.ensureIndex()
    return this.index
      .filter((doc) => {
        if (!section || section === 'all') return true
        return doc.section === section
      })
      .map((doc) => ({
        url: doc.url,
        title: doc.title,
        section: doc.section,
        kind: doc.kind,
      }))
  }

  getIndexStats(): IndexStats {
    return {
      count: this.index.length,
      lastBuiltAt: this.lastBuiltAt,
    }
  }

  private async ensureIndex(): Promise<void> {
    if (this.index.length === 0 && this.lastBuiltAt === null) {
      await this.buildIndex()
    }
  }

  private tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0)
  }

  private extractSnippet(text: string, tokens: string[]): string {
    const lower = text.toLowerCase()
    let bestPos = 0
    for (const token of tokens) {
      const idx = lower.indexOf(token)
      if (idx !== -1) {
        bestPos = idx
        break
      }
    }
    const start = Math.max(0, bestPos - 80)
    const end = Math.min(text.length, bestPos + 120)
    let snippet = text.slice(start, end).replace(/\n/g, ' ').trim()
    if (start > 0) snippet = '…' + snippet
    if (end < text.length) snippet = snippet + '…'
    return snippet
  }
}
