import { JSDOM } from 'jsdom'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'

export async function httpFetchPage(url: string): Promise<string> {
  logger.debug('http fetch', { url })

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'documentation-mcp/1.0 (documentation indexer)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(config.scraper.timeoutMs),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }

  return res.text()
}

/**
 * Discovers URLs from an index page by matching `<nav>` anchor links.
 *
 * @param indexUrl - The full URL of the section index page.
 * @param prefix - The path prefix to filter anchors (e.g. `'api'`).
 * @param baseUrl - The site's base URL for resolving relative hrefs.
 */
export async function httpDiscoverUrls(
  indexUrl: string,
  prefix: string,
  baseUrl: string,
): Promise<string[]> {
  let html: string
  try {
    html = await httpFetchPage(indexUrl)
  } catch (err) {
    logger.warn('failed to fetch index page for discovery', { indexUrl, error: String(err) })
    return []
  }
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const anchors = doc.querySelectorAll<HTMLAnchorElement>(`nav a[href^="/${prefix}/"]`)
  const urls = new Set<string>()

  for (const a of anchors) {
    const href = a.getAttribute('href')
    if (!href) continue

    const clean = href.split('#')[0]
    if (clean === `/${prefix}/` || clean === `/${prefix}`) continue

    const full = `${baseUrl}${clean}`
    urls.add(full.endsWith('/') ? full : full + '/')
  }

  logger.info('http discovered urls', { indexUrl, count: urls.size })
  return [...urls]
}
