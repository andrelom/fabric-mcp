import { JSDOM } from 'jsdom'
import { config } from '../../shared/config.js'
import { logger } from '../../shared/logger.js'

export async function httpFetchPage(url: string): Promise<string> {
  logger.debug('http fetch', { url })

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'fabric-mcp/1.0 (documentation indexer)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(config.scraper.timeoutMs),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }

  return res.text()
}

export async function httpDiscoverUrls(
  indexUrl: string,
  prefix: string,
): Promise<string[]> {
  const html = await httpFetchPage(indexUrl)
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const anchors = doc.querySelectorAll<HTMLAnchorElement>(`nav a[href^="/${prefix}/"]`)
  const urls = new Set<string>()

  for (const a of anchors) {
    const href = a.getAttribute('href')
    if (!href) continue

    const clean = href.split('#')[0]
    if (clean === `/${prefix}/` || clean === `/${prefix}`) continue

    const full = `${config.fabricjs.baseUrl}${clean}`
    urls.add(full.endsWith('/') ? full : full + '/')
  }

  logger.info('http discovered urls', { indexUrl, count: urls.size })
  return [...urls]
}
