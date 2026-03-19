import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import type { Provider } from '../../core/provider.js'
import type { PageRecord, ScrapeResult, BatchScrapeResult, IScraperService } from '../../core/types.js'
import type { CacheService } from '../cache/cache.service.js'
import { fetchStageHttp } from './stages/fetch.stage.js'
import { extractStage } from './stages/extract.stage.js'
import { transformStage } from './stages/transform.stage.js'

/**
 * Scraping pipeline scoped to a single provider.
 *
 * Orchestrates the fetch → extract → transform stages using the
 * provider's extraction config and optional Markdown transform hook.
 */
export class ScraperService implements IScraperService {
  constructor(
    private readonly provider: Provider,
    private readonly cache: CacheService,
  ) {}

  async scrapePage(url: string, forceRefresh = false): Promise<ScrapeResult> {
    if (!forceRefresh) {
      const cached = await this.cache.get<PageRecord>(url)
      if (cached.status === 'hit' && cached.data) {
        logger.debug('cache hit', { url })
        return { record: cached.data, fromCache: true }
      }
    }

    const raw = await this.fetchPage(url)
    const extracted = extractStage(raw, this.provider.extraction)
    const record = transformStage(extracted, this.provider.transformMarkdown?.bind(this.provider))
    await this.cache.set(url, record)
    return { record, fromCache: false }
  }

  async batchScrape(
    urls: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<BatchScrapeResult> {
    let succeeded = 0
    let failed = 0
    const total = urls.length
    const concurrency = config.scraper.concurrency

    for (let i = 0; i < total; i += concurrency) {
      const batch = urls.slice(i, i + concurrency)
      const results = await Promise.allSettled(batch.map((url) => this.scrapePage(url, true)))

      for (const r of results) {
        if (r.status === 'fulfilled') {
          succeeded++
        } else {
          failed++
          logger.warn('scrape failed', { error: String(r.reason) })
        }
      }

      onProgress?.(succeeded + failed, total)

      if (i + concurrency < total) {
        await this.delay(config.scraper.delayMs)
      }
    }

    logger.info('batch scrape complete', { provider: this.provider.id, succeeded, failed, total })
    return { succeeded, failed }
  }

  private async fetchPage(url: string) {
    if (config.scraper.usePlaywright) {
      const { fetchStage } = await import('./stages/fetch.stage.js')
      return fetchStage(url)
    }
    return fetchStageHttp(url)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
