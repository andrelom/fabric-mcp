import { readFile, writeFile, unlink, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { urlToHash, hashToPath } from '../../core/hash.js'
import { logger } from '../../core/logger.js'
import type { CacheEntry, CacheGetResult, CacheStatsResult, ICacheService } from '../../core/types.js'

/**
 * Bolt-style filesystem cache scoped to a single provider.
 *
 * Each URL is hashed (SHA-256) and stored in a two-level directory
 * tree: `{cacheDir}/{aa}/{bb}/{rest}.json`. Each JSON file is a
 * self-describing {@link CacheEntry} with an embedded TTL.
 */
export class CacheService implements ICacheService {
  constructor(
    private readonly cacheDir: string,
    private readonly defaultTtl: number,
  ) {}

  async get<T>(url: string): Promise<CacheGetResult<T>> {
    const filePath = this.pathForUrl(url)
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

  async set<T>(url: string, data: T, ttlSeconds?: number): Promise<void> {
    const filePath = this.pathForUrl(url)
    const entry: CacheEntry<T> = {
      data,
      storedAt: Date.now(),
      ttlSeconds: ttlSeconds ?? this.defaultTtl,
    }
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8')
    logger.debug('cache set', { url, path: filePath })
  }

  async delete(url: string): Promise<void> {
    const filePath = this.pathForUrl(url)
    try {
      await unlink(filePath)
      logger.debug('cache delete', { url })
    } catch {
      // file didn't exist — that's fine
    }
  }

  async stats(): Promise<CacheStatsResult> {
    const files = await this.walkJsonFiles(this.cacheDir)
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

  async purgeAll(): Promise<number> {
    const files = await this.walkJsonFiles(this.cacheDir)
    let count = 0
    for (const f of files) {
      try {
        await unlink(f)
        count++
      } catch {
        // skip
      }
    }
    logger.info('cache purged', { dir: this.cacheDir, count })
    return count
  }

  async readAll<T>(): Promise<CacheEntry<T>[]> {
    const files = await this.walkJsonFiles(this.cacheDir)
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

  private pathForUrl(url: string): string {
    const hash = urlToHash(url)
    return hashToPath(this.cacheDir, hash)
  }

  private async walkJsonFiles(dir: string): Promise<string[]> {
    const results: string[] = []
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          results.push(...(await this.walkJsonFiles(full)))
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          results.push(full)
        }
      }
    } catch {
      // directory doesn't exist yet
    }
    return results
  }
}
