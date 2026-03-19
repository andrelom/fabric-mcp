import { config } from '../../shared/config.js'
import { logger } from '../../shared/logger.js'
import type { PageRecord, ScrapeResult, BatchScrapeResult, Section } from '../../shared/types.js'
import { cacheGet, cacheSet } from '../cache/cache.service.js'
import { fetchStageHttp } from './stages/fetch.stage.js'
import { extractStage } from './stages/extract.stage.js'
import { transformStage } from './stages/transform.stage.js'
import { httpDiscoverUrls } from './http.service.js'

async function fetchPage(url: string) {
  if (config.scraper.usePlaywright) {
    const { fetchStage } = await import('./stages/fetch.stage.js')
    return fetchStage(url)
  }
  return fetchStageHttp(url)
}

export async function scrapePage(url: string, forceRefresh = false): Promise<ScrapeResult> {
  if (!forceRefresh) {
    const cached = await cacheGet<PageRecord>(url)
    if (cached.status === 'hit' && cached.data) {
      logger.debug('cache hit', { url })
      return { record: cached.data, fromCache: true }
    }
  }

  const raw = await fetchPage(url)
  const extracted = extractStage(raw)
  const record = transformStage(extracted)
  await cacheSet(url, record)
  return { record, fromCache: false }
}

async function discoverPlaywright(
  indexUrl: string,
  prefix: string,
): Promise<string[]> {
  const { openPage } = await import('./browser.service.js')
  const page = await openPage(indexUrl)
  try {
    const hrefs = await page.$$eval(`nav a[href^="/${prefix}/"]`, (anchors) =>
      anchors.map((a) => a.getAttribute('href') ?? ''),
    )
    const urls: string[] = []
    for (const href of hrefs) {
      if (!href) continue
      const clean = href.split('#')[0]
      if (clean === `/${prefix}/` || clean === `/${prefix}`) continue
      const full = `${config.fabricjs.baseUrl}${clean}`
      urls.push(full.endsWith('/') ? full : full + '/')
    }
    return urls
  } finally {
    await page.close()
  }
}

export async function discoverUrls(section: 'api' | 'docs' | 'all'): Promise<string[]> {
  const urls = new Set<string>()

  const discover = config.scraper.usePlaywright
    ? discoverPlaywright
    : httpDiscoverUrls

  if (section === 'api' || section === 'all') {
    for (const u of await discover(config.fabricjs.apiUrl, 'api')) urls.add(u)
  }
  if (section === 'docs' || section === 'all') {
    for (const u of await discover(config.fabricjs.docsUrl, 'docs')) urls.add(u)
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
