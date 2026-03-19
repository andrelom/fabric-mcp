import { logger } from '../../shared/logger.js'
import type {
  PageRecord,
  CacheEntry,
  IndexDoc,
  IndexEntry,
  SearchResult,
  IndexStats,
  Section,
} from '../../shared/types.js'
import { cacheReadAll } from '../cache/cache.service.js'

let index: IndexDoc[] = []
let lastBuiltAt: number | null = null

function inferKind(url: string): string {
  if (url.includes('/api/classes/')) return 'class'
  if (url.includes('/api/interfaces/')) return 'interface'
  if (url.includes('/api/type-aliases/')) return 'type-alias'
  if (url.includes('/api/functions/')) return 'function'
  if (url.includes('/api/variables/')) return 'variable'
  if (url.includes('/api/namespaces/')) return 'namespace'
  if (url.includes('/docs/')) return 'guide'
  return 'other'
}

export async function buildIndex(): Promise<number> {
  const entries = await cacheReadAll<PageRecord>()
  index = entries.map((entry) => {
    const d = entry.data
    const headingsText = d.headings.map((h) => h.text).join(' ')
    const bodySnippet = d.markdown.slice(0, 3000)
    return {
      url: d.url,
      title: d.title,
      section: d.section,
      kind: inferKind(d.url),
      text: `${d.title} ${headingsText} ${bodySnippet}`.toLowerCase(),
    }
  })
  lastBuiltAt = Date.now()
  logger.info('search index built', { count: index.length })
  return index.length
}

async function ensureIndex(): Promise<void> {
  if (index.length === 0 && lastBuiltAt === null) {
    await buildIndex()
  }
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

function extractSnippet(text: string, tokens: string[]): string {
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

export async function search(
  query: string,
  limit = 10,
  section?: Section,
): Promise<SearchResult[]> {
  await ensureIndex()
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const scored: Array<{ doc: IndexDoc; score: number }> = []

  for (const doc of index) {
    if (section && doc.section !== section) continue

    let score = 0
    const titleLower = doc.title.toLowerCase()
    const urlLower = doc.url.toLowerCase()

    for (const token of tokens) {
      // Title match: +5
      if (titleLower.includes(token)) score += 5
      // URL segment match: +3
      if (urlLower.includes(token)) score += 3
      // Body occurrence count
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
    snippet: extractSnippet(doc.text, tokens),
  }))
}

export async function listIndex(section?: 'api' | 'docs' | 'all'): Promise<IndexEntry[]> {
  await ensureIndex()
  return index
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

export function getIndexStats(): IndexStats {
  return {
    count: index.length,
    lastBuiltAt,
  }
}
