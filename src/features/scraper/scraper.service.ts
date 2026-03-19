import { config } from '../../shared/config.js'
import { logger } from '../../shared/logger.js'
import type { PageRecord, ScrapeResult, BatchScrapeResult, Section } from '../../shared/types.js'
import { cacheGet, cacheSet } from '../cache/cache.service.js'
import { openPage } from './browser.service.js'
import { fetchStage } from './stages/fetch.stage.js'
import { extractStage } from './stages/extract.stage.js'
import { transformStage } from './stages/transform.stage.js'

export async function scrapePage(url: string, forceRefresh = false): Promise<ScrapeResult> {
  if (!forceRefresh) {
    const cached = await cacheGet<PageRecord>(url)
    if (cached.status === 'hit' && cached.data) {
      logger.debug('cache hit', { url })
      return { record: cached.data, fromCache: true }
    }
  }

  const raw = await fetchStage(url)
  const extracted = extractStage(raw)
  const record = transformStage(extracted)
  await cacheSet(url, record)
  return { record, fromCache: false }
}

export async function discoverUrls(section: 'api' | 'docs' | 'all'): Promise<string[]> {
  const urls = new Set<string>()

  const discover = async (indexUrl: string, prefix: string) => {
    const page = await openPage(indexUrl)
    try {
      const hrefs = await page.$$eval(`nav a[href^="/${prefix}/"]`, (anchors) =>
        anchors.map((a) => a.getAttribute('href') ?? ''),
      )
      for (const href of hrefs) {
        if (!href) continue
        // Strip anchors
        const clean = href.split('#')[0]
        // Skip the index page itself
        if (clean === `/${prefix}/` || clean === `/${prefix}`) continue
        const full = `${config.fabricjs.baseUrl}${clean}`
        urls.add(full.endsWith('/') ? full : full + '/')
      }
    } finally {
      await page.close()
    }
  }

  if (section === 'api' || section === 'all') {
    await discover(config.fabricjs.apiUrl, 'api')
  }
  if (section === 'docs' || section === 'all') {
    await discover(config.fabricjs.docsUrl, 'docs')
  }

  const result = [...urls]
  logger.info('discovered urls', { section, count: result.length })
  return result
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function batchScrape(
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<BatchScrapeResult> {
  let succeeded = 0
  let failed = 0
  const total = urls.length
  const concurrency = config.scraper.concurrency

  for (let i = 0; i < total; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const results = await Promise.allSettled(batch.map((url) => scrapePage(url, true)))

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
      await delay(config.scraper.delayMs)
    }
  }

  logger.info('batch scrape complete', { succeeded, failed, total })
  return { succeeded, failed }
}
