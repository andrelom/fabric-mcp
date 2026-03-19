import { readFile, writeFile, unlink, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { config } from '../../shared/config.js'
import { urlToHash, hashToPath } from '../../shared/hash.js'
import { logger } from '../../shared/logger.js'
import type { CacheEntry, CacheGetResult, CacheStatsResult } from '../../shared/types.js'

function pathForUrl(url: string): string {
  const hash = urlToHash(url)
  return hashToPath(config.cache.dir, hash)
}

export async function cacheGet<T>(url: string): Promise<CacheGetResult<T>> {
  const filePath = pathForUrl(url)
  try {
    const raw = await readFile(filePath, 'utf-8')
    const entry = JSON.parse(raw) as CacheEntry<T>
    const age = (Date.now() - entry.storedAt) / 1000
    if (age > entry.ttlSeconds) {
      return { status: 'stale', data: entry.data }
    }
    return { status: 'hit', data: entry.data }
  } catch {
    return { status: 'miss', data: null }
  }
}

export async function cacheSet<T>(url: string, data: T, ttlSeconds?: number): Promise<void> {
  const filePath = pathForUrl(url)
  const entry: CacheEntry<T> = {
    data,
    storedAt: Date.now(),
    ttlSeconds: ttlSeconds ?? config.cache.ttlSeconds,
  }
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8')
  logger.debug('cache set', { url, path: filePath })
}

export async function cacheDelete(url: string): Promise<void> {
  const filePath = pathForUrl(url)
  try {
    await unlink(filePath)
    logger.debug('cache delete', { url })
  } catch {
    // file didn't exist — that's fine
  }
}

async function walkJsonFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...(await walkJsonFiles(full)))
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        results.push(full)
      }
    }
  } catch {
    // directory doesn't exist yet
  }
  return results
}

export async function cacheStats(): Promise<CacheStatsResult> {
  const files = await walkJsonFiles(config.cache.dir)
  let totalBytes = 0
  let oldestAt = Infinity

  for (const f of files) {
    try {
      const s = await stat(f)
      totalBytes += s.size
      if (s.mtimeMs < oldestAt) oldestAt = s.mtimeMs
    } catch {
      // skip unreadable files
    }
  }

  return {
    entries: files.length,
    totalBytes,
    oldestAt: files.length > 0 ? oldestAt : 0,
  }
}

export async function cachePurgeAll(): Promise<number> {
  const files = await walkJsonFiles(config.cache.dir)
  let count = 0
  for (const f of files) {
    try {
      await unlink(f)
      count++
    } catch {
      // skip
    }
  }
  logger.info('cache purged', { count })
  return count
}

export async function cacheReadAll<T>(): Promise<CacheEntry<T>[]> {
  const files = await walkJsonFiles(config.cache.dir)
  const entries: CacheEntry<T>[] = []
  for (const f of files) {
    try {
      const raw = await readFile(f, 'utf-8')
      entries.push(JSON.parse(raw) as CacheEntry<T>)
    } catch {
      // skip corrupt files
    }
  }
  return entries
}
